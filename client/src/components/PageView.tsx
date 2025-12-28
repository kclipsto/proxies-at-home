/**
 * PageView - Minimal PixiJS canvas renderer
 * 
 * This component renders a scrollable container with a PixiJS canvas
 * that displays page backgrounds, card images, and cut guides.
 */

import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { Label } from "flowbite-react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { useSelectionStore } from "../store/selection";
import { useSettingsStore } from "../store";
import { type Image, db } from "../db";
import type { CardOption } from "../../../shared/types";
import type { useImageProcessing } from "../hooks/useImageProcessing";
import fullLogo from "../assets/fullLogo.png";
import {
  baseCardWidthMm,
  baseCardHeightMm,
  computeCardLayouts,
  chunkCards,
} from "../helpers/layout";
import PixiVirtualCanvas, { type CardWithGlobalLayout, type PageLayoutInfo } from "./PixiPage/PixiVirtualCanvas";
import { hashOverrides } from "../helpers/overridesHash";
import type { DarkenMode } from "../store/settings";
import { PageViewFloatingControls } from "./PageComponents/PageViewFloatingControls";
import { CardControlsOverlay, type CardControlLayout } from "./PageComponents/CardControlsOverlay";
import { PageViewContextMenu } from "./PageComponents/PageViewContextMenu";
import { PageViewSelectionBar } from "./PageComponents/PageViewSelectionBar";
import { ArtworkModal } from "./ArtworkModal";
import { CardEditorModalWrapper } from "./CardEditorModalWrapper";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModal";
import { usePageViewHotkeys } from "../hooks/usePageViewHotkeys";
import { usePageViewZoom } from "../hooks/usePageViewZoom";
import { PullToRefresh } from "./PullToRefresh";

// Constants
const MM_TO_PX = 96 / 25.4;
const PAGE_GAP_PX = 16;

type PageViewProps = {
  getLoadingState: ReturnType<typeof useImageProcessing>["getLoadingState"];
  ensureProcessed: ReturnType<typeof useImageProcessing>["ensureProcessed"];
  images: Image[];
  cards: CardOption[];
  mobile?: boolean;
  active?: boolean;
};



