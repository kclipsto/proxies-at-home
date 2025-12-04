import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { buildDecklist, downloadDecklist } from "@/helpers/DecklistHelper";
import { useLoadingStore } from "@/store/loading";
import { useSettingsStore } from "@/store/settings";
import { Button } from "flowbite-react";
import { db, type PdfExportSession } from "../../db";


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
  const bleedEdge = useSettingsStore((state) => state.bleedEdge);
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

  const setOnCancel = useLoadingStore((state) => state.setOnCancel);

  // Resume/Error Modal State
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [resumeSession, setResumeSession] = useState<PdfExportSession | null>(null);
  const [errorInfo, setErrorInfo] = useState<{
    message: string;
    canResume: boolean;
    sessionId?: string;
    pageIndex?: number;
  } | null>(null);

  // Ref to hold session for modal actions to avoid stale closures if needed
  const resumeSessionRef = useRef<PdfExportSession | null>(null);

  const handleCopyDecklist = async () => {
    const text = buildDecklist(filteredAndSortedCards, { style: "withSetNum", sort: "alpha" });
    await navigator.clipboard.writeText(text);
  };

  const handleDownloadDecklist = () => {
    const text = buildDecklist(filteredAndSortedCards, { style: "withSetNum", sort: "alpha" });
    const date = new Date().toISOString().slice(0, 10);
    downloadDecklist(`decklist_${date}.txt`, text);
  };

  const performExport = async (sessionToResume: PdfExportSession | null) => {
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
        bleedEdgeWidthMm: bleedEdgeWidth,
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
        resumeSession: sessionToResume,
      });

      // Success - clear any saved sessions
      await db.pdfExportSessions.clear();

    } catch (err: unknown) {
      if (err instanceof Error && err.message === "Cancelled by user") {
        return; // User cancelled, do nothing
      }

      console.error("Export failed:", err);

      // Check if it's a resumable error
      if (err && typeof err === 'object' && 'canResume' in err) {
        const exportError = err as {
          error: Error;
          sessionId: string;
          canResume: boolean;
          pageIndex?: number;
        };

        setErrorInfo({
          message: exportError.error.message,
          canResume: exportError.canResume,
          sessionId: exportError.sessionId,
          pageIndex: exportError.pageIndex
        });
        setShowErrorModal(true);
      } else {
        // Generic error
        setErrorInfo({
          message: err instanceof Error ? err.message : String(err),
          canResume: false
        });
        setShowErrorModal(true);
      }
    } finally {
      setLoadingTask(null);
      setOnCancel(null);
    }
  };

  const handleExport = async () => {
    if (!filteredAndSortedCards.length) return;

    // Check for existing session
    const existingSessions = await db.pdfExportSessions
      .where('timestamp')
      .above(Date.now() - 1000 * 60 * 60) // Last hour
      .toArray();

    if (existingSessions.length > 0) {
      // Show modal to ask user
      const session = existingSessions[0];
      setResumeSession(session);
      resumeSessionRef.current = session;
      setShowResumeModal(true);
      return;
    }

    await performExport(null);
  };

  const handleResumeConfirm = async () => {
    setShowResumeModal(false);
    await performExport(resumeSessionRef.current);
  };

  const handleResumeCancel = async () => {
    setShowResumeModal(false);
    await db.pdfExportSessions.clear();
    await performExport(null); // Start fresh
  };

  const handleErrorRetry = async () => {
    setShowErrorModal(false);
    // Re-check for session (it should be there since error saved it)
    await handleExport();
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

      {showResumeModal && resumeSession && createPortal(
        <div className="fixed inset-0 z-[100] bg-gray-900/50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-md w-96 text-center">
            <div className="mb-4 text-lg font-semibold text-gray-800 dark:text-white">
              Resume PDF Export?
            </div>
            <div className="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">
              Found incomplete export from{' '}
              {new Date(resumeSession.timestamp).toLocaleString()}.
              Resume where you left off?
            </div>
            <div className="flex justify-center gap-4">
              <Button
                color="blue"
                onClick={handleResumeConfirm}
              >
                Resume
              </Button>
              <Button
                color="gray"
                onClick={handleResumeCancel}
              >
                Start Fresh
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showErrorModal && errorInfo && createPortal(
        <div className="fixed inset-0 z-[100] bg-gray-900/50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-md w-96 text-center">
            <div className="mb-4 text-lg font-semibold text-gray-800 dark:text-white">
              PDF Export Failed
            </div>
            <div className="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">
              {errorInfo.canResume ? (
                <>
                  Export failed at page {(errorInfo.pageIndex || 0) + 1}.
                  Your progress has been saved.
                  <br /><br />
                  <span className="text-sm text-gray-400">{errorInfo.message}</span>
                </>
              ) : (
                errorInfo.message
              )}
            </div>
            <div className="flex justify-center gap-4">
              {errorInfo.canResume ? (
                <>
                  <Button
                    color="blue"
                    onClick={handleErrorRetry}
                  >
                    Retry
                  </Button>
                  <Button
                    color="gray"
                    onClick={() => setShowErrorModal(false)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  color="gray"
                  onClick={() => setShowErrorModal(false)}
                >
                  Close
                </Button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
