import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { FileText, Image, Clipboard, Download } from "lucide-react";
import { buildDecklist, downloadDecklist } from "@/helpers/decklistHelper";
import { downloadMpcXml } from "@/helpers/mpcXmlExport";
import { useLoadingStore } from "@/store/loading";
import { useSettingsStore } from "@/store/settings";
import { useSelectionStore } from "@/store/selection";
import { useToastStore } from "@/store/toast";
import { Button } from "flowbite-react";
import { db } from "../../db";
import { serializePdfSettingsForWorker } from "@/helpers/serializeSettingsForWorker";
import { useFilteredAndSortedCards } from "@/hooks/useFilteredAndSortedCards";
import { SplitButton } from "../common";
import { extractMpcIdentifierFromImageId } from "@/helpers/mpcAutofillApi";
import { inferImageSource } from "@/helpers/imageSourceUtils";
import type { CardOption } from "../../../../shared/types";

type Props = {
  cards: CardOption[]; // Passed from parent to avoid redundant DB query
};

type ExportMode = 'fronts' | 'interleaved-all' | 'interleaved-custom' | 'duplex' | 'backs' | 'visible_faces';
type CopyMode = 'standard' | 'withMpc';
type DownloadMode = 'standard' | 'withMpc' | 'xml';
type ImageExportMode = 'zip' | 'individual';

const EXPORT_MODES: { value: ExportMode; label: string; description: string }[] = [
  { value: 'fronts', label: 'Fronts Only', description: 'Print front faces only (most common)' },
  { value: 'interleaved-all', label: 'Interleaved (All)', description: 'Each front followed by its back' },
  { value: 'interleaved-custom', label: 'Interleaved (DFC/Custom)', description: 'Interleave only DFCs and custom backs' },
  { value: 'duplex', label: 'Duplex Printing', description: 'All fronts, then all backs (mirrored)' },
  { value: 'backs', label: 'Backs Only', description: 'Just backs (mirrored for duplex)' },
  { value: 'visible_faces', label: 'Visible Faces', description: 'Prints whichever face is currently visible (follows flips)' },
];

const COPY_MODES: { value: CopyMode; label: string; description: string }[] = [
  { value: 'standard', label: 'Basic', description: 'Card names with set info' },
  { value: 'withMpc', label: 'With MPC Art IDs', description: 'Preserve exact MPC art selections' },
];

const DOWNLOAD_MODES: { value: DownloadMode; label: string; description: string }[] = [
  { value: 'standard', label: 'Basic (.txt)', description: 'Card names with set info' },
  { value: 'withMpc', label: 'With MPC Art IDs (.txt)', description: 'Preserve exact MPC art selections' },
  { value: 'xml', label: 'MPC Autofill (.xml)', description: 'For import in MPC Autofill' },
];