export function PageView({ cards, images, mobile, active = true }: PageViewProps) {
  // Settings from store
  const pageSizeUnit = useSettingsStore((s) => s.pageSizeUnit);
  const pageWidth = useSettingsStore((s) => s.pageWidth);
  const pageHeight = useSettingsStore((s) => s.pageHeight);
  const columns = useSettingsStore((s) => s.columns);
  const rows = useSettingsStore((s) => s.rows);
  const zoom = useSettingsStore((s) => s.zoom);
  const setZoom = useSettingsStore((s) => s.setZoom);
  const darkenMode = useSettingsStore((s) => s.darkenMode);
  const cardPositionX = useSettingsStore((s) => s.cardPositionX);
  const cardPositionY = useSettingsStore((s) => s.cardPositionY);
  const cardSpacingMm = useSettingsStore((s) => s.cardSpacingMm);
  const bleedEdge = useSettingsStore((s) => s.bleedEdge);
  const bleedEdgeWidth = useSettingsStore((s) => s.bleedEdgeWidth);
  const bleedEdgeUnit = useSettingsStore((s) => s.bleedEdgeUnit);
  const guideWidth = useSettingsStore((s) => s.guideWidth);
  const cutLineStyle = useSettingsStore((s) => s.cutLineStyle);
  const perCardGuideStyle = useSettingsStore((s) => s.perCardGuideStyle);
  const guideColor = useSettingsStore((s) => s.guideColor);
  const guidePlacement = useSettingsStore((s) => s.guidePlacement);

  // Flipped cards for back image display
  const flippedCards = useSelectionStore((s) => s.flippedCards);

  // Keyboard shortcuts (delete, duplicate, help, etc.)
  // Filter out back cards (they have linkedFrontId) so Ctrl+A only selects front cards
  const allCardUuids = useMemo(() => cards.filter(c => !c.linkedFrontId).map(c => c.uuid), [cards]);
  usePageViewHotkeys(allCardUuids);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    cardUuid: string | null;
  }>({ visible: false, x: 0, y: 0, cardUuid: null });

  // Range selection handler (moved below visibleCards declaration)

  // DnD sensors for card reordering
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    })
  );

  // Active drag state for canvas coordination
  const [activeId, setActiveId] = useState<string | null>(null);

  // Pinch-to-zoom for mobile
  const { scrollContainerRef: scrollRef, isPinching, updateCenterOffset } = usePageViewZoom({
    zoom,
    setZoom,
    mobile,
    active,
    pageWidth,
    pageHeight,
  });

  // Refs and state
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const [containerWidth, setContainerWidth] = useState(800);
  const [renderedCardUuids, setRenderedCardUuids] = useState<Set<string>>(new Set());

  // Derived values
  const pageCapacity = columns * rows;
  const mobileZoomFactor = mobile ? 0.4 : 1;
  const effectiveZoom = zoom * mobileZoomFactor;
  const pageWidthPx = pageWidth * (pageSizeUnit === 'in' ? 96 : MM_TO_PX);
  const pageHeightPx = pageHeight * (pageSizeUnit === 'in' ? 96 : MM_TO_PX);
  const effectiveBleedWidth = bleedEdge ? (bleedEdgeUnit === 'in' ? bleedEdgeWidth * 25.4 : bleedEdgeWidth) : 0;
  // Top padding matches side gap from centering: (containerWidth - scaledPageWidth) / 2
  // On mobile, use a smaller minimum since page is scaled down
  const scaledPageWidth = pageWidthPx * effectiveZoom;
  const sideGap = Math.max(0, (containerWidth - scaledPageWidth) / 2);
  const topPaddingPx = mobile
    ? Math.min(sideGap, 32) // Smaller top padding on mobile
    : Math.min(Math.max(0, sideGap - PAGE_GAP_PX), 100);

  // Source settings for layout calculations
  const sourceSettings = useMemo(() => ({
    withBleedSourceAmount: useSettingsStore.getState().withBleedSourceAmount,
    withBleedTargetMode: useSettingsStore.getState().withBleedTargetMode,
    withBleedTargetAmount: useSettingsStore.getState().withBleedTargetAmount,
    noBleedTargetMode: useSettingsStore.getState().noBleedTargetMode,
    noBleedTargetAmount: useSettingsStore.getState().noBleedTargetAmount,
    bleedEdgeWidth: effectiveBleedWidth,
  }), [effectiveBleedWidth]);

  // Dark mode detection - use matchMedia to match CSS @media (prefers-color-scheme: dark)
  const [isDarkMode, setIsDarkMode] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop((e.target as HTMLDivElement).scrollTop);
    updateCenterOffset();
  }, [updateCenterOffset]);



  // Force PixiJS canvas remount when cards are cleared to get fresh WebGL context
  // This fixes issues where WebGL context is lost during image processing
  const [pixiKey, setPixiKey] = useState(0);
  const prevCardsLengthRef = useRef(cards.length);
  useEffect(() => {
    if (prevCardsLengthRef.current > 0 && cards.length === 0) {
      setPixiKey(k => k + 1);
    }
    prevCardsLengthRef.current = cards.length;
  }, [cards.length]);

  // Observe container dimensions
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setContainerHeight(el.clientHeight);
    setContainerWidth(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerHeight(entry.contentRect.height);
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRef]);

  // Zoom is not persisted - always starts at 1.0 (default)

  // Ctrl+Scroll zoom handling
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        const isInside = container.contains(e.target as Node);
        if (isInside) {
          e.preventDefault();
          const sensitivity = 0.001;
          const delta = -e.deltaY * sensitivity;
          const currentZoom = useSettingsStore.getState().zoom;
          const newZoom = Math.min(Math.max(0.1, currentZoom + delta), 5);
          setZoom(newZoom);
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [scrollRef, setZoom]);

  // Keyboard shortcuts: Ctrl++, Ctrl+-, Ctrl+0, Ctrl+A, Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape key - deselect all (no modifier needed)
      if (e.key === 'Escape') {
        e.preventDefault();
        useSelectionStore.getState().clearSelection();
        return;
      }

      // Other shortcuts require Ctrl/Cmd
      if (!e.ctrlKey && !e.metaKey) return;

      const zoomStep = 0.1;
      const currentZoom = useSettingsStore.getState().zoom;

      // Ctrl/Cmd + Plus (= or +)
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setZoom(Math.min(5, currentZoom + zoomStep));
      }
      // Ctrl/Cmd + Minus
      else if (e.key === '-') {
        e.preventDefault();
        setZoom(Math.max(0.1, currentZoom - zoomStep));
      }
      // Ctrl/Cmd + 0 (reset to 1x)
      else if (e.key === '0') {
        e.preventDefault();
        setZoom(1.0);
      }
      // Note: Ctrl+A (select all) is handled by usePageViewHotkeys with input focus check
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [setZoom, cards]);

  // Filter visible cards (exclude back cards - they're shown via flip)
  const visibleCards = useMemo(() => {
    return cards.filter((c) => !c.linkedFrontId);
  }, [cards]);

  // Local cards state for canvas dynamic reordering during drag
  const [localCards, setLocalCards] = useState<CardOption[]>([]);

  // Ref to track the latest localCards for the async handleDragEnd callback
  const localCardsRef = useRef<CardOption[]>([]);
  useEffect(() => {
    localCardsRef.current = localCards;
  }, [localCards]);

  // Sync localCards from visibleCards when not dragging
  useEffect(() => {
    if (!activeId) {
      setLocalCards(visibleCards);
    }
  }, [visibleCards, activeId]);

  // Range selection handler (needs visibleCards)
  const selectRange = useSelectionStore((s) => s.selectRange);
  const lastClickedIndex = useSelectionStore((s) => s.lastClickedIndex);
  const handleRangeSelect = useCallback((targetIndex: number) => {
    if (lastClickedIndex !== null) {
      selectRange(localCards.map(c => c.uuid), targetIndex);
    }
  }, [lastClickedIndex, selectRange, localCards]);

  // Handle card drag start - track active drag
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  // Handle drag over - update localCards for canvas dynamic reordering
  const handleDragOver = useCallback((event: { active: { id: string | number }; over: { id: string | number } | null }) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLocalCards(current => {
      const oldIndex = current.findIndex(c => c.uuid === active.id);
      const newIndex = current.findIndex(c => c.uuid === over.id);
      if (oldIndex === -1 || newIndex === -1) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  }, []);

  // Handle card drag end - persist the current localCards order to database
  const handleDragEnd = useCallback(async () => {
    // Get current localCards order from ref (avoids stale closure)
    const currentCards = localCardsRef.current;

    // Persist the current order to database
    const updates = currentCards.map((card, index) => ({
      key: card.uuid,
      changes: { order: (index + 1) * 10 },
    }));
    await db.cards.bulkUpdate(updates);

    // Clear activeId after database update
    setActiveId(null);
  }, []);

  // Sortable IDs for DndContext - use visibleCards (stable during drag)
  const sortableIds = useMemo(() => visibleCards.map(c => c.uuid), [visibleCards]);

  // Map from front card UUID to back card
  const backCardMap = useMemo(() => {
    const map = new Map<string, CardOption>();
    for (const card of cards) {
      if (card.linkedFrontId) {
        map.set(card.linkedFrontId, card);
      }
    }
    return map;
  }, [cards]);

  // Map from image ID to image blob data
  const imageDataById = useMemo(() => {
    const map = new Map<string, { displayBlob?: Blob; darknessFactor?: number }>();
    for (const img of images) {
      map.set(img.id, { displayBlob: img.displayBlob, darknessFactor: img.darknessFactor });
    }
    return map;
  }, [images]);

  // Create blob URLs for drag overlay (cleaned up on unmount)
  const processedImageUrlsRef = useRef<Map<string, string>>(new Map());
  const processedImageUrls = useMemo(() => {
    const urls: Record<string, string> = {};
    // Revoke old URLs that are no longer needed
    const currentIds = new Set<string>();
    for (const [id, data] of imageDataById.entries()) {
      if (data.displayBlob) {
        currentIds.add(id);
        // Reuse existing URL if blob hasn't changed
        if (!processedImageUrlsRef.current.has(id)) {
          processedImageUrlsRef.current.set(id, URL.createObjectURL(data.displayBlob));
        }
        urls[id] = processedImageUrlsRef.current.get(id)!;
      }
    }
    // Clean up old URLs
    for (const [id, url] of processedImageUrlsRef.current.entries()) {
      if (!currentIds.has(id)) {
        URL.revokeObjectURL(url);
        processedImageUrlsRef.current.delete(id);
      }
    }
    return urls;
  }, [imageDataById]);

  // Page count and content dimensions
  const pageCount = Math.max(1, Math.ceil(localCards.length / pageCapacity));
  const totalContentHeight = pageCount * pageHeightPx + (pageCount + 1) * PAGE_GAP_PX + topPaddingPx;

  // Page layout info for PixiJS
  const pixiPages = useMemo((): PageLayoutInfo[] => {
    return Array.from({ length: pageCount }, (_, i) => ({
      pageIndex: i,
      pageWidthPx: pageWidthPx,
      pageHeightPx: pageHeightPx,
      pageYOffset: topPaddingPx + PAGE_GAP_PX + i * (pageHeightPx + PAGE_GAP_PX),
    }));
  }, [pageCount, pageWidthPx, pageHeightPx, topPaddingPx]);

  // Card positions for PixiJS
  // Use a consistent card size for grid layout (base + bleed) to prevent shifts when cards are added
  const fixedCardWidthMm = baseCardWidthMm + effectiveBleedWidth * 2;
  const fixedCardHeightMm = baseCardHeightMm + effectiveBleedWidth * 2;

  // Serialized overrides for dependency tracking (extracted to avoid complex expressions in dep array)
  const frontCardOverridesKey = localCards.map(c => `${c.overrides?.brightness}:${c.overrides?.contrast}:${c.overrides?.saturation}:${c.overrides?.holoEffect}:${c.overrides?.holoAnimation}`).join(',');
  const backCardOverridesKey = Array.from(backCardMap.values()).map(bc => `${bc.overrides?.brightness}:${bc.overrides?.contrast}:${bc.overrides?.saturation}:${bc.overrides?.holoEffect}:${bc.overrides?.holoAnimation}`).join(',');

  const globalPixiCards = useMemo((): CardWithGlobalLayout[] => {
    const pageWidthMm = pageWidth * (pageSizeUnit === 'in' ? 25.4 : 1);
    const pageHeightMm = pageHeight * (pageSizeUnit === 'in' ? 25.4 : 1);

    // Fixed grid dimensions based on settings (not actual cards)
    const gridWidthMm = columns * fixedCardWidthMm + (columns - 1) * cardSpacingMm;
    const gridHeightMm = rows * fixedCardHeightMm + (rows - 1) * cardSpacingMm;
    const gridStartXMm = (pageWidthMm - gridWidthMm) / 2 + cardPositionX;
    const gridStartYMm = (pageHeightMm - gridHeightMm) / 2 + cardPositionY;

    const result: CardWithGlobalLayout[] = [];
    const pages = chunkCards(localCards, pageCapacity);

    pages.forEach((page, pageIndex) => {
      const layouts = computeCardLayouts(page, sourceSettings, effectiveBleedWidth);

      page.forEach((card, index) => {
        const layout = layouts[index];
        const col = index % columns;
        const row = Math.floor(index / columns);

        // Position based on fixed grid cell, centered within the cell
        const cellXMm = gridStartXMm + col * (fixedCardWidthMm + cardSpacingMm);
        const cellYMm = gridStartYMm + row * (fixedCardHeightMm + cardSpacingMm);
        const xMm = cellXMm + (fixedCardWidthMm - layout.cardWidthMm) / 2;
        const yMm = cellYMm + (fixedCardHeightMm - layout.cardHeightMm) / 2;

        const imageData = card.imageId ? imageDataById.get(card.imageId) : undefined;
        const backCard = backCardMap.get(card.uuid);
        const backImageData = backCard?.imageId ? imageDataById.get(backCard.imageId) : undefined;

        // Always include card in globalPixiCards, even without displayBlob
        // PixiVirtualCanvas handles missing blobs gracefully (skips sprite creation)
        // This ensures change detection works when images are still processing
        result.push({
          card,
          imageBlob: imageData?.displayBlob,
          backBlob: backImageData?.displayBlob,
          frontImageId: card.imageId,
          backImageId: backCard?.imageId,
          backOverrides: backCard?.overrides, // Back card's overrides for per-face rendering
          darknessFactor: imageData?.darknessFactor ?? 0.5,
          globalX: xMm * MM_TO_PX,
          globalY: topPaddingPx + PAGE_GAP_PX + pageIndex * (pageHeightPx + PAGE_GAP_PX) + yMm * MM_TO_PX,
          width: layout.cardWidthMm * MM_TO_PX,
          height: layout.cardHeightMm * MM_TO_PX,
          bleedMm: layout.bleedMm,
          baseCardWidthMm,
          baseCardHeightMm,
          // Precomputed hashes for fast memo comparison
          overridesHash: hashOverrides(card.overrides),
          backOverridesHash: hashOverrides(backCard?.overrides),
        });
      });
    });

    return result;
    // frontCardOverridesKey and backCardOverridesKey are intentional - they detect nested override changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localCards, pageCapacity, pageWidth, pageHeight, pageSizeUnit, columns, rows, cardSpacingMm, cardPositionX, cardPositionY, sourceSettings, effectiveBleedWidth, backCardMap, imageDataById, pageHeightPx, fixedCardWidthMm, fixedCardHeightMm, topPaddingPx, frontCardOverridesKey, backCardOverridesKey]);

  // Guide color as number
  const perCardGuideColorNum = parseInt(guideColor.replace('#', ''), 16);

  // Card control layouts for overlay (content coordinates, not screen adjusted)
  // Scroll offset is applied via CSS transform on the container for perfect sync with PixiJS
  const cardControlLayouts = useMemo((): CardControlLayout[] => {
    // Only compute for visible cards in viewport (with margin)
    const viewportTop = scrollTop - 100;
    const viewportBottom = scrollTop + containerHeight + 100;

    return globalPixiCards
      .map((pixiCard, index) => {
        // Calculate position in content coordinates (zoomed but NOT scroll-adjusted)
        const contentX = Math.round(pixiCard.globalX * effectiveZoom); // Scaled X (rounded)
        const contentY = Math.round(pixiCard.globalY * effectiveZoom); // Scaled Y (rounded)
        const width = Math.round(pixiCard.width * effectiveZoom); // Scaled Width (rounded)
        const height = Math.round(pixiCard.height * effectiveZoom); // Scaled Height (rounded)
        // Viewport culling
        const cardBottom = contentY + height;
        if (cardBottom < viewportTop || contentY > viewportBottom) {
          return null;
        }

        return {
          card: pixiCard.card,
          globalIndex: index,
          screenX: contentX,
          screenY: contentY, // Content Y, not screen Y - scroll applied via container transform
          width,
          height,
          hasImage: renderedCardUuids.has(pixiCard.card.uuid),
        };
      })
      .filter((layout): layout is CardControlLayout => layout !== null);
  }, [globalPixiCards, effectiveZoom, scrollTop, containerHeight, renderedCardUuids]);

  // Render
  return (
    <>
      <div className={`w-full h-full overflow-hidden bg-gray-200 dark:bg-gray-800 ${mobile ? 'landscape:pl-6' : ''}`}>
        <PullToRefresh
          ref={scrollRef}
          onScroll={handleScroll}
          className="w-full h-full"
          style={{ touchAction: mobile ? 'auto' : 'none', scrollbarGutter: 'stable' }}
          disabled={!mobile || isPinching}
        >
          {cards.length === 0 ? (
            // Empty state
            <div className={`flex flex-col items-center justify-center h-full px-4 text-center`}>
              <div className={`flex flex-col ${!mobile ? 'md:flex-row' : ''} items-center gap-2 md:gap-4`}>
                <Label className={`text-5xl ${!mobile ? 'md:text-7xl' : ''} font-bold whitespace-nowrap`}>
                  Welcome to
                </Label>
                <img src={fullLogo} alt="Proxxied Logo" className={`h-40 ${!mobile ? 'md:h-36' : ''}`} />
              </div>
              <Label className="text-xl text-gray-600 mt-4">
                {mobile
                  ? "Enter a decklist or upload files in the upload tab to get started"
                  : "Enter a decklist or upload files to the left to get started"}
              </Label>
            </div>
          ) : (
            // Page content wrapper - creates scrollable area sized for all pages (zoomed)
            <div
              className="mx-auto relative"
              style={{
                width: pageWidthPx * effectiveZoom,
                height: totalContentHeight * effectiveZoom,
              }}
            >
              {/* Sticky container for canvas and controls overlay */}
              <div
                className="sticky top-0"
                style={{
                  width: pageWidthPx * effectiveZoom,
                  height: containerHeight,
                }}
              >
                {/* PixiJS Canvas */}
                <PixiVirtualCanvas
                  key={pixiKey}
                  cards={globalPixiCards}
                  pages={pixiPages}
                  viewportWidth={pageWidthPx * effectiveZoom}
                  viewportHeight={containerHeight}
                  scrollTop={scrollTop}
                  scrollContainerRef={scrollRef}
                  zoom={effectiveZoom}
                  globalDarkenMode={darkenMode as DarkenMode}
                  flippedCards={flippedCards}
                  activeId={activeId}
                  guideWidth={guideWidth}
                  cutLineStyle={cutLineStyle}
                  perCardGuideStyle={perCardGuideStyle}
                  perCardGuideColor={perCardGuideColorNum}
                  perCardGuidePlacement={guidePlacement}
                  isDarkMode={isDarkMode}
                  onRenderedCardsChange={setRenderedCardUuids}
                  style={{
                    width: pageWidthPx * effectiveZoom,
                    height: containerHeight,
                  }}
                />

                {/* Card control overlays - positioned over the PixiJS canvas */}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
                    <CardControlsOverlay
                      cardLayouts={cardControlLayouts}
                      containerWidth={pageWidthPx * effectiveZoom}
                      containerHeight={containerHeight}
                      scrollContainerRef={scrollRef}
                      mobile={mobile}
                      zoom={effectiveZoom}
                      onRangeSelect={handleRangeSelect}
                      setContextMenu={setContextMenu}
                    />
                  </SortableContext>

                  {/* Drag overlay - shows card image while dragging */}
                  <DragOverlay zIndex={50}>
                    {activeId && (() => {
                      const card = visibleCards.find(c => c.uuid === activeId);
                      if (!card) return null;

                      // Get actual card dimensions from globalPixiCards (matches canvas exactly)
                      const pixiCard = globalPixiCards.find(c => c.card.uuid === activeId);
                      if (!pixiCard) return null;

                      // Check if flipped - use back card image if flipped
                      const isFlipped = flippedCards.has(card.uuid);
                      const backCard = backCardMap.get(card.uuid);
                      const displayCard = isFlipped && backCard ? backCard : card;
                      const imageUrl = displayCard.imageId ? processedImageUrls[displayCard.imageId] : undefined;

                      if (!imageUrl) return null;

                      // Use actual card dimensions from globalPixiCards (already in px, apply zoom)
                      const cardWidth = pixiCard.width * effectiveZoom;
                      const cardHeight = pixiCard.height * effectiveZoom;

                      // Bleed from the per-card layout
                      const bleedPx = pixiCard.bleedMm * MM_TO_PX * effectiveZoom;
                      const baseWidth = cardWidth - 2 * bleedPx;
                      const baseHeight = cardHeight - 2 * bleedPx;
                      const cornerRadius = 2.5 * MM_TO_PX * effectiveZoom; // Standard card corner radius

                      // Guide settings
                      const showGuide = perCardGuideStyle !== 'none' && guideWidth > 0;
                      const isRounded = perCardGuideStyle.includes('rounded');
                      const isDashed = perCardGuideStyle.includes('dashed');
                      const isCorners = perCardGuideStyle.includes('corner');

                      // Corner length for corners-only style
                      const cornerLength = Math.min(baseWidth, baseHeight) * 0.15;
                      const dashArray = isDashed ? `${guideWidth * 3} ${guideWidth * 2}` : undefined;

                      return (
                        <div
                          className="relative shadow-2xl rounded-lg overflow-visible"
                          style={{ width: cardWidth, height: cardHeight }}
                        >
                          <img
                            src={imageUrl}
                            alt={card.name}
                            className="w-full h-full object-cover rounded-lg"
                            draggable={false}
                          />
                          {/* Cut guides on drag overlay */}
                          {showGuide && (
                            <svg
                              className="absolute pointer-events-none"
                              style={{
                                left: bleedPx,
                                top: bleedPx,
                                width: baseWidth,
                                height: baseHeight,
                              }}
                              viewBox={`0 0 ${baseWidth} ${baseHeight}`}
                            >
                              {isCorners ? (
                                // Corners only - draw L-shaped corners
                                <>
                                  {/* Top-left corner */}
                                  <path
                                    d={isRounded
                                      ? `M ${guideWidth / 2} ${cornerLength + guideWidth / 2} L ${guideWidth / 2} ${cornerRadius + guideWidth / 2} Q ${guideWidth / 2} ${guideWidth / 2} ${cornerRadius + guideWidth / 2} ${guideWidth / 2} L ${cornerLength + guideWidth / 2} ${guideWidth / 2}`
                                      : `M ${guideWidth / 2} ${cornerLength} L ${guideWidth / 2} ${guideWidth / 2} L ${cornerLength} ${guideWidth / 2}`
                                    }
                                    fill="none"
                                    stroke={guideColor}
                                    strokeWidth={guideWidth}
                                    strokeDasharray={dashArray}
                                  />
                                  {/* Top-right corner */}
                                  <path
                                    d={isRounded
                                      ? `M ${baseWidth - cornerLength - guideWidth / 2} ${guideWidth / 2} L ${baseWidth - cornerRadius - guideWidth / 2} ${guideWidth / 2} Q ${baseWidth - guideWidth / 2} ${guideWidth / 2} ${baseWidth - guideWidth / 2} ${cornerRadius + guideWidth / 2} L ${baseWidth - guideWidth / 2} ${cornerLength + guideWidth / 2}`
                                      : `M ${baseWidth - cornerLength} ${guideWidth / 2} L ${baseWidth - guideWidth / 2} ${guideWidth / 2} L ${baseWidth - guideWidth / 2} ${cornerLength}`
                                    }
                                    fill="none"
                                    stroke={guideColor}
                                    strokeWidth={guideWidth}
                                    strokeDasharray={dashArray}
                                  />
                                  {/* Bottom-right corner */}
                                  <path
                                    d={isRounded
                                      ? `M ${baseWidth - guideWidth / 2} ${baseHeight - cornerLength - guideWidth / 2} L ${baseWidth - guideWidth / 2} ${baseHeight - cornerRadius - guideWidth / 2} Q ${baseWidth - guideWidth / 2} ${baseHeight - guideWidth / 2} ${baseWidth - cornerRadius - guideWidth / 2} ${baseHeight - guideWidth / 2} L ${baseWidth - cornerLength - guideWidth / 2} ${baseHeight - guideWidth / 2}`
                                      : `M ${baseWidth - guideWidth / 2} ${baseHeight - cornerLength} L ${baseWidth - guideWidth / 2} ${baseHeight - guideWidth / 2} L ${baseWidth - cornerLength} ${baseHeight - guideWidth / 2}`
                                    }
                                    fill="none"
                                    stroke={guideColor}
                                    strokeWidth={guideWidth}
                                    strokeDasharray={dashArray}
                                  />
                                  {/* Bottom-left corner */}
                                  <path
                                    d={isRounded
                                      ? `M ${cornerLength + guideWidth / 2} ${baseHeight - guideWidth / 2} L ${cornerRadius + guideWidth / 2} ${baseHeight - guideWidth / 2} Q ${guideWidth / 2} ${baseHeight - guideWidth / 2} ${guideWidth / 2} ${baseHeight - cornerRadius - guideWidth / 2} L ${guideWidth / 2} ${baseHeight - cornerLength - guideWidth / 2}`
                                      : `M ${cornerLength} ${baseHeight - guideWidth / 2} L ${guideWidth / 2} ${baseHeight - guideWidth / 2} L ${guideWidth / 2} ${baseHeight - cornerLength}`
                                    }
                                    fill="none"
                                    stroke={guideColor}
                                    strokeWidth={guideWidth}
                                    strokeDasharray={dashArray}
                                  />
                                </>
                              ) : (
                                // Full rectangle
                                <rect
                                  x={guideWidth / 2}
                                  y={guideWidth / 2}
                                  width={baseWidth - guideWidth}
                                  height={baseHeight - guideWidth}
                                  rx={isRounded ? cornerRadius : 0}
                                  ry={isRounded ? cornerRadius : 0}
                                  fill="none"
                                  stroke={guideColor}
                                  strokeWidth={guideWidth}
                                  strokeDasharray={dashArray}
                                />
                              )}
                            </svg>
                          )}
                          {/* Control buttons on drag overlay */}
                          <div className="absolute inset-0 pointer-events-none">
                            {/* Drag Handle */}
                            <div className="absolute right-[4px] top-1 w-4 h-4 bg-white text-green text-xs rounded-sm flex items-center justify-center opacity-100 z-20">
                              ⠿
                            </div>
                            {/* Flip Button */}
                            <div className={`absolute right-[4px] top-6 w-4 h-4 rounded-sm flex items-center justify-center z-20 ${isFlipped ? 'bg-blue-500 text-white' : 'bg-white text-gray-700'}`}>
                              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </DragOverlay>
                </DndContext>
              </div>
            </div>
          )}
        </PullToRefresh>
      </div>

      {/* Floating zoom controls */}
      <PageViewFloatingControls mobile={mobile} hasCards={cards.length > 0} />

      {/* Selection bar */}
      <PageViewSelectionBar cards={cards} mobile={mobile} />

      {/* Context menu */}
      <PageViewContextMenu
        contextMenu={contextMenu}
        setContextMenu={setContextMenu}
        cards={cards}
        flippedCards={flippedCards}
      />

      {/* Artwork selection modal */}
      <ArtworkModal />

      {/* Card editor modal */}
      <CardEditorModalWrapper />

      {/* Keyboard shortcuts help modal */}
      <KeyboardShortcutsModal />
    </>
  );
}