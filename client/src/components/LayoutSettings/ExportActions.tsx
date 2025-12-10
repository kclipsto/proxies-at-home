import { useState } from "react";
import { createPortal } from "react-dom";
import { buildDecklist, downloadDecklist } from "@/helpers/DecklistHelper";
import { useLoadingStore } from "@/store/loading";
import { useSettingsStore } from "@/store/settings";
import { Button } from "flowbite-react";
import { db } from "../../db";


import { useFilteredAndSortedCards } from "@/hooks/useFilteredAndSortedCards";

import type { CardOption } from "../../../../shared/types";

type Props = {
  cards: CardOption[]; // Passed from parent to avoid redundant DB query
};

export function ExportActions({ cards }: Props) {
  const setLoadingTask = useLoadingStore((state) => state.setLoadingTask);
  const setProgress = useLoadingStore((state) => state.setProgress);

  const { filteredAndSortedCards } = useFilteredAndSortedCards(cards);

  const pageOrientation = useSettingsStore((state) => state.pageOrientation);
  const pageSizeUnit = useSettingsStore((state) => state.pageSizeUnit);
  const pageWidth = useSettingsStore((state) => state.pageWidth);
  const pageHeight = useSettingsStore((state) => state.pageHeight);
  const columns = useSettingsStore((state) => state.columns);
  const rows = useSettingsStore((state) => state.rows);
  const bleedEdgeWidth = useSettingsStore((state) => state.bleedEdgeWidth);
  const bleedEdgeUnit = useSettingsStore((state) => state.bleedEdgeUnit);
  const bleedEdge = useSettingsStore((state) => state.bleedEdge);
  // Convert to mm for processing (stored value may be in inches)
  const bleedEdgeWidthMm = bleedEdgeUnit === 'in' ? bleedEdgeWidth * 25.4 : bleedEdgeWidth;
  const darkenNearBlack = useSettingsStore((state) => state.darkenNearBlack);
  const guideColor = useSettingsStore((state) => state.guideColor);
  const guideWidth = useSettingsStore((state) => state.guideWidth);
  const cardSpacingMm = useSettingsStore((state) => state.cardSpacingMm);
  const cardPositionX = useSettingsStore((state) => state.cardPositionX);
  const cardPositionY = useSettingsStore((state) => state.cardPositionY);
  const dpi = useSettingsStore((state) => state.dpi);
  const cutLineStyle = useSettingsStore((state) => state.cutLineStyle);
  const perCardGuideStyle = useSettingsStore((state) => state.perCardGuideStyle);
  const guidePlacement = useSettingsStore((state) => state.guidePlacement);
  const mpcBleedMode = useSettingsStore((state) => state.mpcBleedMode);
  const mpcExistingBleed = useSettingsStore((state) => state.mpcExistingBleed);
  const mpcExistingBleedUnit = useSettingsStore((state) => state.mpcExistingBleedUnit);
  const uploadBleedMode = useSettingsStore((state) => state.uploadBleedMode);
  const uploadExistingBleed = useSettingsStore((state) => state.uploadExistingBleed);
  const uploadExistingBleedUnit = useSettingsStore((state) => state.uploadExistingBleedUnit);

  const setOnCancel = useLoadingStore((state) => state.setOnCancel);

  // Error Modal State
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const decklistSortAlpha = useSettingsStore((state) => state.decklistSortAlpha);

  const handleCopyDecklist = async () => {
    const text = buildDecklist(filteredAndSortedCards, { style: "withSetNum", sort: decklistSortAlpha ? "alpha" : "none" });
    await navigator.clipboard.writeText(text);
  };

  const handleDownloadDecklist = () => {
    const text = buildDecklist(filteredAndSortedCards, { style: "withSetNum", sort: decklistSortAlpha ? "alpha" : "none" });
    const date = new Date().toISOString().slice(0, 10);
    downloadDecklist(`decklist_${date}.txt`, text);
  };

  const handleExport = async () => {
    if (!filteredAndSortedCards.length) return;

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
        cards: filteredAndSortedCards,
        imagesById,
        bleedEdge,
        bleedEdgeWidthMm: bleedEdgeWidthMm,
        guideColor,
        guideWidthCssPx: guideWidth,
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
        cutLineStyle,
        perCardGuideStyle,
        guidePlacement,
        mpcBleedMode,
        mpcExistingBleed,
        mpcExistingBleedUnit,
        uploadBleedMode,
        uploadExistingBleed,
        uploadExistingBleedUnit,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "Cancelled by user") {
        return; // User cancelled, do nothing
      }

      console.error("Export failed:", err);
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setShowErrorModal(true);
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
      <Button color="green" onClick={handleExport} disabled={!filteredAndSortedCards.length}>
        Export to PDF
      </Button>

      <Button
        color="indigo"
        onClick={handleExportZip}
        disabled={!filteredAndSortedCards.length}
      >
        Export Card Images (.zip)
      </Button>

      <Button color="cyan" onClick={handleCopyDecklist} disabled={!filteredAndSortedCards.length}>
        Copy Decklist
      </Button>

      <Button
        color="blue"
        onClick={handleDownloadDecklist}
        disabled={!filteredAndSortedCards.length}
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

      {showErrorModal && errorMessage && createPortal(
        <div className="fixed inset-0 z-[100] bg-gray-900/50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-md w-96 text-center">
            <div className="mb-4 text-lg font-semibold text-gray-800 dark:text-white">
              PDF Export Failed
            </div>
            <div className="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">
              {errorMessage}
            </div>
            <div className="flex justify-center gap-4">
              <Button
                color="gray"
                onClick={() => setShowErrorModal(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
