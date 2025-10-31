import { API_BASE } from "@/constants";
import type { LayoutPreset } from "@/store/settings";
import type { CardOption } from "@/types/Card";
import jsPDF from "jspdf";
import { PDFDocument } from "pdf-lib";

const JSPDF_SUPPORTED = new Set([
  "letter",
  "legal",
  "tabloid",
  "a4",
  "a3",
  "a2",
  "a1",
]);

function resolveJsPdfFormat(opts: {
  preset: LayoutPreset;
  unit: "mm" | "in";
  width: number;
  height: number;
}): string | [number, number] {
  const { preset, unit, width, height } = opts;
  if (JSPDF_SUPPORTED.has(preset.toLowerCase())) return preset.toLowerCase();
  const toMm = (n: number) => (unit === "in" ? n * 25.4 : n);
  return [toMm(width), toMm(height)];
}

export async function exportProxyPagesToPdf({
  cards,
  originalSelectedImages,
  cachedImageUrls,
  bleedEdge,
  bleedEdgeWidthMm,
  guideColor,
  guideWidthPx,
  pageSizeUnit,
  pageOrientation,
  pageSizePreset,
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
}: {
  cards: CardOption[];
  originalSelectedImages: Record<string, string>;
  cachedImageUrls?: Record<string, string>;
  bleedEdge: boolean;
  bleedEdgeWidthMm: number;
  guideColor: string;
  guideWidthPx: number;
  pageOrientation: "portrait" | "landscape";
  pageSizePreset: LayoutPreset;
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
}): Promise<void> {
  if (!cards || !cards.length) {
    return;
  }

  const perPage = Math.max(1, columns * rows);
  const allPages: CardOption[][] = [];
  for (let i = 0; i < cards.length; i += perPage) {
    allPages.push(cards.slice(i, i + perPage));
  }

  const documentChunks: CardOption[][][] = [];
  if (pagesPerPdf > 0) {
    for (let i = 0; i < allPages.length; i += pagesPerPdf) {
      documentChunks.push(allPages.slice(i, i + pagesPerPdf));
    }
  } else {
    documentChunks.push(allPages);
  }

  const totalImages = cards.length;
  let totalImagesProcessed = 0;
  const pdfBuffers: Uint8Array[] = [];

  for (const [chunkIndex, chunkPages] of documentChunks.entries()) {
    const workerPool: Worker[] = [];
    try {
      const format = resolveJsPdfFormat({
        preset: pageSizePreset,
        unit: pageSizeUnit,
        width: pageWidth,
        height: pageHeight,
      });
      const pdf = new jsPDF({
        orientation: pageOrientation,
        unit: "mm",
        format,
        compress: true,
      });
      const pdfWidth = pageSizeUnit === "in" ? pageWidth * 25.4 : pageWidth;
      const pdfHeight = pageSizeUnit === "in" ? pageHeight * 25.4 : pageHeight;

      const workerPromise = new Promise<Uint8Array>((resolve, reject) => {
        const maxWorkers = Math.max(
          1,
          (navigator.hardwareConcurrency || 4) - 1
        );
        const taskQueue = chunkPages.map((pageCards, index) => ({
          pageCards,
          pageIndex: index, // Index within the chunk
        }));
        const results: { pageIndex: number; buffer: ArrayBuffer }[] = [];
        let workersFinished = 0;

        const pageImageProgress = new Array(chunkPages.length).fill(0);

        const cleanupAndReject = (error: any) => {
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
                originalSelectedImages,
                cachedImageUrls,
                API_BASE,
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
            const { type, error, pageIndex, buffer, imagesProcessed } =
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
              if (buffer) {
                results.push({ pageIndex, buffer });
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
          results.sort((a, b) => a.pageIndex - b.pageIndex);

          results.forEach(({ pageIndex, buffer }) => {
            if (pageIndex > 0) pdf.addPage();
            const imageData = new Uint8Array(buffer);
            pdf.addImage(imageData, "JPEG", 0, 0, pdfWidth, pdfHeight);
          });

          workerPool.forEach((w) => w.terminate());
          return new Uint8Array(pdf.output("arraybuffer"));
        };
      });

      pdfBuffers.push(
        await Promise.race([
          workerPromise,
          cancellationPromise.then(() =>
            Promise.reject(new Error("Cancelled by user"))
          ),
        ])
      );
    } catch (error: any) {
      workerPool.forEach((w) => w.terminate());
      if (error.message !== "Cancelled by user") {
        console.error(
          `An unhandled error occurred during PDF export for chunk ${
            chunkIndex + 1
          }:`,
          error
        );
      }
      throw error; // Rethrow to be caught by the outer handler
    }
  }

  // Merge all PDF buffers into a single PDF
  const mergedPdf = await PDFDocument.create();
  for (const pdfBuffer of pdfBuffers) {
    const pdf = await PDFDocument.load(pdfBuffer);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  const mergedPdfFile = await mergedPdf.save();
  const date = new Date().toISOString().slice(0, 10);
  const filename = `proxxies_${date}.pdf`;

  const blob = new Blob([mergedPdfFile], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
