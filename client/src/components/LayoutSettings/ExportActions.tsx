import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { buildDecklist, downloadDecklist } from "@/helpers/DecklistHelper";
import { useLoadingStore } from "@/store/loading";
import { useSettingsStore } from "@/store/settings";
import { Button } from "flowbite-react";
import { ChevronDown } from "lucide-react";
import { db } from "../../db";
import { serializePdfSettingsForWorker } from "@/helpers/serializeSettingsForWorker";
import { useFilteredAndSortedCards } from "@/hooks/useFilteredAndSortedCards";

import type { CardOption } from "../../../../shared/types";

type Props = {
  cards: CardOption[]; // Passed from parent to avoid redundant DB query
};

type ExportMode = 'fronts' | 'interleaved-all' | 'interleaved-custom' | 'duplex' | 'backs';

const EXPORT_MODES: { value: ExportMode; label: string; description: string }[] = [
  { value: 'fronts', label: 'Fronts Only', description: 'Print front faces only (most common)' },
  { value: 'interleaved-all', label: 'Interleaved (All)', description: 'Each front followed by its back' },
  { value: 'interleaved-custom', label: 'Interleaved (DFC/Custom)', description: 'Interleave only DFCs and custom backs' },
  { value: 'duplex', label: 'Duplex Printing', description: 'All fronts, then all backs (mirrored)' },
  { value: 'backs', label: 'Backs Only', description: 'Just backs (mirrored for duplex)' },
];

