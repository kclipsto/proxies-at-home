import { Suspense, lazy, useEffect, useMemo, useCallback, useRef, useState } from "react";
import { FileUp, Eye, Settings } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import type { CardOption } from "../../../shared/types";

import { ResizeHandle } from "../components/ResizeHandle";
import { ToastContainer } from "../components/ToastContainer";
import { useImageProcessing } from "../hooks/useImageProcessing";
import { useCardEnrichment } from "../hooks/useCardEnrichment";
import { useSettingsStore } from "../store";
import { db, type Image } from "../db";
import { ImageProcessor, Priority } from "../helpers/imageProcessor";
import { rebalanceCardOrders } from "@/helpers/dbUtils";
import { importStats } from "../helpers/importStats";
import { enforceImageCacheLimits, enforceMetadataCacheLimits } from "../helpers/cacheUtils";
import { getExpectedBleedWidth, type GlobalSettings } from "../helpers/imageSpecs";

// Lazy load heavy components
const PageView = lazy(() => import("../components/PageView").then(m => ({ default: m.PageView })));
const PageSettingsControls = lazy(() => import("../components/PageSettingsControls").then(m => ({ default: m.PageSettingsControls })));
const UploadSection = lazy(() => import("../components/UploadSection").then(m => ({ default: m.UploadSection })));

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
  const bleedEdgeUnit = useSettingsStore((state) => state.bleedEdgeUnit);
  // Images with bleed settings (new schema)
  const withBleedSourceAmount = useSettingsStore((state) => state.withBleedSourceAmount);
  const withBleedTargetMode = useSettingsStore((state) => state.withBleedTargetMode);
  const withBleedTargetAmount = useSettingsStore((state) => state.withBleedTargetAmount);
  // Images without bleed settings (new schema)
  const noBleedTargetMode = useSettingsStore((state) => state.noBleedTargetMode);
  const noBleedTargetAmount = useSettingsStore((state) => state.noBleedTargetAmount);
  // Convert to mm for processing (stored value may be in inches)
  const bleedEdgeWidthMm = bleedEdgeUnit === 'in' ? bleedEdgeWidth * 25.4 : bleedEdgeWidth;
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
      enforceImageCacheLimits().then(count => {
        if (count > 0) console.log(`[ImageCache] Cleaned ${count} entries (TTL or Size Limit)`);
      });
      enforceMetadataCacheLimits().then(count => {
        if (count > 0) console.log(`[MetadataCache] Cleaned ${count} entries (TTL or Size Limit)`);
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
      bleedEdgeWidth: (() => {
        const val = bleedEdge ? bleedEdgeWidthMm : 0;
        return val;
      })(),
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

      const state = useSettingsStore.getState();
      const settings: GlobalSettings = {
        bleedEdgeWidth: bleedEdge ? bleedEdgeWidthMm : 0,
        bleedEdgeUnit,
        withBleedSourceAmount: state.withBleedSourceAmount,
        withBleedTargetMode: state.withBleedTargetMode,
        withBleedTargetAmount: state.withBleedTargetAmount,
        noBleedTargetMode: state.noBleedTargetMode,
        noBleedTargetAmount: state.noBleedTargetAmount,
      };

      for (const card of allCards) {
        if (!card.imageId) continue;
        const img = imagesById.get(card.imageId);

        // Check if fully processed using same smart logic as settings change
        if (!img?.displayBlob || !img?.displayBlobDarkened || !img?.exportBlob) {
          unprocessedCards.push(card);
          continue;
        }

        const expectedBleedWidth = getExpectedBleedWidth(card, settings.bleedEdgeWidth, settings);

        const isDpiMatch = img.exportDpi === dpi;
        const isBleedMatch = img.exportBleedWidth !== undefined && Math.abs(img.exportBleedWidth - expectedBleedWidth) < 0.001;

        const isProcessed = isDpiMatch && isBleedMatch;

        if (!isProcessed) {
          unprocessedCards.push(card);
        } else if (tracking) {
          // If tracking import, report cache hits immediately
          importStats.markCacheHit(card.uuid);
          importStats.markCardProcessed(card.uuid);
        }
      }

      if (unprocessedCards.length > 0) {
        for (const card of unprocessedCards) {
          void ensureProcessed(card, Priority.LOW);
        }
      }
    };

    // Debounce slightly to avoid thrashing on bulk adds
    const timer = setTimeout(() => processUnprocessed(), 200);
    return () => clearTimeout(timer);
  }, [allCards, ensureProcessed, dpi, bleedEdge, bleedEdgeWidthMm, bleedEdgeUnit]);

  // Trigger reprocessing when DPI or bleed settings actually change
  const prevDpi = useRef(dpi);
  const prevBleedEdge = useRef(bleedEdge);
  const prevBleedEdgeWidth = useRef(bleedEdgeWidth);
  // Track previous bleed settings to trigger updates (new schema)
  const prevWithBleedSourceAmount = useRef(withBleedSourceAmount);
  const prevWithBleedTargetMode = useRef(withBleedTargetMode);
  const prevWithBleedTargetAmount = useRef(withBleedTargetAmount);
  const prevNoBleedTargetMode = useRef(noBleedTargetMode);
  const prevNoBleedTargetAmount = useRef(noBleedTargetAmount);

  useEffect(() => {
    const dpiChanged = prevDpi.current !== dpi;
    const bleedEdgeChanged = prevBleedEdge.current !== bleedEdge;
    const bleedWidthChanged = prevBleedEdgeWidth.current !== bleedEdgeWidthMm;

    // Check for changes in bleed settings
    const bleedSettingsChanged =
      prevWithBleedSourceAmount.current !== withBleedSourceAmount ||
      prevWithBleedTargetMode.current !== withBleedTargetMode ||
      prevWithBleedTargetAmount.current !== withBleedTargetAmount ||
      prevNoBleedTargetMode.current !== noBleedTargetMode ||
      prevNoBleedTargetAmount.current !== noBleedTargetAmount;

    // Update all refs for next comparison
    prevDpi.current = dpi;
    prevBleedEdge.current = bleedEdge;
    prevBleedEdgeWidth.current = bleedEdgeWidthMm;
    prevWithBleedSourceAmount.current = withBleedSourceAmount;
    prevWithBleedTargetMode.current = withBleedTargetMode;
    prevWithBleedTargetAmount.current = withBleedTargetAmount;
    prevNoBleedTargetMode.current = noBleedTargetMode;
    prevNoBleedTargetAmount.current = noBleedTargetAmount;

    // Only reprocess if settings actually changed
    if (!dpiChanged && !bleedEdgeChanged && !bleedWidthChanged && !bleedSettingsChanged) {
      return;
    }

    const timer = setTimeout(async () => {
      cancelProcessing();
      const allCards = await db.cards.toArray();
      // Only reprocess cards that have an image AND whose processed state doesn't match new settings
      const cardsWithImages = allCards.filter(c => c.imageId);

      if (cardsWithImages.length === 0) return;

      const state = useSettingsStore.getState();
      const settings: GlobalSettings = {
        bleedEdgeWidth: bleedEdge ? bleedEdgeWidthMm : 0,
        bleedEdgeUnit,
        withBleedSourceAmount: state.withBleedSourceAmount,
        withBleedTargetMode: state.withBleedTargetMode,
        withBleedTargetAmount: state.withBleedTargetAmount,
        noBleedTargetMode: state.noBleedTargetMode,
        noBleedTargetAmount: state.noBleedTargetAmount,
      };

      const images = await db.images.toArray();
      const imageMap = new Map(images.map(i => [i.id, i]));

      const cardsToReprocess = cardsWithImages.filter(card => {
        if (!card.imageId) return false;
        const img = imageMap.get(card.imageId);
        if (!img) return true; // Image record missing, reprocess



        // Check if image matches current settings
        const expectedBleedWidth = getExpectedBleedWidth(card, settings.bleedEdgeWidth, settings);

        // Conditions requiring reprocessing:
        // 1. Export DPI mismatch
        if (img.exportDpi !== dpi) return true;

        // 2. Export bleed width mismatch (allow small float diff)
        if (img.exportBleedWidth === undefined) return true;
        const diff = Math.abs(img.exportBleedWidth - expectedBleedWidth);
        if (diff > 0.001) return true;

        // 3. Missing blobs (shouldn't happen if fully processed, but good safety)
        if (!img.displayBlob || !img.exportBlob) return true;

        return false;
      });

      if (cardsToReprocess.length > 0) {
        void reprocessSelectedImages(cardsToReprocess, bleedEdge ? bleedEdgeWidthMm : 0);
      }
    }, 500); // Debounce by 500ms

    return () => clearTimeout(timer);
  }, [
    allCards, ensureProcessed, dpi, bleedEdgeUnit,
    bleedEdge, bleedEdgeWidthMm, reprocessSelectedImages, cancelProcessing,
    withBleedSourceAmount, withBleedTargetMode, withBleedTargetAmount,
    noBleedTargetMode, noBleedTargetAmount
  ]);

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
            <Suspense fallback={<PageViewLoader />}>
              <UploadSection
                isCollapsed={false}
                cardCount={cardCount}
                mobile={true}
                onUploadComplete={() => setActiveMobileView("preview")}
              />
            </Suspense>
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
            <Suspense fallback={<PageViewLoader />}>
              <PageSettingsControls
                reprocessSelectedImages={reprocessSelectedImages}
                cancelProcessing={cancelProcessing}
                cards={allCards}
                mobile={true}
              />
            </Suspense>
          </div>
        </div>
      </div >
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
          <Suspense fallback={<PageViewLoader />}>
            <UploadSection
              isCollapsed={isUploadPanelCollapsed}
              cardCount={cardCount}
            />
          </Suspense>
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
          <Suspense fallback={<PageViewLoader />}>
            <PageSettingsControls
              reprocessSelectedImages={reprocessSelectedImages}
              cancelProcessing={cancelProcessing}
              cards={allCards}
            />
          </Suspense>
        </div>
      </div>


    </>
  );
}

