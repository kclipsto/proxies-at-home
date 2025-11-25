import { API_BASE } from "@/constants";
import type { CardOption } from "../../../shared/types";
import { PDFDocument } from "pdf-lib";

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
          const maxWorkers =
            Math.floor(Math.log2(navigator.hardwareConcurrency || 1)) + 1;
          const taskQueue = chunkPages.map((pageCards, index) => ({
            pageCards,
            pageIndex: index,
          }));
          const pageImageUrls = new Map<number, string>();
          let nextPageIndexToAdd = 0;
          let workersFinished = 0;

          const pageImageProgress = new Array(chunkPages.length).fill(0);

          const addReadyPagesToPdf = async () => {
            while (pageImageUrls.has(nextPageIndexToAdd)) {
              const url = pageImageUrls.get(nextPageIndexToAdd)!;
              try {
                const response = await fetch(url);
                const blob = await response.blob();
                const buffer = await blob.arrayBuffer();

                const image = await pdfDoc.embedJpg(buffer);
                const page = pdfDoc.addPage([pdfWidth, pdfHeight]);
                page.drawImage(image, {
                  x: 0,
                  y: 0,
                  width: page.getWidth(),
                  height: page.getHeight(),
                });
              } catch (e) {
                console.error(
                  `Failed to process blob for page ${nextPageIndexToAdd}`,
                  e
                );
              } finally {
                URL.revokeObjectURL(url);
                pageImageUrls.delete(nextPageIndexToAdd);
                nextPageIndexToAdd++;
              }
            }
          };

          const cleanupAndReject = (error: unknown) => {
            pageImageUrls.forEach((url) => URL.revokeObjectURL(url));
            workerPool.forEach((w) => w.terminate());
            reject(error);
          };


          for (let i = 0; i < maxWorkers; i++) {
            const worker = new Worker(
              new URL("./pdf.worker.ts", import.meta.url),
              {
                type: "module",
              }
            );
            workerPool.push(worker);

            const assignTask = () => {
              if (taskQueue.length > 0) {
                const task = taskQueue.shift()!;
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
                worker.postMessage({
                  pageCards: task.pageCards,
                  pageIndex: task.pageIndex,
                  settings,
                });
              } else {
                workersFinished++;
                if (workersFinished === maxWorkers) {
                  assemblePdf().then(resolve).catch(reject);
                }
              }
            };

            worker.onmessage = async (event: MessageEvent) => {
              const { type, error, pageIndex, url, imagesProcessed } =
                event.data;

              if (error) {
                cleanupAndReject(
                  new Error(
                    `Error from worker for page ${pageIndex + 1}: ${error}`
                  )
                );
                return;
              }

              if (type === "progress") {
                const oldProgressOnPage = pageImageProgress[pageIndex];
                pageImageProgress[pageIndex] = imagesProcessed;
                totalImagesProcessed += imagesProcessed - oldProgressOnPage;
                if (onProgress) {
                  const overallProgress =
                    (totalImagesProcessed / totalImages) * 100;
                  onProgress(overallProgress);
                }
                return;
              }

              if (type === "result") {
                if (url) {
                  pageImageUrls.set(pageIndex, url);
                  await addReadyPagesToPdf();
                } else {
                  console.error(
                    `Failed to get buffer for page ${pageIndex + 1}.`
                  );
                }
                assignTask();
              }
            };

            worker.onerror = (e) => {
              cleanupAndReject(e);
            };

            assignTask();
          }

          const assemblePdf = async (): Promise<Uint8Array> => {
            await addReadyPagesToPdf();
            if (nextPageIndexToAdd !== chunkPages.length) {
              return Promise.reject(
                new Error(
                  `PDF assembly failed. Expected ${chunkPages.length
                  } pages, but only processed ${nextPageIndexToAdd}.`
                )
              );
            }

            workerPool.forEach((w) => w.terminate());
            return await pdfDoc.save();
          };
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
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}