export function ExportActions({ cards }: Props) {
  const setLoadingTask = useLoadingStore((state) => state.setLoadingTask);
  const setProgress = useLoadingStore((state) => state.setProgress);

  const { filteredAndSortedCards } = useFilteredAndSortedCards(cards);

  // Settings needed for dimensions calculation
  const pageSizeUnit = useSettingsStore((state) => state.pageSizeUnit);
  const pageWidth = useSettingsStore((state) => state.pageWidth);
  const pageHeight = useSettingsStore((state) => state.pageHeight);
  const dpi = useSettingsStore((state) => state.dpi);
  const columns = useSettingsStore((state) => state.columns);
  const exportMode = useSettingsStore((state) => state.exportMode);
  const setExportMode = useSettingsStore((state) => state.setExportMode);

  const setOnCancel = useLoadingStore((state) => state.setOnCancel);

  // Dropdown state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Error Modal State
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const decklistSortAlpha = useSettingsStore((state) => state.decklistSortAlpha);

  // Filter to front cards only (exclude linked back cards)
  const frontCards = useMemo(() =>
    filteredAndSortedCards.filter(c => !c.linkedFrontId),
    [filteredAndSortedCards]
  );

  const handleCopyDecklist = async () => {
    const text = buildDecklist(frontCards, { style: "withSetNum", sort: decklistSortAlpha ? "alpha" : "none" });
    await navigator.clipboard.writeText(text);
  };

  const handleDownloadDecklist = () => {
    const text = buildDecklist(frontCards, { style: "withSetNum", sort: decklistSortAlpha ? "alpha" : "none" });
    const date = new Date().toISOString().slice(0, 10);
    downloadDecklist(`decklist_${date}.txt`, text);
  };

  /**
   * Build back cards array with mirrored row order for duplex printing.
   * For each row of N columns, reverse the order so backs align with fronts.
   * Incomplete rows are NOT padded - they will be right-aligned by the PDF worker.
   */
  const buildBackCardsForExport = async (): Promise<CardOption[]> => {
    const backCards: CardOption[] = [];

    for (const frontCard of frontCards) {
      if (frontCard.linkedBackId) {
        // Card has a linked back - use it
        const backCard = await db.cards.get(frontCard.linkedBackId);
        if (backCard) {
          backCards.push(backCard);
        } else {
          // Back card not found, use blank placeholder
          backCards.push(createBlankBackCard(frontCard));
        }
      } else {
        // No linked back - use blank placeholder (no image)
        backCards.push(createBlankBackCard(frontCard));
      }
    }

    // Mirror rows for duplex printing: reverse order within each row
    // No blank padding - incomplete rows will be right-aligned by PDF worker
    const mirroredCards: CardOption[] = [];
    for (let i = 0; i < backCards.length; i += columns) {
      const row = backCards.slice(i, i + columns);
      // Reverse the row so when printed duplex, backs align with fronts
      mirroredCards.push(...row.reverse());
    }

    return mirroredCards;
  };

  /**
   * Create a blank back card placeholder (for cards without linked backs)
   */
  const createBlankBackCard = (frontCard: CardOption): CardOption => ({
    ...frontCard,
    uuid: `blank-back-${frontCard.uuid}`,
    name: '',
    imageId: 'cardback_builtin_blank',  // Special marker for blank card
    linkedFrontId: frontCard.uuid,
    linkedBackId: undefined,
  });

  const handleExport = async () => {
    if (!frontCards.length) return;

    const { exportProxyPagesToPdf } = await import(
      "@/helpers/ExportProxyPageToPdf"
    );

    const allImages = await db.images.toArray();
    const allCardbacks = await db.cardbacks.toArray();
    // Merge images and cardbacks - cardbacks can be used as imageId for back cards
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imagesById = new Map<string, any>([
      ...allImages.map((img) => [img.id, img] as const),
      ...allCardbacks.map((cb) => [cb.id, cb] as const),
    ]);

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
      // Get normalized settings at export time (consistent with display path)
      const pdfSettings = serializePdfSettingsForWorker();
      const startTime = performance.now();

      // Determine cards to export based on mode
      let cardsToExport: CardOption[] = [];
      let filenameSuffix = '';

      switch (exportMode) {
        case 'fronts':
          // Default: just front cards
          cardsToExport = frontCards;
          filenameSuffix = '_fronts';
          break;

        case 'interleaved-all':
          // Each front followed by its back (skip blank backs - they don't add value)
          for (const frontCard of frontCards) {
            cardsToExport.push(frontCard);
            if (frontCard.linkedBackId) {
              const backCard = await db.cards.get(frontCard.linkedBackId);
              // Only include if it's a real back (not blank)
              if (backCard && backCard.imageId !== 'cardback_builtin_blank') {
                cardsToExport.push(backCard);
              }
            }
            // No else - skip cards without real backs
          }
          filenameSuffix = '_interleaved-all';
          break;

        case 'interleaved-custom':
          // Each front followed by back ONLY for DFC/custom backs (not default cardbacks or blanks)
          for (const frontCard of frontCards) {
            cardsToExport.push(frontCard);
            if (frontCard.linkedBackId) {
              const backCard = await db.cards.get(frontCard.linkedBackId);
              // Only include if it's a custom back (not using default cardback and not blank)
              if (backCard && !backCard.usesDefaultCardback && backCard.imageId !== 'cardback_builtin_blank') {
                cardsToExport.push(backCard);
              }
            }
          }
          filenameSuffix = '_interleaved-custom';
          break;

        case 'duplex': {
          // All fronts, then all backs (mirrored for duplex printing)
          // Export fronts first, then backs with right-alignment, merged into single PDF
          const backCards = await buildBackCardsForExport();

          // Import PDFDocument for merging
          const { PDFDocument } = await import('pdf-lib');

          // Export fronts (normal left-aligned) - get buffer
          const frontsBuffer = await exportProxyPagesToPdf({
            cards: frontCards,
            imagesById,
            pdfSettings,
            onProgress: (p) => setProgress(p * 0.45), // First 45% of progress
            pagesPerPdf: effectivePagesPerPdf,
            cancellationPromise,
            returnBuffer: true,
          });

          // Export backs (right-aligned incomplete rows) - get buffer
          const pdfSettingsForBacks = { ...pdfSettings, rightAlignRows: true };
          const backsBuffer = await exportProxyPagesToPdf({
            cards: backCards,
            imagesById,
            pdfSettings: pdfSettingsForBacks,
            onProgress: (p) => setProgress(45 + p * 0.45), // 45-90% of progress
            pagesPerPdf: effectivePagesPerPdf,
            cancellationPromise,
            returnBuffer: true,
          });

          // Merge fronts and backs into single PDF
          setProgress(92);
          const mergedPdf = await PDFDocument.create();

          if (frontsBuffer && frontsBuffer.length > 0) {
            const frontsPdf = await PDFDocument.load(frontsBuffer);
            const frontsPages = await mergedPdf.copyPages(frontsPdf, frontsPdf.getPageIndices());
            frontsPages.forEach(page => mergedPdf.addPage(page));
          }

          if (backsBuffer && backsBuffer.length > 0) {
            const backsPdf = await PDFDocument.load(backsBuffer);
            const backsPages = await mergedPdf.copyPages(backsPdf, backsPdf.getPageIndices());
            backsPages.forEach(page => mergedPdf.addPage(page));
          }

          setProgress(95);
          const mergedPdfFile = await mergedPdf.save();

          // Download merged PDF
          const date = new Date().toISOString().slice(0, 10);
          const filename = `proxxies_${date}_duplex.pdf`;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const blob = new Blob([mergedPdfFile as any], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 1000);

          setProgress(100);
          return; // Skip the normal export path below
        }

        case 'backs':
          // Just backs (mirrored, right-aligned incomplete rows)
          cardsToExport = await buildBackCardsForExport();
          filenameSuffix = '_backs';
          // Pass rightAlignRows for backs export
          pdfSettings.rightAlignRows = true;
          break;
      }

      await exportProxyPagesToPdf({
        cards: cardsToExport,
        imagesById,
        pdfSettings,
        onProgress: setProgress,
        pagesPerPdf: effectivePagesPerPdf,
        cancellationPromise,
        filenameSuffix,
      });

      // Log PDF export summary
      const elapsed = (performance.now() - startTime) / 1000;
      const perPage = Math.max(1, pdfSettings.columns * (pdfSettings.rows ?? 1));
      const totalPages = Math.ceil(cardsToExport.length / perPage);
      const pad = (content: string) => content.padEnd(62);
      const modeLabel = EXPORT_MODES.find(m => m.value === exportMode)?.label || exportMode;
      const summary = `
╔══════════════════════════════════════════════════════════════╗
║${`PDF EXPORT (${modeLabel})`.padStart(44).padEnd(62)}║
╠══════════════════════════════════════════════════════════════╣
║${pad(`  Total Time:        ${elapsed.toFixed(2).padStart(8)}s`)}║
╠══════════════════════════════════════════════════════════════╣
║${pad(`  Cards:             ${String(cardsToExport.length).padStart(8)}`)}║
║${pad(`  Pages:             ${String(totalPages).padStart(8)}`)}║
║${pad(`  DPI:               ${String(dpi).padStart(8)}`)}║
║${pad(`  Page Size:         ${(pageWidth + "x" + pageHeight + " " + pageSizeUnit).padStart(8)}`)}║
╚══════════════════════════════════════════════════════════════╝`;
      console.log(summary);
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
      const allCardbacks = await db.cardbacks.toArray();
      // Merge images and cardbacks for ZIP export
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mergedImages = [...allImages, ...allCardbacks] as any[];
      await ExportImagesZip({
        cards: allCards,
        images: mergedImages,
      });
    } finally {
      setLoadingTask(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Split button for PDF export with mode selector */}
      <div className="relative">
        <div className="flex">
          {/* Main export button - extra padding-left to offset for dropdown toggle width on right */}
          <button
            onClick={handleExport}
            disabled={!frontCards.length}
            className="flex-1 flex flex-col items-center justify-center cursor-pointer rounded-l-md bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 disabled:cursor-not-allowed pl-10 pr-0 py-2 text-white transition-colors"
          >
            <span className="text-base font-medium">Export to PDF</span>
            <span className="text-xs opacity-80">{EXPORT_MODES.find(m => m.value === exportMode)?.label}</span>
          </button>

          {/* Dropdown toggle button */}
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center justify-center cursor-pointer rounded-r-md bg-green-600 hover:bg-green-700 border-l border-green-500 px-3 py-2 text-white transition-colors"
            aria-label="Select export mode"
            aria-expanded={isDropdownOpen}
            aria-haspopup="listbox"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Dropdown menu */}
        {isDropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-gray-700 rounded-md shadow-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
            {EXPORT_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => {
                  setExportMode(mode.value);
                  setIsDropdownOpen(false);
                }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors ${exportMode === mode.value
                  ? "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                  : "text-gray-900 dark:text-white"
                  }`}
              >
                {mode.label}
                <span className="block text-xs text-gray-500 dark:text-gray-400">{mode.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Button
        color="indigo"
        onClick={handleExportZip}
        disabled={!frontCards.length}
      >
        Export Card Images (.zip)
      </Button>

      <Button color="cyan" onClick={handleCopyDecklist} disabled={!frontCards.length}>
        Copy Decklist
      </Button>

      <Button
        color="blue"
        onClick={handleDownloadDecklist}
        disabled={!frontCards.length}
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
