import { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { FileUp, Eye, Settings } from "lucide-react";

import { useLiveQuery } from "dexie-react-hooks";
import type { CardOption } from "../../../shared/types";

import { ResizeHandle } from "../components/CardEditorModal/ResizeHandle";
import { ToastContainer } from "../components/common";
import { PageView, PageSettingsControls } from "../components/PageView";
import { UploadSection } from "../components/UploadSection";

import { useImageProcessing } from "../hooks/useImageProcessing";
import { useProcessingMonitor } from "../hooks/useProcessingMonitor";
import { useCardEnrichment } from "../hooks/useCardEnrichment";
import { useSettingsStore, useProjectStore, useUserPreferencesStore } from "../store";
import { useLoadingStore } from "../store/loading";
import { db, type Image } from "../db";
import { ImageProcessor, Priority } from "../helpers/imageProcessor";
import { rebalanceCardOrders } from "@/helpers/dbUtils";
import { enforceImageCacheLimits, enforceMetadataCacheLimits } from "../helpers/cacheUtils";
import { queueBulkPreRender } from "../helpers/effectCache";
import { hasActiveAdjustments } from "../helpers/adjustmentUtils";
import { ensureBuiltinCardbacksInDb } from "../helpers/cardbackLibrary";
import { initializeFlipState, useSelectionStore } from "../store/selection";
import { useFilteredAndSortedCards } from "../hooks/useFilteredAndSortedCards";

import { getExpectedBleedWidth, getHasBuiltInBleed, getEffectiveBleedMode, type GlobalSettings } from "../helpers/imageSpecs";



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

  // Filter settings (needed for change detection in auto-flip)
  const filterManaCost = useSettingsStore((state) => state.filterManaCost);
  const filterColors = useSettingsStore((state) => state.filterColors);
  const filterTypes = useSettingsStore((state) => state.filterTypes);
  const filterCategories = useSettingsStore((state) => state.filterCategories);
  const filterMatchType = useSettingsStore((state) => state.filterMatchType);

  // Convert to mm for processing (stored value may be in inches)
  const bleedEdgeWidthMm = bleedEdgeUnit === 'in' ? bleedEdgeWidth * 25.4 : bleedEdgeWidth;

  // UI Panels (Global User Preferences)
  const settingsPanelWidth = useUserPreferencesStore((state) => state.preferences?.settingsPanelWidth ?? 320);
  const setSettingsPanelWidth = useUserPreferencesStore((state) => state.setSettingsPanelWidth);
  const isSettingsPanelCollapsed = useUserPreferencesStore((state) => state.preferences?.isSettingsPanelCollapsed ?? false);
  const setIsSettingsPanelCollapsed = useUserPreferencesStore((state) => state.setIsSettingsPanelCollapsed);
  const toggleSettingsPanel = useCallback(() => setIsSettingsPanelCollapsed(!isSettingsPanelCollapsed), [isSettingsPanelCollapsed, setIsSettingsPanelCollapsed]);

  const imageProcessor = useMemo(() => ImageProcessor.getInstance(), []);

  // Monitor worker activity to show/hide processing toast at the right time
  useProcessingMonitor(imageProcessor);

  const isUploadPanelCollapsed = useUserPreferencesStore((state) => state.preferences?.isUploadPanelCollapsed ?? false);
  const setIsUploadPanelCollapsed = useUserPreferencesStore((state) => state.setIsUploadPanelCollapsed);
  const toggleUploadPanel = useCallback(() => setIsUploadPanelCollapsed(!isUploadPanelCollapsed), [isUploadPanelCollapsed, setIsUploadPanelCollapsed]);
  const uploadPanelWidth = useUserPreferencesStore((state) => state.preferences?.uploadPanelWidth ?? 320);
  const setUploadPanelWidth = useUserPreferencesStore((state) => state.setUploadPanelWidth);

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

  // On startup, ensure built-in cardbacks are properly initialized BEFORE card processing
  // This must run early to avoid race conditions with stale cached images
  useEffect(() => {
    void ensureBuiltinCardbacksInDb();
  }, []);

  // On startup, initialize flip state from local storage
  useEffect(() => {
    void initializeFlipState();
  }, []);



  // On startup, clean expired image cache entries (non-blocking)
  useEffect(() => {
    const timer = setTimeout(() => {
      enforceImageCacheLimits();
      enforceMetadataCacheLimits();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // Get current DPI for comparison in processUnprocessed
  const dpi = useSettingsStore((state) => state.dpi);

  // Subscribe to imageVersion to trigger refresh when images are processed
  // This works around a Dexie useLiveQuery reactivity issue where updates to
  // displayBlob on existing image records don't always trigger re-renders
  const imageVersion = useLoadingStore((state) => state.imageVersion);

  // PERFORMANCE: Centralized database queries (single source of truth)
  // This replaces multiple redundant useLiveQuery calls across child components
  const currentProjectId = useProjectStore((state) => state.currentProjectId);
  const activeProjectIdRef = useRef(currentProjectId);
  useEffect(() => { activeProjectIdRef.current = currentProjectId; }, [currentProjectId]);

  // Live query for cards - filtered by current project
  // In unified architecture, db.cards contains ALL projects' cards
  const allCardsQuery = useLiveQuery(async () => {
    if (!currentProjectId) return [];
    return db.cards
      .where('projectId').equals(currentProjectId)
      .sortBy('order');
  }, [currentProjectId]);


  // Rebalance card orders on project switch to prevent floating point issues
  useEffect(() => {
    if (currentProjectId) {
      const timer = setTimeout(() => {
        void rebalanceCardOrders(currentProjectId);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [currentProjectId]);

  const allImagesQuery = useLiveQuery(async () => {
    const images: Image[] = [];
    await db.images.each((img) => {
      // Exclude heavy originalBlob from UI state to prevent OOM
      // We process one by one in ensureProcessed, so we don't need it here
      const { originalBlob: _, ...rest } = img;
      images.push(rest as Image);
    });
    return images;
  }, [imageVersion, currentProjectId]);
  // Also query cardbacks - they share the same shape for useImageCache
  const allCardbacksQuery = useLiveQuery(() => db.cardbacks.toArray(), []);


  const allCards = allCardsQuery ?? EMPTY_CARDS;
  // Apply filter/sort settings from store
  const { filteredAndSortedCards, idsToFlip } = useFilteredAndSortedCards(allCards);

  // Auto-flip logic based on filters
  // Auto-flip logic based on filters - Event Driven
  const setFlipped = useSelectionStore((state) => state.setFlipped);

  // Create a stable hash of filter state to detect actual changes
  const filtersHash = useMemo(() => {
    return [
      filterManaCost.join(','),
      filterColors.sort().join(','),
      filterTypes.sort().join(','),
      filterCategories.sort().join(','),
      filterMatchType
    ].join('|');
  }, [filterManaCost, filterColors, filterTypes, filterCategories, filterMatchType]);

  const prevFiltersHash = useRef<string | null>(null);

  useEffect(() => {
    // Only execute auto-flip if filters actually changed (or first load)
    const filtersChanged = prevFiltersHash.current !== filtersHash;

    if (filtersChanged) {
      // Update hash immediately so we don't re-trigger on next render if nothing else changed
      prevFiltersHash.current = filtersHash;

      if (idsToFlip && idsToFlip.length > 0) {
        // Group by target state
        const toTrue = idsToFlip.filter(x => x.targetState).map(x => x.uuid);
        const toFalse = idsToFlip.filter(x => !x.targetState).map(x => x.uuid);

        // Perform updates
        if (toTrue.length > 0) setFlipped(toTrue, true);
        if (toFalse.length > 0) setFlipped(toFalse, false);
      }
    }
  }, [idsToFlip, setFlipped, filtersHash]);
  // Merge images and cardbacks for PageView - both have id, displayBlob, displayBlobDarkened
  const allImages = useMemo(() => {
    const images = allImagesQuery ?? EMPTY_IMAGES;
    const cardbacks = allCardbacksQuery ?? [];
    // Cast cardbacks to Image type since they share the necessary fields
    return [...images, ...cardbacks as unknown as Image[]];
  }, [allImagesQuery, allCardbacksQuery]);

  // Derived values (no additional DB queries needed)
  const cardCount = allCards.length;

  const { getLoadingState, ensureProcessed, reprocessSelectedImages, cancelProcessing } =
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
      // Use efficient cursor iteration to avoid loading all huge blobs into memory at once
      const imagesById = new Map<string, Image>();
      await db.images.each((img) => {
        const { originalBlob: _, ...rest } = img;
        imagesById.set(img.id, rest as Image);
      });

      // Deduplicate by imageId - only process each unique image once
      const imageIdToRepresentativeCard = new Map<string, CardOption>();

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

        // Skip if we already have a representative card for this imageId
        if (imageIdToRepresentativeCard.has(card.imageId)) continue;

        const img = imagesById.get(card.imageId);

        // Check if fully processed using same smart logic as ensureProcessed
        if (!img?.displayBlob || !img?.displayBlobDarkened || !img?.exportBlob) {
          imageIdToRepresentativeCard.set(card.imageId, card);
          continue;
        }

        const expectedBleedWidth = getExpectedBleedWidth(card, settings.bleedEdgeWidth, settings);
        const hasBuiltInBleed = getHasBuiltInBleed(card);
        const effectiveBleedMode = getEffectiveBleedMode(card, settings);

        const isDpiMatch = img.exportDpi === dpi;
        const isBleedMatch = img.exportBleedWidth !== undefined && Math.abs(img.exportBleedWidth - expectedBleedWidth) < 0.001;
        // Also check generation parameters match (same as ensureProcessed smart cache)
        const isBuiltInBleedMatch = img.generatedHasBuiltInBleed === hasBuiltInBleed;
        const isBleedModeMatch = img.generatedBleedMode === effectiveBleedMode;

        const isProcessed = isDpiMatch && isBleedMatch && isBuiltInBleedMatch && isBleedModeMatch;

        if (!isProcessed) {
          imageIdToRepresentativeCard.set(card.imageId, card);
        }
        // Note: Don't call markCacheHit/markCardProcessed here - ensureProcessed handles cache tracking
      }

      const uniqueUnprocessedCount = imageIdToRepresentativeCard.size;
      if (uniqueUnprocessedCount > 0) {
        // Process once per unique imageId using representative card
        // ImageProcessor's queue handles worker concurrency limiting
        for (const card of imageIdToRepresentativeCard.values()) {
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

      const imageMap = new Map<string, Image>();
      await db.images.each((img) => {
        const { originalBlob: _, ...rest } = img;
        imageMap.set(img.id, rest as Image);
      });

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

        // After reprocessing, queue effect re-rendering for cards with active adjustments
        // This is scheduled after a delay to let base image processing complete first
        if (dpiChanged) {
          setTimeout(async () => {
            const freshImages = await db.images.toArray();
            const freshImageMap = new Map(freshImages.map(i => [i.id, i]));

            const effectTasks = cardsToReprocess
              .filter(card => {
                const img = card.imageId ? freshImageMap.get(card.imageId) : undefined;
                return card.overrides && hasActiveAdjustments(card.overrides) && img?.exportBlob;
              })
              .map(card => ({
                card,
                exportBlob: freshImageMap.get(card.imageId!)!.exportBlob!,
              }));

            if (effectTasks.length > 0) {
              queueBulkPreRender(effectTasks);
            }
          }, 2000); // Wait for base image reprocessing to complete
        }
      }
    }, 500); // Debounce by 500ms

    return () => clearTimeout(timer);
  }, [
    allCards, ensureProcessed, dpi, bleedEdgeUnit,
    withBleedSourceAmount, withBleedTargetMode, withBleedTargetAmount,
    noBleedTargetMode, noBleedTargetAmount,
    // Add missing deps
    reprocessSelectedImages, cancelProcessing, bleedEdge, bleedEdgeWidthMm
  ]);

  // Mobile Layout
  if (isMobile) {
    return (
      <div className={`flex ${isLandscape ? 'flex-row' : 'flex-col'} h-dvh overflow-hidden bg-gray-50 dark:bg-gray-900`}>
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

          {/* Preview tab uses visibility:hidden instead of display:none to preserve WebGL context
              on mobile when switching tabs. Using display:none corrupts the canvas on Android. */}
          <div
            className="h-full"
            style={{
              visibility: activeMobileView === "preview" ? "visible" : "hidden",
              position: activeMobileView === "preview" ? "relative" : "absolute",
              inset: 0,
              pointerEvents: activeMobileView === "preview" ? "auto" : "none",
            }}
          >
            <PageView
              getLoadingState={getLoadingState}
              ensureProcessed={ensureProcessed}
              cards={filteredAndSortedCards}
              allCards={allCards}
              images={allImages}
              mobile={true}
              active={activeMobileView === "preview"}
            />
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
      </div >
    );
  }

  // Desktop Layout
  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      <div className="flex flex-row flex-1 overflow-hidden relative">
        <div
          className="relative transition-all duration-200 ease-in-out z-30 h-full overflow-hidden"
          style={{
            width: isUploadPanelCollapsed ? 60 : uploadPanelWidth,
            minWidth: isUploadPanelCollapsed ? 60 : 320,
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

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden relative h-full">
          <PageView
            getLoadingState={getLoadingState}
            ensureProcessed={ensureProcessed}
            cards={filteredAndSortedCards}
            allCards={allCards}
            images={allImages}
          />

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
          }}
        >
          <PageSettingsControls
            reprocessSelectedImages={reprocessSelectedImages}
            cancelProcessing={cancelProcessing}
            cards={allCards}
          />
        </div>
      </div>
    </div>
  );
}

