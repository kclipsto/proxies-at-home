import { buildDecklist, downloadDecklist } from "@/helpers/DecklistHelper";
import { ExportImagesZip } from "@/helpers/ExportImagesZip";
import { exportProxyPagesToPdf } from "@/helpers/ExportProxyPageToPdf";
import { useCardsStore } from "@/store/cards";
import { useLoadingStore } from "@/store/loading";
import { useSettingsStore } from "@/store/settings";
import { Button } from "flowbite-react";

export function ExportActions() {
  const setLoadingTask = useLoadingStore((state) => state.setLoadingTask);
  const setProgress = useLoadingStore((state) => state.setProgress);

  const cards = useCardsStore((state) => state.cards);
  const originalSelectedImages = useCardsStore(
    (state) => state.originalSelectedImages
  );
  const cachedImageUrls = useCardsStore((state) => state.cachedImageUrls); // <-- NEW

  const pageOrientation = useSettingsStore((state) => state.pageOrientation);
  const pageSizeUnit = useSettingsStore((state) => state.pageSizeUnit);
  const pageWidth = useSettingsStore((state) => state.pageWidth);
  const pageHeight = useSettingsStore((state) => state.pageHeight);
  const columns = useSettingsStore((state) => state.columns);
  const rows = useSettingsStore((state) => state.rows);
  const bleedEdgeWidth = useSettingsStore((state) => state.bleedEdgeWidth);
  const bleedEdge = useSettingsStore((state) => state.bleedEdge);
  const guideColor = useSettingsStore((state) => state.guideColor);
  const guideWidth = useSettingsStore((state) => state.guideWidth);
  const cardSpacingMm = useSettingsStore((state) => state.cardSpacingMm);
  const cardPositionX = useSettingsStore((state) => state.cardPositionX);
  const cardPositionY = useSettingsStore((state) => state.cardPositionY);
  const dpi = useSettingsStore((state) => state.dpi);

  const setOnCancel = useLoadingStore((state) => state.setOnCancel);

  const handleCopyDecklist = async () => {
    const text = buildDecklist(cards, { style: "withSetNum", sort: "alpha" });
    await navigator.clipboard.writeText(text);
  };

  const handleDownloadDecklist = () => {
    const text = buildDecklist(cards, { style: "withSetNum", sort: "alpha" });
    const date = new Date().toISOString().slice(0, 10);
    downloadDecklist(`decklist_${date}.txt`, text);
  };

  const handleExport = async () => {
    if (!cards.length) return;

    const pageWidthPx =
      pageSizeUnit === "in" ? pageWidth * dpi : (pageWidth / 25.4) * dpi;
    const pageHeightPx =
      pageSizeUnit === "in" ? pageHeight * dpi : (pageHeight / 25.4) * dpi;

    const MAX_PIXELS_PER_PDF_BATCH = 2_000_000_000; // 2 billion pixels
    const pixelsPerPage = pageWidthPx * pageHeightPx;
    const autoPagesPerPdf = Math.floor(MAX_PIXELS_PER_PDF_BATCH / pixelsPerPage);
    const effectivePagesPerPdf = Math.max(1, autoPagesPerPdf);

    setLoadingTask("Generating PDF");
    setProgress(0);

    let rejectPromise: (reason?: any) => void;
    const cancellationPromise = new Promise<void>((_, reject) => {
      rejectPromise = reject;
    });

    const onCancel = () => {
      rejectPromise(new Error("Cancelled by user"));
    };
    setOnCancel(onCancel);

    try {
      await exportProxyPagesToPdf({
        cards,
        originalSelectedImages,
        cachedImageUrls,
        bleedEdge,
        bleedEdgeWidthMm: bleedEdgeWidth,
        guideColor,
        guideWidthPx: guideWidth,
        pageOrientation,
        pageSizeUnit,
        pageWidth,
        pageHeight,
        columns,
        rows,
        cardSpacingMm,
        cardPositionX,
        cardPositionY,
        dpi,
        onProgress: setProgress,
        pagesPerPdf: effectivePagesPerPdf,
        cancellationPromise,
      });
    } catch (err: any) {
      if (err.message !== "Cancelled by user") {
        console.error("Export failed:", err);
      }
    } finally {
      setLoadingTask(null);
      setOnCancel(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button color="green" onClick={handleExport} disabled={!cards.length}>
        Export to PDF
      </Button>

      <Button
        color="indigo"
        onClick={() =>
          ExportImagesZip({
            cards,
            originalSelectedImages,
            fileBaseName: "card_images",
            // If your zip helper later supports it, you can pass cachedImageUrls here too.
          })
        }
        disabled={!cards.length}
      >
        Export Card Images (.zip)
      </Button>

      <Button color="cyan" onClick={handleCopyDecklist} disabled={!cards.length}>
        Copy Decklist
      </Button>

      <Button color="blue" onClick={handleDownloadDecklist} disabled={!cards.length}>
        Download Decklist (.txt)
      </Button>

      <a
        href="https://buymeacoffee.com/kaiserclipston"
        target="_blank"
        rel="noopener noreferrer"
      >
        <Button size="sm" className="bg-yellow-500 hover:bg-yellow-600 w-full">
          Buy Me a Coffee
        </Button>
      </a>
    </div>
  );
}
