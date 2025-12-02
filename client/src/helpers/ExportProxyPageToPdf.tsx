import { API_BASE } from "@/constants";
import type { CardOption } from "../../../shared/types";
import { PDFDocument } from "pdf-lib";
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
  guideWidthCssPx,
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
  perCardGuideStyle,
  guidePlacement,
}: {
  cards: CardOption[];
  imagesById: Map<string, import("../db").Image>;
  bleedEdge: boolean;
  bleedEdgeWidthMm: number;
  guideColor: string;
  guideWidthCssPx: number;
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
  perCardGuideStyle: 'corners' | 'rounded-corners' | 'solid-rounded-rect' | 'dashed-rounded-rect' | 'solid-squared-rect' | 'dashed-squared-rect' | 'none';
  guidePlacement: 'inside' | 'outside';
}): Promise<void> {
  if (!cards || !cards.length) {
    return;
  }

  const perPage = Math.max(1, columns * rows);
  const totalImages = cards.length;
  let totalImagesProcessed = 0;
  const pdfBuffers: Uint8Array[] = [];

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
          // Worker count based on hardware
          const baseWorkers = Math.floor(Math.log2(navigator.hardwareConcurrency || 1)) + 1;
          const maxWorkers = baseWorkers;

          // Initialize task queue with all pages
          const taskQueue = chunkPages.map((pageCards, index) => ({
            pageCards,
            pageIndex: index,
          }));

          const pageImageUrls = new Map<number, string>();
          let nextPageIndexToAdd = 0;

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
                      this.handleError(event.error);
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
                      guideWidthCssPx,
                      DPI: dpi,
                      imagesById,
                      API_BASE,
                      darkenNearBlack,
                      cutLineStyle,
                      perCardGuideStyle,
                      guidePlacement,
                    };

                    idleWorker.worker.postMessage({
                      pageCards: task.pageCards,
                      pageIndex: task.pageIndex,
                      settings,
                    });
                  }
                }
              },

              async finalize() {
                workerPool.forEach(w => w.worker.terminate());
                const pdfBytes = await pdfDoc.save();
                resolve(pdfBytes);
              },

              handleError(error: Error) {
                pageImageUrls.forEach(url => URL.revokeObjectURL(url));
                workerPool.forEach(w => w.worker.terminate());
                reject(error);
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

              if (error) {
                workerInfo.busy = false; // Mark as available only on completion/error
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
                workerInfo.busy = false; // Mark as available only on completion
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