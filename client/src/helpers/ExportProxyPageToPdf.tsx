import { API_BASE } from "@/constants";
import type { CardOption } from "../../../shared/types";
import { PDFDocument } from "pdf-lib";
import { db, type PdfExportSession } from "../db";
import { AsyncLock } from "./AsyncLock";

/**
 * Worker event types for coordinator pattern
 */
type WorkerEvent =
  | { type: 'WORKER_READY'; workerId: number }
  | { type: 'PAGE_COMPLETE'; pageIndex: number; url: string }
  | { type: 'PROGRESS'; pageIndex: number; imagesProcessed: number }
  | { type: 'ERROR'; error: Error; pageIndex?: number };

interface WorkerInfo {
  worker: Worker;
  busy: boolean;
}

function* pageGenerator(
  cards: CardOption[],
  perPage: number
): Generator<CardOption[], void, void> {
  for (let i = 0; i < cards.length; i += perPage) {
    yield cards.slice(i, i + perPage);
  }
}

export async function exportProxyPagesToPdf({
  cards,
  imagesById,
  bleedEdge,
  bleedEdgeWidthMm,
  guideColor,
  guideWidthPx,
  pageSizeUnit,
  pageWidth,
  pageHeight,
  columns,
  rows,
  cardSpacingMm,
  cardPositionX,
  cardPositionY,
  dpi,
  onProgress,
  pagesPerPdf,
  cancellationPromise,
  darkenNearBlack,
  cutLineStyle,
  resumeSession,
}: {
  cards: CardOption[];
  imagesById: Map<string, import("../db").Image>;
  bleedEdge: boolean;
  bleedEdgeWidthMm: number;
  guideColor: string;
  guideWidthPx: number;
  pageOrientation: "portrait" | "landscape";
  pageSizeUnit: "mm" | "in";
  pageWidth: number;
  pageHeight: number;
  columns: number;
  rows: number;
  cardSpacingMm: number;
  cardPositionX: number;
  cardPositionY: number;
  dpi: number;
  onProgress?: (progress: number) => void;
  pagesPerPdf: number;
  cancellationPromise: Promise<void>;
  darkenNearBlack: boolean;
  cutLineStyle: 'none' | 'edges' | 'full';
  resumeSession?: PdfExportSession | null;
}): Promise<void> {
  if (!cards || !cards.length) {
    return;
  }

  const perPage = Math.max(1, columns * rows);
  const totalImages = cards.length;
  let totalImagesProcessed = 0;
  let pdfBuffers: Uint8Array[] = [];
  let startChunkIndex = 0;
  const sessionId = crypto.randomUUID();

  // Resume from checkpoint if available
  if (resumeSession) {
    const settingsMatch =
      resumeSession.settings.dpi === dpi &&
      resumeSession.settings.bleedEdge === bleedEdge &&
      resumeSession.settings.bleedEdgeWidthMm === bleedEdgeWidthMm &&
      resumeSession.settings.pageWidth === pageWidth &&
      resumeSession.settings.pageHeight === pageHeight &&
      resumeSession.settings.pageSizeUnit === pageSizeUnit &&
      resumeSession.settings.columns === columns &&
      resumeSession.settings.rows === rows &&
      resumeSession.settings.cardSpacingMm === cardSpacingMm &&
      resumeSession.settings.cardPositionX === cardPositionX &&
      resumeSession.settings.cardPositionY === cardPositionY &&
      resumeSession.settings.darkenNearBlack === darkenNearBlack &&
      resumeSession.settings.cutLineStyle === cutLineStyle;

    if (settingsMatch) {
      pdfBuffers = resumeSession.completedChunks.slice();
      startChunkIndex = resumeSession.lastChunkIndex + 1;
      console.log(`Resuming from chunk ${startChunkIndex}/${resumeSession.totalChunks}`);
    } else {
      console.warn('Settings changed, cannot resume. Starting fresh.');
    }
  }

  const pagesIterator = pageGenerator(cards, perPage);

  let isDone = false;
  while (!isDone) {
    const chunkPages: CardOption[][] = [];
    if (pagesPerPdf > 0) {
      for (let i = 0; i < pagesPerPdf; i++) {
        const nextPage = pagesIterator.next();
        if (nextPage.done) {
          isDone = true;
          break;
        }
        chunkPages.push(nextPage.value);
      }
    } else {
      for (const page of pagesIterator) {
        chunkPages.push(page);
      }
      isDone = true;
    }

    if (chunkPages.length === 0) {
      break;
    }

    const workerPool: Worker[] = [];
    try {
      const toPoints = (value: number, unit: "mm" | "in") => {
        if (unit === "mm") {
          return (value / 25.4) * 72;
        }
        return value * 72;
      };

      const pdfWidth = toPoints(pageWidth, pageSizeUnit);
      const pdfHeight = toPoints(pageHeight, pageSizeUnit);

      const workerPromise = new Promise<Uint8Array>((resolve, reject) => {
        (async () => {
          const pdfDoc = await PDFDocument.create();
          const maxWorkers =
            Math.floor(Math.log2(navigator.hardwareConcurrency || 1)) + 1;

          // Initialize task queue with all pages
          const taskQueue = chunkPages.map((pageCards, index) => ({
            pageCards,
            pageIndex: index,
          }));

          // Skip tasks that were already completed in previous session
          if (startChunkIndex > 0) {
            taskQueue.splice(0, startChunkIndex);
          }

          const pageImageUrls = new Map<number, string>();
          let nextPageIndexToAdd = startChunkIndex;

          const pageImageProgress = new Array(chunkPages.length).fill(0);

          const workerPool: WorkerInfo[] = [];

          const coordinator = (() => {
            const lock = new AsyncLock();
            let assemblyStarted = false;

            return {
              async handleEvent(event: WorkerEvent) {
                await lock.acquire();
                try {
                  switch (event.type) {
                    case 'PAGE_COMPLETE':
                      pageImageUrls.set(event.pageIndex, event.url);
                      await this.tryAssemblePages();
                      await this.tryAssignNextTask();
                      break;

                    case 'PROGRESS': {
                      const oldProgress = pageImageProgress[event.pageIndex];
                      pageImageProgress[event.pageIndex] = event.imagesProcessed;
                      totalImagesProcessed += event.imagesProcessed - oldProgress;
                      if (onProgress) {
                        onProgress((totalImagesProcessed / totalImages) * 100);
                      }
                      break;
                    }

                    case 'WORKER_READY':
                      await this.tryAssignNextTask();
                      break;

                    case 'ERROR':
                      await this.saveCheckpoint();
                      this.handleError(event.error, event.pageIndex);
                      break;
                  }
                } finally {
                  lock.release();
                }
              },

              async tryAssemblePages() {
                // Sequential page assembly
                while (pageImageUrls.has(nextPageIndexToAdd)) {
                  const url = pageImageUrls.get(nextPageIndexToAdd)!;
                  try {
                    const response = await fetch(url);
                    const blob = await response.blob();
                    const buffer = await blob.arrayBuffer();
                    const image = await pdfDoc.embedJpg(buffer);
                    const page = pdfDoc.addPage([pdfWidth, pdfHeight]);
                    page.drawImage(image, {
                      x: 0, y: 0,
                      width: page.getWidth(),
                      height: page.getHeight(),
                    });
                  } catch (e) {
                    console.error(`Failed to process page ${nextPageIndexToAdd}`, e);
                    throw e;
                  } finally {
                    URL.revokeObjectURL(url);
                    pageImageUrls.delete(nextPageIndexToAdd);
                    nextPageIndexToAdd++;
                  }
                }

                // Check if all pages processed
                if (nextPageIndexToAdd === chunkPages.length && !assemblyStarted) {
                  assemblyStarted = true;
                  await this.finalize();
                }
              },

              async tryAssignNextTask() {
                if (taskQueue.length > 0) {
                  const idleWorker = workerPool.find(w => !w.busy);
                  if (idleWorker) {
                    const task = taskQueue.shift()!;
                    idleWorker.busy = true;

                    const settings = {
                      pageWidth,
                      pageHeight,
                      pageSizeUnit,
                      columns,
                      rows,
                      bleedEdge,
                      bleedEdgeWidthMm,
                      cardSpacingMm,
                      cardPositionX,
                      cardPositionY,
                      guideColor,
                      guideWidthPx,
                      DPI: dpi,
                      imagesById,
                      API_BASE,
                      darkenNearBlack,
                      cutLineStyle,
                    };

                    idleWorker.worker.postMessage({
                      pageCards: task.pageCards,
                      pageIndex: task.pageIndex,
                      settings,
                    });
                  }
                }
              },

              async saveCheckpoint() {
                // Save completed chunks to IndexedDB
                // We only save chunks that have been fully generated and added to pdfBuffers
                if (pdfBuffers.length > 0) {
                  await db.pdfExportSessions.put({
                    id: sessionId,
                    timestamp: Date.now(),
                    completedChunks: pdfBuffers.slice(), // Save copy of completed chunks
                    totalChunks: chunkPages.length + (startChunkIndex > 0 ? startChunkIndex : 0), // Total including skipped ones
                    lastChunkIndex: pdfBuffers.length - 1 + startChunkIndex,
                    settings: {
                      dpi,
                      bleedEdge,
                      bleedEdgeWidthMm,
                      pageWidth,
                      pageHeight,
                      pageSizeUnit,
                      columns,
                      rows,
                      cardSpacingMm,
                      cardPositionX,
                      cardPositionY,
                      darkenNearBlack,
                      cutLineStyle,
                    },
                  });
                }
              },

              async finalize() {
                workerPool.forEach(w => w.worker.terminate());
                const pdfBytes = await pdfDoc.save();
                resolve(pdfBytes);
              },

              handleError(error: Error, pageIndex?: number) {
                pageImageUrls.forEach(url => URL.revokeObjectURL(url));
                workerPool.forEach(w => w.worker.terminate());

                // Reject with enhanced error info for resume
                // We pass back the error so the outer loop can handle it
                // We add canResume flag if we have *some* progress (handled in outer loop)
                reject({
                  error,
                  pageIndex,
                  sessionId,
                  canResume: pdfBuffers.length > 0 // This refers to outer variable
                });
              }
            };
          })();

          for (let i = 0; i < maxWorkers; i++) {
            const worker = new Worker(
              new URL("./pdf.worker.ts", import.meta.url),
              { type: "module" }
            );

            const workerInfo: WorkerInfo = { worker, busy: false };
            workerPool.push(workerInfo);

            worker.onmessage = async (event: MessageEvent) => {
              const { type, error, pageIndex, url, imagesProcessed } = event.data;

              workerInfo.busy = false; // Mark as available

              if (error) {
                await coordinator.handleEvent({
                  type: 'ERROR',
                  error: new Error(`Error from worker for page ${pageIndex + 1}: ${error}`),
                  pageIndex
                });
                return;
              }

              if (type === "progress") {
                await coordinator.handleEvent({
                  type: 'PROGRESS',
                  pageIndex,
                  imagesProcessed
                });
                return;
              }

              if (type === "result" && url) {
                await coordinator.handleEvent({
                  type: 'PAGE_COMPLETE',
                  pageIndex,
                  url
                });
              }
            };

            worker.onerror = (e) => {
              coordinator.handleEvent({
                type: 'ERROR',
                error: e instanceof Error ? e : new Error('Worker error')
              });
            };

            // Kick off initial tasks
            await coordinator.handleEvent({ type: 'WORKER_READY', workerId: i });
          }
        })().catch(reject);
      });

      pdfBuffers.push(
        await Promise.race([
          workerPromise,
          cancellationPromise.then(() =>
            Promise.reject(new Error("Cancelled by user"))
          ),
        ])
      );
    } catch (error: unknown) {
      workerPool.forEach((w) => w.terminate());
      if (!(error instanceof Error && error.message === "Cancelled by user")) {
        console.error(
          `An unhandled error occurred during PDF export for a chunk:`,
          error
        );
      }
      throw error;
    }
  }

  const mergedPdf = await PDFDocument.create();
  for (const pdfBuffer of pdfBuffers) {
    const pdf = await PDFDocument.load(pdfBuffer);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  const mergedPdfFile = await mergedPdf.save();
  const date = new Date().toISOString().slice(0, 10);
  const filename = `proxxies_${date}.pdf`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = new Blob([mergedPdfFile as any], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up the blob URL after a short delay to allow the download to start
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}