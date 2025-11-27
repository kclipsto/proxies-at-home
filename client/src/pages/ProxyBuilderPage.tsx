import { Suspense, lazy, useEffect, useMemo, useCallback, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { CardOption } from "../../../shared/types";

import { ResizeHandle } from "../components/ResizeHandle";
import { PageSettingsControls } from "../components/PageSettingsControls";
import { UploadSection } from "../components/UploadSection";
import { useImageProcessing } from "../hooks/useImageProcessing";
import { useSettingsStore } from "../store";
import { db, type Image } from "../db";
import { ImageProcessor, Priority } from "../helpers/imageProcessor";
import { rebalanceCardOrders } from "@/helpers/dbUtils";

const PageView = lazy(() =>
  import("../components/PageView").then((module) => ({
    default: module.PageView,
  }))
);

function PageViewLoader() {
  return (
    <div className="w-1/2 flex-1 overflow-y-auto bg-gray-200 h-full p-6 flex justify-center items-center dark:bg-gray-800">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-400 border-t-transparent" />
    </div>
  );
}




// Stable empty arrays to prevent useEffect dependency changes
const EMPTY_CARDS: CardOption[] = [];
const EMPTY_IMAGES: Image[] = [];

export default function ProxyBuilderPage() {
  const bleedEdge = useSettingsStore((state) => state.bleedEdge);
  const bleedEdgeWidth = useSettingsStore((state) => state.bleedEdgeWidth);
  const settingsPanelWidth = useSettingsStore((state) => state.settingsPanelWidth);
  const setSettingsPanelWidth = useSettingsStore((state) => state.setSettingsPanelWidth);
  const isSettingsPanelCollapsed = useSettingsStore((state) => state.isSettingsPanelCollapsed);
  const toggleSettingsPanel = useSettingsStore((state) => state.toggleSettingsPanel);
  const imageProcessor = useMemo(() => ImageProcessor.getInstance(), []);

  const isUploadPanelCollapsed = useSettingsStore((state) => state.isUploadPanelCollapsed);
  const toggleUploadPanel = useSettingsStore((state) => state.toggleUploadPanel);
  const uploadPanelWidth = useSettingsStore((state) => state.uploadPanelWidth);
  const setUploadPanelWidth = useSettingsStore((state) => state.setUploadPanelWidth);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = settingsPanelWidth;
    let hasExpanded = !isSettingsPanelCollapsed;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startX - e.clientX;

      // If collapsed and dragged more than 3px, expand
      if (!hasExpanded && Math.abs(delta) > 3) {
        toggleSettingsPanel();
        hasExpanded = true;
      }

      const newWidth = startWidth + delta;
      setSettingsPanelWidth(Math.max(250, Math.min(600, newWidth)));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [settingsPanelWidth, setSettingsPanelWidth, isSettingsPanelCollapsed, toggleSettingsPanel]);

  const handleUploadPanelMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = uploadPanelWidth;
    let hasExpanded = !isUploadPanelCollapsed;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;

      // If collapsed and dragged more than 3px, expand
      if (!hasExpanded && Math.abs(delta) > 3) {
        toggleUploadPanel();
        hasExpanded = true;
      }

      const newWidth = startWidth + delta;
      setUploadPanelWidth(Math.max(250, Math.min(600, newWidth)));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [uploadPanelWidth, setUploadPanelWidth, isUploadPanelCollapsed, toggleUploadPanel]);



  // On startup, rebalance card orders to prevent floating point issues.
  useEffect(() => {
    const timer = setTimeout(() => {
      void rebalanceCardOrders();
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  // Get current DPI for comparison in processUnprocessed
  const dpi = useSettingsStore((state) => state.dpi);

  // PERFORMANCE: Centralized database queries (single source of truth)
  // This replaces multiple redundant useLiveQuery calls across child components
  const allCardsQuery = useLiveQuery<CardOption[]>(() => db.cards.orderBy("order").toArray(), []);
  const allImagesQuery = useLiveQuery(() => db.images.toArray(), []);

  const allCards = allCardsQuery ?? EMPTY_CARDS;
  const allImages = allImagesQuery ?? EMPTY_IMAGES;

  // Derived values (no additional DB queries needed)
  const cardCount = allCards.length;

  const { loadingMap, ensureProcessed, reprocessSelectedImages, cancelProcessing } =
    useImageProcessing({
      unit: "mm",
      bleedEdgeWidth: bleedEdge ? bleedEdgeWidth : 0,
      imageProcessor,
    });

  useEffect(() => {
    if (!allCards) return;

    const processUnprocessed = async () => {
      const allImages = await db.images.toArray();
      const imagesById = new Map(allImages.map((img) => [img.id, img]));

      const unprocessedCards = allCards.filter((card: CardOption) => {
        if (!card.imageId) return false;
        const img = imagesById.get(card.imageId);

        // Check if BOTH display blobs exist AND settings match
        // This prevents re-processing on page load when images are fully cached
        // Note: We check export settings, not display (display is always 300 DPI)
        return !(
          img?.displayBlob &&
          img?.displayBlobDarkened &&
          img.exportDpi === dpi &&
          img.exportBleedWidth === (bleedEdge ? bleedEdgeWidth : 0)
        );
      });

      for (const card of unprocessedCards) {
        void ensureProcessed(card, Priority.LOW);
      }
    };

    // Debounce slightly to avoid thrashing on bulk adds
    const timer = setTimeout(() => processUnprocessed(), 200);
    return () => clearTimeout(timer);
  }, [allCards, ensureProcessed, dpi, bleedEdge, bleedEdgeWidth]);

  // Trigger reprocessing when DPI or bleed settings actually change
  const prevDpi = useRef(dpi);
  const prevBleedEdge = useRef(bleedEdge);
  const prevBleedEdgeWidth = useRef(bleedEdgeWidth);

  useEffect(() => {
    const dpiChanged = prevDpi.current !== dpi;
    const bleedEdgeChanged = prevBleedEdge.current !== bleedEdge;
    const bleedWidthChanged = prevBleedEdgeWidth.current !== bleedEdgeWidth;

    // Update refs for next comparison
    prevDpi.current = dpi;
    prevBleedEdge.current = bleedEdge;
    prevBleedEdgeWidth.current = bleedEdgeWidth;

    // Only reprocess if settings actually changed
    if (!dpiChanged && !bleedEdgeChanged && !bleedWidthChanged) {
      return;
    }

    const timer = setTimeout(async () => {
      cancelProcessing();
      const allCards = await db.cards.toArray();
      // Only reprocess cards that have an image
      const cardsWithImages = allCards.filter(c => c.imageId);
      if (cardsWithImages.length > 0) {
        void reprocessSelectedImages(cardsWithImages, bleedEdge ? bleedEdgeWidth : 0);
      }
    }, 500); // Debounce by 500ms

    return () => clearTimeout(timer);
  }, [dpi, bleedEdge, bleedEdgeWidth, reprocessSelectedImages, cancelProcessing]);

  return (
    <div className="flex flex-row h-screen justify-between overflow-hidden">
      <div
        className="relative transition-all duration-200 ease-in-out z-30"
        style={{
          width: isUploadPanelCollapsed ? 60 : uploadPanelWidth,
          minWidth: isUploadPanelCollapsed ? 60 : uploadPanelWidth,
        }}
      >
        <UploadSection
          isCollapsed={isUploadPanelCollapsed}
          onToggle={toggleUploadPanel}
          cardCount={cardCount}
        />
      </div>
      <ResizeHandle
        isCollapsed={isUploadPanelCollapsed}
        onToggle={toggleUploadPanel}
        onResizeStart={handleUploadPanelMouseDown}
        onReset={() => {
          setUploadPanelWidth(320);
          if (isUploadPanelCollapsed) toggleUploadPanel();
        }}
        className="-ml-2 -mr-2"
        side="left"
      />

      <Suspense fallback={<PageViewLoader />}>
        <PageView
          loadingMap={loadingMap}
          ensureProcessed={ensureProcessed}
          images={allImages}
          cards={allCards}
        />
      </Suspense>
      <ResizeHandle
        isCollapsed={isSettingsPanelCollapsed}
        onToggle={toggleSettingsPanel}
        onResizeStart={handleMouseDown}
        onReset={() => {
          setSettingsPanelWidth(320);
          if (isSettingsPanelCollapsed) toggleSettingsPanel();
        }}
        className="-ml-2 -mr-2"
        side="right"
      />
      <div
        style={{
          width: isSettingsPanelCollapsed ? 60 : settingsPanelWidth,
          minWidth: isSettingsPanelCollapsed ? 60 : settingsPanelWidth,
          transition: "width 0.2s ease-in-out",
        }}
      >
        <PageSettingsControls
          reprocessSelectedImages={reprocessSelectedImages}
          cancelProcessing={cancelProcessing}
          cards={allCards}
        />
      </div>
    </div >
  );
}
