import { Suspense, lazy, useEffect, useMemo, useCallback, useRef, useState } from "react";
import { FileUp, Eye, Settings } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import type { CardOption } from "../../../shared/types";

import { ResizeHandle } from "../components/ResizeHandle";
import { PageSettingsControls } from "../components/PageSettingsControls";
import { UploadSection } from "../components/UploadSection";
import { ToastContainer } from "../components/ToastContainer";
import { useImageProcessing } from "../hooks/useImageProcessing";
import { useCardEnrichment } from "../hooks/useCardEnrichment";
import { useSettingsStore } from "../store";
import { db, type Image } from "../db";
import { ImageProcessor, Priority } from "../helpers/imageProcessor";
import { rebalanceCardOrders } from "@/helpers/dbUtils";
import { importStats } from "../helpers/importStats";
import { cleanExpiredImageCache } from "../helpers/imageCacheUtils";

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

  // Mobile detection and state
  const [isMobile, setIsMobile] = useState(false);
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia("(orientation: landscape)").matches;
    }
    return false;
  });
  const [activeMobileView, setActiveMobileView] = useState<"upload" | "preview" | "settings">(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem("activeMobileView");
      if (saved === "upload" || saved === "preview" || saved === "settings") {
        return saved;
      }
    }
    return "preview";
  });

  // Track previous width to detect actual rotation vs keyboard opening
  const lastWidth = useRef(typeof window !== 'undefined' ? window.innerWidth : 0);

  useEffect(() => {
    localStorage.setItem("activeMobileView", activeMobileView);
  }, [activeMobileView]);

  useEffect(() => {
    const checkLayout = () => {
      const width = window.innerWidth;

      // Mobile detection
      const isTouch = window.matchMedia("(pointer: coarse)").matches;
      const hasHover = window.matchMedia("(hover: hover)").matches;

      // Strict mobile check:
      // We require !hasHover to prevent desktop users from triggering mobile view
      // when zooming in (which reduces window.innerWidth) or resizing the window.
      // DevTools mobile emulation correctly simulates !hasHover, so testing still works.
      const isMobileDevice = !hasHover && (width < 768 || (isTouch && width < 1024));

      setIsMobile(isMobileDevice);

      // Orientation detection
      const isLandscapeQuery = window.matchMedia("(orientation: landscape)").matches;
      setIsLandscape(isLandscapeQuery);

      lastWidth.current = width;
    };

    checkLayout();
    window.addEventListener("resize", checkLayout);
    return () => window.removeEventListener("resize", checkLayout);
  }, []);

  const createResizeHandler = useCallback((
    getWidth: () => number,
    setWidth: (w: number) => void,
    isCollapsed: boolean,
    toggle: () => void,
    invertDelta: boolean = false
  ) => (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = getWidth();
    let hasExpanded = !isCollapsed;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = invertDelta ? (startX - e.clientX) : (e.clientX - startX);

      if (!hasExpanded && Math.abs(delta) > 3) {
        toggle();
        hasExpanded = true;
      }

      setWidth(Math.max(320, Math.min(600, startWidth + delta)));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  const handleMouseDown = useMemo(
    () => createResizeHandler(() => settingsPanelWidth, setSettingsPanelWidth, isSettingsPanelCollapsed, toggleSettingsPanel, true),
    [createResizeHandler, settingsPanelWidth, setSettingsPanelWidth, isSettingsPanelCollapsed, toggleSettingsPanel]
  );

  const handleUploadPanelMouseDown = useMemo(
    () => createResizeHandler(() => uploadPanelWidth, setUploadPanelWidth, isUploadPanelCollapsed, toggleUploadPanel, false),
    [createResizeHandler, uploadPanelWidth, setUploadPanelWidth, isUploadPanelCollapsed, toggleUploadPanel]
  );



  // On startup, rebalance card orders to prevent floating point issues.
  useEffect(() => {
    const timer = setTimeout(() => {
      void rebalanceCardOrders();
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  // On startup, clean expired image cache entries (non-blocking)
  useEffect(() => {
    const timer = setTimeout(() => {
      cleanExpiredImageCache().then(count => {
        if (count > 0) {
          console.log(`[ImageCache] Cleaned ${count} expired entries`);
        }
      });
    }, 500);
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

  // Background enrichment for MPC imports (keep hook for enrichment logic)
  useCardEnrichment();

  useEffect(() => {
    if (!allCards) return;

    const processUnprocessed = async () => {
      const allImages = await db.images.toArray();
      const imagesById = new Map(allImages.map((img) => [img.id, img]));

      const unprocessedCards = [];
      const tracking = importStats.isTracking();

      for (const card of allCards) {
        if (!card.imageId) continue;
        const img = imagesById.get(card.imageId);

        // Check if fully processed
        const isProcessed =
          img?.displayBlob &&
          img?.displayBlobDarkened &&
          img.exportDpi === dpi &&
          img.exportBleedWidth === (bleedEdge ? bleedEdgeWidth : 0);

        if (!isProcessed) {
          unprocessedCards.push(card);
        } else if (tracking) {
          // If tracking import, report cache hits immediately
          // This ensures the summary logs even if all cards are skipped
          importStats.markCacheHit(card.uuid);
          importStats.markCardProcessed(card.uuid);
        }
      }

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

  // Mobile Layout
  if (isMobile) {
    return (
      <div className={`flex ${isLandscape ? 'flex-row' : 'flex-col'} h-[100dvh] overflow-hidden bg-gray-50 dark:bg-gray-900`}>
        {/* Navigation - Left for Landscape, Bottom for Portrait */}
        <div className={`
          ${isLandscape
            ? 'w-20 h-full border-r flex-col pt-4 pb-4 justify-center gap-8'
            : 'h-16 w-full border-t flex-row items-center justify-around px-4 order-last'
          }
          bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 flex shrink-0 z-50
        `}>
          <button
            onClick={() => setActiveMobileView("upload")}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${activeMobileView === "upload"
              ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
              : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
          >
            <FileUp className="size-6" />
            <span className="text-xs font-medium">Upload</span>
          </button>

          <button
            onClick={() => setActiveMobileView("preview")}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${activeMobileView === "preview"
              ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
              : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
          >
            <Eye className="size-6" />
            <span className="text-xs font-medium">Preview</span>
          </button>

          <button
            onClick={() => setActiveMobileView("settings")}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${activeMobileView === "settings"
              ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
              : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
          >
            <Settings className="size-6" />
            <span className="text-xs font-medium">Settings</span>
          </button>
        </div>

        <div className="flex-1 overflow-hidden relative">
          <div className={activeMobileView === "upload" ? "block h-full" : "hidden"}>
            <UploadSection
              isCollapsed={false}
              cardCount={cardCount}
              mobile={true}
              onUploadComplete={() => setActiveMobileView("preview")}
            />
          </div>

          <div className={activeMobileView === "preview" ? "block h-full" : "hidden"}>
            <Suspense fallback={<PageViewLoader />}>
              <PageView
                loadingMap={loadingMap}
                ensureProcessed={ensureProcessed}
                cards={allCards}
                images={allImages}
                mobile={true}
                active={activeMobileView === "preview"}
              />
            </Suspense>
            <ToastContainer />
          </div>

          <div className={activeMobileView === "settings" ? "block h-full" : "hidden"}>
            <PageSettingsControls
              reprocessSelectedImages={reprocessSelectedImages}
              cancelProcessing={cancelProcessing}
              cards={allCards}
              mobile={true}
            />
          </div>
        </div>
      </div>
    );
  }

  // Desktop Layout
  return (
    <>
      <div className="flex flex-row h-[100dvh] justify-between overflow-hidden">
        <div
          className="relative transition-all duration-200 ease-in-out z-30 h-full overflow-hidden"
          style={{
            width: isUploadPanelCollapsed ? 60 : uploadPanelWidth,
            minWidth: isUploadPanelCollapsed ? 60 : 320,
          }}
        >
          <UploadSection
            isCollapsed={isUploadPanelCollapsed}
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

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden relative h-full">
          <Suspense fallback={<PageViewLoader />}>
            <PageView
              loadingMap={loadingMap}
              ensureProcessed={ensureProcessed}
              cards={allCards}
              images={allImages}
            />
          </Suspense>

          <ToastContainer />
        </div>
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
          className="h-full overflow-hidden"
          style={{
            width: isSettingsPanelCollapsed ? 60 : settingsPanelWidth,
            minWidth: isSettingsPanelCollapsed ? 60 : 320,
            transition: "width 0.2s ease-in-out",
          }}
        >
          <PageSettingsControls
            reprocessSelectedImages={reprocessSelectedImages}
            cancelProcessing={cancelProcessing}
            cards={allCards}
          />
        </div>
      </div>


    </>
  );
}