const IMAGE_EXPORT_MODES: { value: ImageExportMode; label: string; description: string }[] = [
  { value: 'zip', label: 'ZIP Archive', description: 'All images in a single .zip file' },
  { value: 'individual', label: 'Individual Files', description: 'Download each image separately' },
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
  const [isCopyDropdownOpen, setIsCopyDropdownOpen] = useState(false);
  const [isDownloadDropdownOpen, setIsDownloadDropdownOpen] = useState(false);
  const [isImageExportDropdownOpen, setIsImageExportDropdownOpen] = useState(false);

  // Mode state for Copy/Download (similar to exportMode for PDF)
  const [copyMode, setCopyMode] = useState<CopyMode>('withMpc');
  const [downloadMode, setDownloadMode] = useState<DownloadMode>('withMpc');
  const [imageExportMode, setImageExportMode] = useState<ImageExportMode>('zip');

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
    const style = copyMode === 'withMpc' ? "withMpc" : "withSetNum";
    const text = buildDecklist(frontCards, { style, sort: decklistSortAlpha ? "alpha" : "none" });
    await navigator.clipboard.writeText(text);
    useToastStore.getState().addToast({ message: 'Copied Decklist!', type: 'success', dismissible: true });
  };

  const handleDownloadDecklist = async () => {
    const date = new Date().toISOString().slice(0, 10);

    if (downloadMode === 'xml') {
      // For XML export, we need:
      // 1. All front cards (filteredAndSortedCards)
      // 2. All linked back cards (even if not currently in view)
      // 3. The default cardback ID (if applicable)

      const cardsToExport = [...filteredAndSortedCards];

      // Collect linked back IDs that might be missing from the current view
      const linkedBackIds = new Set<string>();
      for (const card of filteredAndSortedCards) {
        if (card.linkedBackId) {
          linkedBackIds.add(card.linkedBackId);
        }
      }

      // Check which back cards we already have
      const existingIds = new Set(cardsToExport.map(c => c.uuid));
      const missingBackIds = Array.from(linkedBackIds).filter(id => !existingIds.has(id));

      // Fetch missing backs
      if (missingBackIds.length > 0) {
        const missingBacks = await db.cards.bulkGet(missingBackIds);
        // db.bulkGet returns (Card | undefined) array
        missingBacks.forEach(back => {
          if (back) cardsToExport.push(back);
        });
      }

      // Get default cardback ID. 
      // The app stores defaultCardbackId in settings, but it's an internal ID like 'cardback_builtin_default'.
      // However, for MPC export, we ideally want an MPC ID.
      // If the default cardback is a custom image uploaded by the user, we can try to extract its MPC ID.
      // If it's a builtin, we probably don't have an MPC ID for it unless we hardcode one.
      // Let's rely on what we have. 
      const defaultCardbackId = useSettingsStore.getState().defaultCardbackId;
      let mpcDefaultBackId: string | undefined;

      if (defaultCardbackId) {
        // Check if it's a custom cardback with an MPC source
        const cb = await db.cardbacks.get(defaultCardbackId);
        if (cb) {
          // Check source from URL or ID, only extract MPC ID if source is 'mpc'
          const cbSource = inferImageSource(cb.sourceUrl) ?? inferImageSource(cb.id);
          if (cbSource === 'mpc') {
            if (cb.sourceUrl) {
              mpcDefaultBackId = extractMpcIdentifierFromImageId(cb.sourceUrl) || undefined;
            }
            if (!mpcDefaultBackId) {
              mpcDefaultBackId = extractMpcIdentifierFromImageId(cb.id) || undefined;
            }
          }
        }
      }

      // Fallback to a known valid MPC cardback if no suitable default is found
      if (!mpcDefaultBackId) {
        mpcDefaultBackId = '1LrVX0pUcye9n_0RtaDNVl2xPrQgn7CYf';
      }

      downloadMpcXml(cardsToExport, `mpc_decklist_${date}.xml`, mpcDefaultBackId);
    } else {
      const style = downloadMode === 'withMpc' ? "withMpc" : "withSetNum";
      const text = buildDecklist(frontCards, { style, sort: decklistSortAlpha ? "alpha" : "none" });
      const suffix = downloadMode === 'withMpc' ? '_mpc' : '';
      downloadDecklist(`decklist${suffix}_${date}.txt`, text);
    }
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
      "@/helpers/exportProxyPageToPdf"
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

      const useCustomBackOffset = useSettingsStore.getState().useCustomBackOffset;
      const cardBackPositionX = useSettingsStore.getState().cardBackPositionX;
      const cardBackPositionY = useSettingsStore.getState().cardBackPositionY;

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
          pdfSettings.perCardBackOffsets = {};
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
          pdfSettings.perCardBackOffsets = {};
          break;

        case 'visible_faces':
          // Export whichever face is currently visible
          for (const frontCard of frontCards) {
            const isFlipped = useSelectionStore.getState().flippedCards.has(frontCard.uuid);
            if (isFlipped && frontCard.linkedBackId) {
              const backCard = await db.cards.get(frontCard.linkedBackId);
              if (backCard) {
                cardsToExport.push(backCard);
              } else {
                cardsToExport.push(frontCard);
              }
            } else {
              cardsToExport.push(frontCard);
            }
          }
          filenameSuffix = '_visible_faces';
          pdfSettings.perCardBackOffsets = {};
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
          if (useCustomBackOffset) {
            pdfSettingsForBacks.cardPositionX = cardBackPositionX;
            pdfSettingsForBacks.cardPositionY = cardBackPositionY;
          }
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
          pdfSettings.perCardBackOffsets = {};
          if (useCustomBackOffset) {
            pdfSettings.cardPositionX = cardBackPositionX;
            pdfSettings.cardPositionY = cardBackPositionY;
          }
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
      const { ExportImagesZip } = await import("@/helpers/exportImagesZip");
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

  async function handleExportIndividual() {
    setLoadingTask("Exporting ZIP"); // Reusing loading task type
    try {
      const { ExportImagesIndividual } = await import("@/helpers/exportImagesZip");
      const allCards = await db.cards.toArray();
      const allImages = await db.images.toArray();
      const allCardbacks = await db.cardbacks.toArray();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mergedImages = [...allImages, ...allCardbacks] as any[];
      await ExportImagesIndividual({
        cards: allCards,
        images: mergedImages,
      });
    } finally {
      setLoadingTask(null);
    }
  }

  const handleImageExport = () => {
    if (imageExportMode === 'zip') {
      handleExportZip();
    } else {
      handleExportIndividual();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Split button for PDF export with mode selector */}
      <SplitButton
        label="Export to PDF"
        sublabel={EXPORT_MODES.find(m => m.value === exportMode)?.label}
        color="green"
        disabled={!frontCards.length}
        onClick={handleExport}
        isOpen={isDropdownOpen}
        onToggle={() => setIsDropdownOpen(!isDropdownOpen)}
        onClose={() => setIsDropdownOpen(false)}
        options={EXPORT_MODES}
        value={exportMode}
        onSelect={setExportMode}
        icon={FileText}
      />

      {/* Split button for image export */}
      <SplitButton
        label="Export Card Images"
        sublabel={IMAGE_EXPORT_MODES.find(m => m.value === imageExportMode)?.label}
        color="indigo"
        disabled={!frontCards.length}
        onClick={handleImageExport}
        isOpen={isImageExportDropdownOpen}
        onToggle={() => setIsImageExportDropdownOpen(!isImageExportDropdownOpen)}
        onClose={() => setIsImageExportDropdownOpen(false)}
        options={IMAGE_EXPORT_MODES}
        value={imageExportMode}
        onSelect={setImageExportMode}
        labelSize="sm"
        icon={Image}
      />

      {/* Copy Decklist Split Button */}
      <SplitButton
        label="Copy Decklist"
        sublabel={COPY_MODES.find(m => m.value === copyMode)?.label}
        color="cyan"
        disabled={!frontCards.length}
        onClick={handleCopyDecklist}
        isOpen={isCopyDropdownOpen}
        onToggle={() => setIsCopyDropdownOpen(!isCopyDropdownOpen)}
        onClose={() => setIsCopyDropdownOpen(false)}
        options={COPY_MODES}
        value={copyMode}
        onSelect={setCopyMode}
        labelSize="sm"
        icon={Clipboard}
      />

      {/* Download Decklist Split Button */}
      <SplitButton
        label="Download Decklist"
        sublabel={DOWNLOAD_MODES.find(m => m.value === downloadMode)?.label}
        color="blue"
        disabled={!frontCards.length}
        onClick={handleDownloadDecklist}
        isOpen={isDownloadDropdownOpen}
        onToggle={() => setIsDownloadDropdownOpen(!isDownloadDropdownOpen)}
        onClose={() => setIsDownloadDropdownOpen(false)}
        options={DOWNLOAD_MODES}
        value={downloadMode}
        onSelect={setDownloadMode}
        labelSize="sm"
        icon={Download}
      />


      {showErrorModal && errorMessage && createPortal(
        <div className="fixed inset-0 z-100 bg-gray-900/50 flex items-center justify-center">
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
