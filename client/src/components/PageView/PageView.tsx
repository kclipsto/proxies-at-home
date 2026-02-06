/**
 * PageView - Minimal PixiJS canvas renderer
 * 
 * This component renders a scrollable container with a PixiJS canvas
 * that displays page backgrounds, card images, and cut guides.
 */

import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { useSelectionStore } from "@/store/selection";
import { useSettingsStore } from "@/store";
import { undoableReorderCards, undoableReorderMultipleCards } from "@/helpers/undoableActions";
import { rebalanceCardOrders } from "@/helpers/dbUtils";
import { type Image, db } from "@/db";
import { useArtworkModalStore } from "@/store/artworkModal";
import { useCardEditorModalStore } from "@/store/cardEditorModal";
import type { CardOption } from "../../../../shared/types";
import type { useImageProcessing } from "@/hooks/useImageProcessing";
import fullLogo from "../../assets/fullLogo.png";
import {
  baseCardWidthMm,
  baseCardHeightMm,
  getCardTargetBleed,
  computeCardLayouts,
  chunkCards,
} from "@/helpers/layout";
import PixiVirtualCanvas, { type CardWithGlobalLayout, type PageLayoutInfo } from "../PixiPage/PixiVirtualCanvas";
import { hashOverrides } from "@/helpers/overridesHash";
import type { DarkenMode } from "../../store/settings";
import { PageViewFloatingControls } from "./PageComponents/PageViewFloatingControls";
import { CardControlsOverlay, type CardControlLayout } from "./PageComponents/CardControlsOverlay";
import { PageViewContextMenu } from "./PageComponents/PageViewContextMenu";
import { PageViewSelectionBar } from "./PageComponents/PageViewSelectionBar";
import { ArtworkModal } from "../ArtworkModal";
import { CardEditorModalWrapper } from "../CardEditorModal/CardEditorModalWrapper";
import { KeyboardShortcutsModal } from "../common";
import { usePageViewHotkeys } from "@/hooks/usePageViewHotkeys";
import { usePageViewZoom } from "@/hooks/usePageViewZoom";
import { PullToRefresh } from "../PullToRefresh";

// Constants
const MM_TO_PX = 96 / 25.4;
const PAGE_GAP_PX = 16;

type PageViewProps = {
  getLoadingState: ReturnType<typeof useImageProcessing>["getLoadingState"];
  ensureProcessed: ReturnType<typeof useImageProcessing>["ensureProcessed"];
  images: Image[];
  cards: CardOption[];
  allCards: CardOption[];
  mobile?: boolean;
  active?: boolean;
};



