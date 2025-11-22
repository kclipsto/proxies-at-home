import { buildDecklist, downloadDecklist } from "@/helpers/DecklistHelper";
import { useLoadingStore } from "@/store/loading";
import { useSettingsStore } from "@/store/settings";
import { Button } from "flowbite-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db";

export function ExportActions() {
  const setLoadingTask = useLoadingStore((state) => state.setLoadingTask);
  const setProgress = useLoadingStore((state) => state.setProgress);

  const cards = useLiveQuery(() => db.cards.orderBy("order").toArray(), []) || [];

  const pageOrientation = useSettingsStore((state) => state.pageOrientation);
  const pageSizeUnit = useSettingsStore((state) => state.pageSizeUnit);
  const pageWidth = useSettingsStore((state) => state.pageWidth);
  const pageHeight = useSettingsStore((state) => state.pageHeight);
  const columns = useSettingsStore((state) => state.columns);
  const rows = useSettingsStore((state) => state.rows);
  const bleedEdgeWidth = useSettingsStore((state) => state.bleedEdgeWidth);
  const bleedEdge = useSettingsStore((state) => state.bleedEdge);
  const darkenNearBlack = useSettingsStore((state) => state.darkenNearBlack);
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

    const { exportProxyPagesToPdf } = await import(
      "@/helpers/ExportProxyPageToPdf"
    );

    const allImages = await db.images.toArray();
    const imagesById = new Map(allImages.map((img) => [img.id, img]));

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

    let rejectPromise: (reason?: Error) => void;
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
        imagesById,
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
        darkenNearBlack,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message !== "Cancelled by user") {
        console.error("Export failed:", err);
      }
    } finally {
      setLoadingTask(null);
      setOnCancel(null);
    }
  };

  async function handleExportZip() {
    setLoadingTask("Exporting ZIP");
    try {
      const { ExportImagesZip } = await import("@/helpers/ExportImagesZip");
      const allCards = await db.cards.toArray();
      const allImages = await db.images.toArray();
      await ExportImagesZip({
        cards: allCards,
        images: allImages,
      });
    } finally {
      setLoadingTask(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button color="green" onClick={handleExport} disabled={!cards.length}>
        Export to PDF
      </Button>

      <Button
        color="indigo"
        onClick={handleExportZip}
        disabled={!cards.length}
      >
        Export Card Images (.zip)
      </Button>

      <Button color="cyan" onClick={handleCopyDecklist} disabled={!cards.length}>
        Copy Decklist
      </Button>

      <Button
        color="blue"
        onClick={handleDownloadDecklist}
        disabled={!cards.length}
      >
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