export function PageView({ cards, allCards, images, mobile, active = true }: PageViewProps) {
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
  const useCustomBackOffset = useSettingsStore((s) => s.useCustomBackOffset);
  const cardBackPositionX = useSettingsStore((s) => s.cardBackPositionX);
  const cardBackPositionY = useSettingsStore((s) => s.cardBackPositionY);
  const cardSpacingMm = useSettingsStore((s) => s.cardSpacingMm);
  const bleedEdge = useSettingsStore((s) => s.bleedEdge);
  const bleedEdgeWidth = useSettingsStore((s) => s.bleedEdgeWidth);
  const bleedEdgeUnit = useSettingsStore((s) => s.bleedEdgeUnit);
  const guideWidth = useSettingsStore((s) => s.guideWidth);
  const cutLineStyle = useSettingsStore((s) => s.cutLineStyle);
  const perCardGuideStyle = useSettingsStore((s) => s.perCardGuideStyle);
  const guideColor = useSettingsStore((s) => s.guideColor);
  const guidePlacement = useSettingsStore((s) => s.guidePlacement);
  const cutGuideLengthMm = useSettingsStore((s) => s.cutGuideLengthMm);
  const registrationMarks = useSettingsStore((s) => s.registrationMarks);
  const registrationMarksPortrait = useSettingsStore((s) => s.registrationMarksPortrait);

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
      // Ignore shortcuts if a modal is open
      if (useArtworkModalStore.getState().open || useCardEditorModalStore.getState().open) {
        return;
      }

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


  const [isOptimistic, setIsOptimistic] = useState(false);
  const [blockDbUpdates, setBlockDbUpdates] = useState(false);
  const lastOptimisticOrder = useRef<string[]>([]);
  const dragStartOrderRef = useRef<{ cardUuid: string; oldOrder: number } | null>(null);

  const multiDragState = useRef<{
    isMultiDrag: boolean;
    draggedCards: CardOption[];
    originalLocalCards: CardOption[];
    activeId: string | null;
    ghostIds: Set<string>;
  }>({
    isMultiDrag: false,
    draggedCards: [],
    originalLocalCards: [],
    activeId: null,
    ghostIds: new Set(),
  });

  // Sync localCards from visibleCards when not dragging
  useEffect(() => {
    if (blockDbUpdates) return;

    if (isOptimistic) {
      const currentOrder = visibleCards.map((c) => c.uuid);
      const expectedOrder = lastOptimisticOrder.current;

      if (JSON.stringify(currentOrder) === JSON.stringify(expectedOrder)) {
        setIsOptimistic(false);
        setLocalCards(visibleCards);
      }
    } else {
      if (!activeId) {
        setLocalCards(visibleCards);
      }
    }
  }, [visibleCards, activeId, isOptimistic, blockDbUpdates]);

  // Range selection handler (needs visibleCards)
  const selectRange = useSelectionStore((s) => s.selectRange);
  const lastClickedIndex = useSelectionStore((s) => s.lastClickedIndex);
  const handleRangeSelect = useCallback((targetIndex: number) => {
    if (lastClickedIndex !== null) {
      selectRange(localCards.map(c => c.uuid), targetIndex);
    }
  }, [lastClickedIndex, selectRange, localCards]);

  // Handle card drag start - track active drag and selection context
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const cardUuid = event.active.id as string;
    const card = localCards.find(c => c.uuid === cardUuid);
    const selectionStore = useSelectionStore.getState();

    // Check if dragging a selected card in a multi-selection group
    const isMultiSelect = selectionStore.selectedCards.has(cardUuid) && selectionStore.selectedCards.size > 1;

    if (isMultiSelect) {
      const draggedCards = localCards.filter(c => selectionStore.selectedCards.has(c.uuid));
      multiDragState.current = {
        isMultiDrag: true,
        draggedCards,
        originalLocalCards: [...localCards],
        activeId: cardUuid,
        ghostIds: new Set(),
      };

      // Collapse grid by removing selected cards, then inserting leader at its original index.
      const remainingCards = localCards.filter(c => !selectionStore.selectedCards.has(c.uuid));
      const leaderOriginalIndex = localCards.findIndex(c => c.uuid === cardUuid);
      const insertIndex = Math.min(leaderOriginalIndex, remainingCards.length);

      const newLocalCards = [...remainingCards];
      if (card) {
        newLocalCards.splice(insertIndex, 0, card);
      }

      // Defer state update required for dnd-kit to capture nodes
      setTimeout(() => {
        setLocalCards(newLocalCards);
      }, 50);
    } else {
      multiDragState.current = {
        isMultiDrag: false,
        draggedCards: [],
        originalLocalCards: [],
        activeId: null,
        ghostIds: new Set(),
      };
      if (card) {
        dragStartOrderRef.current = { cardUuid, oldOrder: card.order };
      }
    }

    setActiveId(cardUuid);
    setIsOptimistic(true);
    setBlockDbUpdates(true);
  }, [localCards]);

  const dragOverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle drag over - update localCards for canvas dynamic reordering
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Clear existing timeout to debounce
    if (dragOverTimeoutRef.current) {
      clearTimeout(dragOverTimeoutRef.current);
    }

    dragOverTimeoutRef.current = setTimeout(() => {
      const currentLocalCards = localCardsRef.current;
      const activeId = active.id;
      const overId = over.id;

      const oldIndex = currentLocalCards.findIndex((c) => c.uuid === activeId);
      const newIndex = currentLocalCards.findIndex((c) => c.uuid === overId);

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        setLocalCards((items) => {
          return arrayMove(items, oldIndex, newIndex);
        });
      }
    }, 100);
  }, []);

  // Handle card drag end - persist the current localCards order to database
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveId(null);
    setTimeout(() => {
      setBlockDbUpdates(false);
    }, 500);

    if (!over) {
      if (multiDragState.current.isMultiDrag) {
        setLocalCards(multiDragState.current.originalLocalCards);
      } else {
        setLocalCards(localCardsRef.current);
      }

      multiDragState.current = { isMultiDrag: false, draggedCards: [], originalLocalCards: [], activeId: null, ghostIds: new Set() };
      return;
    }

    if (multiDragState.current.isMultiDrag) {
      const { draggedCards, activeId: leaderId } = multiDragState.current;

      // Find leader position in collapsed list
      const leaderIndex = localCardsRef.current.findIndex(c => c.uuid === leaderId);
      if (leaderIndex === -1) {
        setLocalCards(multiDragState.current.originalLocalCards);
        return;
      }

      // Reconstruct: Insert dragged group at leader index
      const cardsWithoutLeader = localCardsRef.current.filter(c => c.uuid !== leaderId);
      const newLocalCards = [
        ...cardsWithoutLeader.slice(0, leaderIndex),
        ...draggedCards,
        ...cardsWithoutLeader.slice(leaderIndex)
      ];

      setLocalCards(newLocalCards);
      lastOptimisticOrder.current = newLocalCards.map(c => c.uuid);

      const adjustments: { uuid: string; oldOrder: number; newOrder: number }[] = [];

      // Calculate adjustments for ALL cards to ensure complete state restoration
      // This allows a single Undo to revert the entire rebalance operation
      newLocalCards.forEach((card, index) => {
        const newOrder = (index + 1) * 10;
        const original = multiDragState.current.originalLocalCards.find(c => c.uuid === card.uuid);

        if (original && original.order !== newOrder) {
          adjustments.push({ uuid: card.uuid, oldOrder: original.order, newOrder });
        }
      });

      await undoableReorderMultipleCards(adjustments);

      // Rebalance everything (applies the new orders to DB)
      // Use projectId from first card or fall back (newLocalCards are filtered to same project)
      const projectId = newLocalCards[0]?.projectId;
      if (projectId) await rebalanceCardOrders(projectId);

      multiDragState.current = { isMultiDrag: false, draggedCards: [], originalLocalCards: [], activeId: null, ghostIds: new Set() };
      return;
    }

    // Single Card Logic
    const oldIndex = localCardsRef.current.findIndex((c) => c.uuid === active.id);
    const newIndex = localCardsRef.current.findIndex((c) => c.uuid === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Calculate the new layout locally to ensure we have the correct neighbors
    // regardless of whether the visual state (localCards) has caught up yet
    const projectedCards = arrayMove(localCardsRef.current, oldIndex, newIndex);

    // Update local state immediately to match projection
    setLocalCards(projectedCards);
    lastOptimisticOrder.current = projectedCards.map((c) => c.uuid);

    const prevCard = projectedCards[newIndex - 1];
    const nextCard = projectedCards[newIndex + 1];

    let newOrder: number;

    if (!prevCard) {
      newOrder = (nextCard?.order || 0) - 10;
    } else if (!nextCard) {
      newOrder = (prevCard?.order || 0) + 10;
    } else {
      newOrder = (prevCard.order + nextCard.order) / 2.0;
    }

    if (Math.abs(newOrder - (prevCard?.order || 0)) < 0.001 || Math.abs(newOrder - (nextCard?.order || 0)) < 0.001) {
      // Precision limit reached.
      // 1. Commit the move first so rebalance accounts for it
      const dragInfo = dragStartOrderRef.current;
      if (dragInfo && dragInfo.cardUuid === active.id) {
        await undoableReorderCards(dragInfo.cardUuid, dragInfo.oldOrder, newOrder);
      } else {
        await db.cards.update(active.id as string, { order: newOrder });
      }
      dragStartOrderRef.current = null;

      // 2. Then rebalance the whole project
      const projectId = localCardsRef.current[0]?.projectId;
      if (projectId) await rebalanceCardOrders(projectId);
      return;
    }

    const dragInfo = dragStartOrderRef.current;
    if (dragInfo && dragInfo.cardUuid === active.id) {
      // undoableReorderCards performs the DB update
      await undoableReorderCards(dragInfo.cardUuid, dragInfo.oldOrder, newOrder);
    } else {
      // Fallback for safety (though dragStart should always fire)
      await db.cards.update(active.id as string, { order: newOrder });
    }
    dragStartOrderRef.current = null;
  }, []);

  // Sortable IDs for DndContext - use visibleCards (stable during drag)
  const sortableIds = useMemo(() => visibleCards.map(c => c.uuid), [visibleCards]);

  const backCardMap = useMemo(() => {
    const map = new Map<string, CardOption>();
    for (const card of allCards) {
      if (card.linkedFrontId) {
        map.set(card.linkedFrontId, card);
      }
    }
    return map;
  }, [allCards]);

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

    const result: CardWithGlobalLayout[] = [];
    const pages = chunkCards(localCards, pageCapacity);

    pages.forEach((page, pageIndex) => {
      // Per-page offset logic: if ALL cards on this page are flipped and custom back offset is enabled, use back offsets
      const isPageFullyFlipped = page.length > 0 && page.every(c => flippedCards.has(c.uuid));
      const useBackOffsets = useCustomBackOffset && isPageFullyFlipped;

      const effectiveCardPositionX = useBackOffsets ? cardBackPositionX : cardPositionX;
      const effectiveCardPositionY = useBackOffsets ? cardBackPositionY : cardPositionY;

      const gridStartXMm = (pageWidthMm - gridWidthMm) / 2 + effectiveCardPositionX;
      const gridStartYMm = (pageHeightMm - gridHeightMm) / 2 + effectiveCardPositionY;

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
  }, [localCards, pageCapacity, pageWidth, pageHeight, pageSizeUnit, columns, rows, cardSpacingMm, cardPositionX, cardPositionY, useCustomBackOffset, cardBackPositionX, cardBackPositionY, sourceSettings, effectiveBleedWidth, backCardMap, imageDataById, pageHeightPx, fixedCardWidthMm, fixedCardHeightMm, topPaddingPx, frontCardOverridesKey, backCardOverridesKey, flippedCards]);

  const perCardGuideColorNum = parseInt(guideColor.replace('#', ''), 16);

  const cardControlLayouts = useMemo((): CardControlLayout[] => {
    const viewportTop = scrollTop - 100;
    const viewportBottom = scrollTop + containerHeight + 100;

    return globalPixiCards
      .map((pixiCard, index) => {
        const contentX = Math.round(pixiCard.globalX * effectiveZoom);
        const contentY = Math.round(pixiCard.globalY * effectiveZoom);
        const width = Math.round(pixiCard.width * effectiveZoom);
        const height = Math.round(pixiCard.height * effectiveZoom);
        const cardBottom = contentY + height;
        if (cardBottom < viewportTop || contentY > viewportBottom) {
          return null;
        }

        // Check if card is using blank cardback - if flipped and back is blank, treat as having image
        const isFlipped = flippedCards.has(pixiCard.card.uuid);
        const isBlankBack = isFlipped && pixiCard.backImageId === 'cardback_builtin_blank';

        return {
          card: pixiCard.card,
          globalIndex: index,
          screenX: contentX,
          screenY: contentY,
          width,
          height,
          // Blank cardbacks are intentionally shown as empty (no image), so treat as "has image" to hide spinner
          hasImage: renderedCardUuids.has(pixiCard.card.uuid) || isBlankBack,
        };
      })
      .filter((layout): layout is CardControlLayout => layout !== null);
  }, [globalPixiCards, effectiveZoom, scrollTop, containerHeight, renderedCardUuids, flippedCards]);

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
            <div className="flex flex-col items-center justify-center h-full px-4 text-center select-none">
              <div className={`flex flex-col ${!mobile ? 'md:flex-row' : ''} flex-wrap items-center justify-center gap-x-4 gap-y-3 mt-4 md:mt-0`}>
                <span className={`text-3xl ${!mobile ? 'sm:text-4xl md:text-5xl lg:text-7xl' : ''} font-bold text-gray-900 dark:text-white`}>
                  Welcome to
                </span>
                <img
                  src={fullLogo}
                  alt="Proxxied Logo"
                  className={`h-24 ${!mobile ? 'sm:h-32 md:h-40 lg:h-36' : ''} w-auto object-contain`}
                />
              </div>
              <p className="font-medium text-lg md:text-xl text-gray-600 dark:text-white mt-4">
                {mobile
                  ? "Enter a decklist or upload files in the upload tab to get started"
                  : "Enter a decklist or upload files to the left to get started"}
              </p>
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
                  cutGuideLengthMm={cutGuideLengthMm}
                  registrationMarks={registrationMarks}
                  registrationMarksPortrait={registrationMarksPortrait}
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
                      allCards={localCards}
                      containerWidth={pageWidthPx * effectiveZoom}
                      containerHeight={containerHeight}
                      scrollContainerRef={scrollRef}
                      mobile={mobile}
                      zoom={effectiveZoom}
                      onRangeSelect={handleRangeSelect}
                      setContextMenu={setContextMenu}
                    />
                  </SortableContext>

                  {/* Drag overlay - shows card image(s) while dragging */}
                  <DragOverlay zIndex={50}>
                    {activeId && (() => {
                      // Multi-Drag Overlay
                      if (multiDragState.current.isMultiDrag) {
                        const stackCards = multiDragState.current.draggedCards;
                        const count = stackCards.length;
                        const leaderId = multiDragState.current.activeId;

                        // Sort: other cards first, leader on top (last)
                        // We slice to limit stack visual depth (e.g. 3 cards)
                        const others = stackCards.filter(c => c.uuid !== leaderId).slice(0, 2);
                        const leader = stackCards.find(c => c.uuid === leaderId);
                        const displayStack = leader ? [...others, leader] : others;

                        return (
                          <div className="relative">
                            {displayStack.map((card, index) => {
                              // Is this the top card? (last in logic, but let's check ID)
                              const isTop = card.uuid === leaderId;

                              // Calculate bleed/dimensions
                              const bleedMm = getCardTargetBleed(card, sourceSettings, effectiveBleedWidth);
                              const cardWidth = (baseCardWidthMm + bleedMm * 2) * MM_TO_PX * effectiveZoom;
                              const cardHeight = (baseCardHeightMm + bleedMm * 2) * MM_TO_PX * effectiveZoom;

                              const imageUrl = card.imageId ? processedImageUrls[card.imageId] : undefined;
                              if (!imageUrl) return null;

                              // Stack transform
                              // Top card is at 0,0. Others are offset.
                              // Actually index 0 is bottom.
                              // We want leader at 0,0.
                              // Others rotated/offset behind.
                              // Let's use simple logic: top card covers others.
                              // Reverse index for offset? 
                              // If displayStack length is 3 (2 others + leader), index 2 is leader.
                              // depth = displayStack.length - 1 - index.
                              const depth = displayStack.length - 1 - index;

                              return (
                                <div
                                  key={card.uuid}
                                  className="absolute shadow-2xl rounded-lg"
                                  style={{
                                    width: cardWidth,
                                    height: cardHeight,
                                    zIndex: isTop ? 10 : 0,
                                    transform: isTop ? 'none' : `translate(${depth * 4}px, ${depth * 4}px) rotate(${depth * (index % 2 === 0 ? -2 : 2)}deg)`,
                                    top: 0,
                                    left: 0,
                                  }}
                                >
                                  <img
                                    src={imageUrl}
                                    className="w-full h-full object-cover rounded-lg"
                                    alt=""
                                  />
                                  {isTop && count > 1 && (
                                    <div className="absolute -top-3 -right-3 bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-md border-2 border-white z-30">
                                      {count}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      }

                      // Single Drag Overlay
                      const card = visibleCards.find(c => c.uuid === activeId);
                      if (!card) return null;

                      const bleedMm = getCardTargetBleed(card, sourceSettings, effectiveBleedWidth);
                      const cardWidth = (baseCardWidthMm + bleedMm * 2) * MM_TO_PX * effectiveZoom;
                      const cardHeight = (baseCardHeightMm + bleedMm * 2) * MM_TO_PX * effectiveZoom;
                      const bleedPx = bleedMm * MM_TO_PX * effectiveZoom;
                      const baseWidth = cardWidth - 2 * bleedPx;
                      const baseHeight = cardHeight - 2 * bleedPx;
                      const cornerRadius = 2.5 * MM_TO_PX * effectiveZoom;

                      const imageUrl = card.imageId ? processedImageUrls[card.imageId] : undefined;
                      if (!imageUrl) return null;

                      // Check flipped
                      const isFlipped = flippedCards.has(card.uuid);

                      return (
                        <div
                          className="relative shadow-2xl rounded-lg overflow-visible z-10"
                          style={{ width: cardWidth, height: cardHeight }}
                        >
                          <img
                            src={imageUrl}
                            className="w-full h-full object-cover rounded-lg"
                            alt=""
                          />
                          {/* Drag Handle & Flip - simplify for overlay */}
                          <div className={`absolute right-[4px] top-6 w-4 h-4 rounded-sm flex items-center justify-center z-20 ${isFlipped ? 'bg-blue-500 text-white' : 'bg-white text-gray-700'}`}>
                            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                            </svg>
                          </div>

                          {/* Cut guides for single card */}
                          {perCardGuideStyle !== 'none' && guideWidth > 0 && (
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
                              <rect
                                x={guideWidth / 2}
                                y={guideWidth / 2}
                                width={baseWidth - guideWidth}
                                height={baseHeight - guideWidth}
                                rx={perCardGuideStyle.includes('rounded') ? cornerRadius : 0}
                                ry={perCardGuideStyle.includes('rounded') ? cornerRadius : 0}
                                fill="none"
                                stroke={guideColor}
                                strokeWidth={guideWidth}
                              />
                            </svg>
                          )}
                        </div>
                      )
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