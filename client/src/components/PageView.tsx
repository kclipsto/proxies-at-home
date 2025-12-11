import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { Button, Label } from "flowbite-react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { useRef, useState, useEffect, useMemo, useCallback, useLayoutEffect } from "react";
import { usePinch, useDrag } from "@use-gesture/react";
import fullLogo from "../assets/fullLogo.png";
import CardCellLazy from "../components/CardCellLazy";
import EdgeCutLines from "../components/FullPageGuides";
import SortableCard, { CardView } from "../components/SortableCard";
import { db, type Image } from "../db";
import type { CardOption } from "../../../shared/types";
import { rebalanceCardOrders } from "@/helpers/dbUtils";
import { undoableDeleteCard, undoableDuplicateCard, undoableReorderCards, undoableReorderMultipleCards } from "@/helpers/undoableActions";
import type { useImageProcessing } from "../hooks/useImageProcessing";
import { useArtworkModalStore } from "../store";
import { useSettingsStore } from "../store/settings";
import { useSelectionStore } from "../store/selection";
import { useUndoRedoStore } from "../store/undoRedo";
import { useFilteredAndSortedCards } from "../hooks/useFilteredAndSortedCards";
import { ArtworkModal } from "./ArtworkModal";
import { ZoomControls } from "./ZoomControls";
import { UndoRedoControls } from "./UndoRedoControls";
import { useShallow } from "zustand/react/shallow";
import { useOnClickOutside } from "../hooks/useOnClickOutside";
import { PullToRefresh } from "./PullToRefresh";
import { Copy, Trash, CheckSquare, XSquare, Settings } from "lucide-react";

const baseCardWidthMm = 63;
const baseCardHeightMm = 88;

type CardLayoutInfo = {
  cardWidthMm: number;
  cardHeightMm: number;
  bleedMm: number;
};

type SourceTypeSettings = {
  mpcBleedMode: 'use-existing' | 'trim-regenerate' | 'none';
  mpcExistingBleed: number;
  mpcExistingBleedUnit: 'mm' | 'in';
  uploadBleedMode: 'generate' | 'existing' | 'none';
  uploadExistingBleed: number;
  uploadExistingBleedUnit: 'mm' | 'in';
};

/** Compute per-card bleed width based on overrides, settings, and global defaults. */
function getCardTargetBleed(
  card: CardOption,
  sourceSettings: SourceTypeSettings,
  globalBleedWidth: number,
): number {
  if (card.bleedMode) {
    if (card.bleedMode === 'none') return 0;
    if (card.bleedMode === 'existing' && card.existingBleedMm !== undefined) {
      return card.existingBleedMm;
    }
    return globalBleedWidth;
  }

  if (card.hasBakedBleed) {
    if (sourceSettings.mpcBleedMode === 'none') {
      return 0;
    } else if (sourceSettings.mpcBleedMode === 'use-existing') {
      const existingMm = sourceSettings.mpcExistingBleedUnit === 'in'
        ? sourceSettings.mpcExistingBleed * 25.4
        : sourceSettings.mpcExistingBleed;
      return existingMm;
    } else {
      return globalBleedWidth;
    }
  }

  if (card.isUserUpload) {
    if (sourceSettings.uploadBleedMode === 'none') {
      return 0;
    } else if (sourceSettings.uploadBleedMode === 'existing') {
      const existingMm = sourceSettings.uploadExistingBleedUnit === 'in'
        ? sourceSettings.uploadExistingBleed * 25.4
        : sourceSettings.uploadExistingBleed;
      return existingMm;
    }
    return globalBleedWidth;
  }

  return globalBleedWidth;
}

function computeCardLayouts(
  pageCards: CardOption[],
  sourceSettings: SourceTypeSettings,
  globalBleedWidth: number,
): CardLayoutInfo[] {
  return pageCards.map((card) => {
    const bleedMm = getCardTargetBleed(card, sourceSettings, globalBleedWidth);
    return {
      cardWidthMm: baseCardWidthMm + bleedMm * 2,
      cardHeightMm: baseCardHeightMm + bleedMm * 2,
      bleedMm,
    };
  });
}


type PageViewProps = {
  loadingMap: ReturnType<typeof useImageProcessing>["loadingMap"];
  ensureProcessed: ReturnType<typeof useImageProcessing>["ensureProcessed"];
  images: Image[];
  cards: CardOption[];
  mobile?: boolean;
  active?: boolean;
};

export function PageView({ loadingMap, ensureProcessed, cards, images, mobile, active = true }: PageViewProps) {
  const {
    pageSizeUnit,
    pageWidth,
    pageHeight,
    columns,
    rows,
    bleedEdge,
    bleedEdgeWidth,
    bleedEdgeUnit,
    zoom,
    setZoom,
    settingsPanelWidth,
    isSettingsPanelCollapsed,
    uploadPanelWidth,
    isUploadPanelCollapsed,
    darkenNearBlack,
    sortBy,
    filterManaCost,
    filterColors,
    cardPositionX,
    cardPositionY,
    mpcBleedMode,
    mpcExistingBleed,
    mpcExistingBleedUnit,
    uploadBleedMode,
    uploadExistingBleed,
    uploadExistingBleedUnit,
  } = useSettingsStore(
    useShallow((state) => ({
      pageSizeUnit: state.pageSizeUnit,
      pageWidth: state.pageWidth,
      pageHeight: state.pageHeight,
      columns: state.columns,
      rows: state.rows,
      bleedEdge: state.bleedEdge,
      bleedEdgeWidth: state.bleedEdgeWidth,
      bleedEdgeUnit: state.bleedEdgeUnit,
      zoom: state.zoom,
      setZoom: state.setZoom,
      settingsPanelWidth: state.settingsPanelWidth,
      isSettingsPanelCollapsed: state.isSettingsPanelCollapsed,
      uploadPanelWidth: state.uploadPanelWidth,
      isUploadPanelCollapsed: state.isUploadPanelCollapsed,
      darkenNearBlack: state.darkenNearBlack,
      sortBy: state.sortBy,
      filterManaCost: state.filterManaCost,
      filterColors: state.filterColors,
      cardPositionX: state.cardPositionX,
      cardPositionY: state.cardPositionY,
      mpcBleedMode: state.mpcBleedMode,
      mpcExistingBleed: state.mpcExistingBleed,
      mpcExistingBleedUnit: state.mpcExistingBleedUnit,
      uploadBleedMode: state.uploadBleedMode,
      uploadExistingBleed: state.uploadExistingBleed,
      uploadExistingBleedUnit: state.uploadExistingBleedUnit,
    }))
  );

  // Build source settings object for computeCardLayouts
  const sourceSettings: SourceTypeSettings = useMemo(() => ({
    mpcBleedMode,
    mpcExistingBleed,
    mpcExistingBleedUnit,
    uploadBleedMode,
    uploadExistingBleed,
    uploadExistingBleedUnit,
  }), [mpcBleedMode, mpcExistingBleed, mpcExistingBleedUnit, uploadBleedMode, uploadExistingBleed, uploadExistingBleedUnit]);

  const effectiveBleedWidth = bleedEdge
    ? (bleedEdgeUnit === 'in' ? bleedEdgeWidth * 25.4 : bleedEdgeWidth)
    : 0;

  const pageRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 500,
        tolerance: 5,
      },
    })
  );

  const dndDisabled =
    sortBy !== "manual" || filterManaCost.length > 0 || filterColors.length > 0;

  const urlCacheRef = useRef<Map<string, { blob: Blob; url: string }>>(new Map());

  const revocationQueueRef = useRef<string[]>([]);

  const processedImageUrls: Record<string, string> = useMemo(() => {
    const urls: Record<string, string> = {};
    if (!images) return urls;

    const currentCache = urlCacheRef.current;
    const usedIds = new Set<string>();

    images.forEach((img) => {
      const selectedBlob = darkenNearBlack ? img.displayBlobDarkened : img.displayBlob;

      if (selectedBlob && selectedBlob.size > 0) {
        usedIds.add(img.id);

        const cached = currentCache.get(img.id);
        if (cached && cached.blob === selectedBlob) {
          urls[img.id] = cached.url;
        } else {
          if (cached) {
            revocationQueueRef.current.push(cached.url);
          }
          const newUrl = URL.createObjectURL(selectedBlob);
          urls[img.id] = newUrl;
          currentCache.set(img.id, { blob: selectedBlob, url: newUrl });
        }
      }
    });

    for (const [id, cached] of currentCache.entries()) {
      if (!usedIds.has(id)) {
        revocationQueueRef.current.push(cached.url);
        currentCache.delete(id);
      }
    }

    return urls;
  }, [images, darkenNearBlack]);

  // Process revocation queue after render
  useEffect(() => {
    const queue = revocationQueueRef.current;
    if (queue.length > 0) {
      const timer = setTimeout(() => {
        queue.forEach((url) => URL.revokeObjectURL(url));
      }, 2000);
      revocationQueueRef.current = [];

      return () => clearTimeout(timer);
    }
  });

  // Cleanup on unmount
  useEffect(() => {
    const cache = urlCacheRef.current;
    return () => {
      const urlsToRevoke = Array.from(cache.values()).map((c) => c.url);
      setTimeout(() => {
        urlsToRevoke.forEach((url) => URL.revokeObjectURL(url));
      }, 5000);
      cache.clear();
    };
  }, []);

  const openArtworkModal = useArtworkModalStore((state) => state.openModal);

  const pageCapacity = columns * rows;
  const cardSpacingMm = useSettingsStore((state) => state.cardSpacingMm);

  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    cardUuid: null as string | null,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextMenu.visible) {
        const menuEl = document.getElementById("mobile-context-menu");
        if (menuEl && menuEl.contains(e.target as Node)) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        setContextMenu((prev) => ({ ...prev, visible: false }));
      }
    };

    if (contextMenu.visible) {
      window.addEventListener("click", handler, true);
    }

    return () => window.removeEventListener("click", handler, true);
  }, [contextMenu.visible]);

  function chunkCards<T>(cards: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < cards.length; i += size) {
      chunks.push(cards.slice(i, i + size));
    }
    return chunks;
  }

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevZoomRef = useRef(zoom);
  const lastCenterOffsetRef = useRef({ x: 0, y: 0 });
  const pinchState = useRef({ active: false, x: 0, y: 0 });
  const lastPinchPosRef = useRef({ x: 0, y: 0 });
  const [isPinching, setIsPinching] = useState(false);

  const updateCenterOffset = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const maxScrollTop = container.scrollHeight - container.clientHeight;
    const ratioY = maxScrollTop > 0 ? container.scrollTop / maxScrollTop : 0;

    lastCenterOffsetRef.current = {
      x: 0,
      y: ratioY,
    };
  }, []);

  const [showMobileZoomControls, setShowMobileZoomControls] = useState(false);
  const mobileZoomControlsRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(mobileZoomControlsRef, () => setShowMobileZoomControls(false));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (showMobileZoomControls && mobileZoomControlsRef.current) {
        if (!mobileZoomControlsRef.current.contains(e.target as Node)) {
          e.preventDefault();
          e.stopPropagation();
          setShowMobileZoomControls(false);
        }
      }
    };

    if (showMobileZoomControls) {
      window.addEventListener("click", handler, true);
    }

    return () => window.removeEventListener("click", handler, true);
  }, [showMobileZoomControls]);

  const [localCards, setLocalCards] = useState(cards);
  const [isOptimistic, setIsOptimistic] = useState(false);
  const [blockDbUpdates, setBlockDbUpdates] = useState(false);
  const [droppedId, setDroppedId] = useState<string | null>(null);
  const lastOptimisticOrder = useRef<string[]>([]);

  const { filteredAndSortedCards } = useFilteredAndSortedCards(localCards);
  const allCardUuids = useMemo(() => filteredAndSortedCards.map(c => c.uuid), [filteredAndSortedCards]);

  const selectedCards = useSelectionStore((state) => state.selectedCards);
  const selectAll = useSelectionStore((state) => state.selectAll);
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const hasSelection = selectedCards.size > 0;

  useEffect(() => {
    if (droppedId) {
      const timer = setTimeout(() => setDroppedId(null), 500);
      return () => clearTimeout(timer);
    }
  }, [droppedId]);

  useEffect(() => {
    if (blockDbUpdates) {
      return;
    }

    if (isOptimistic) {
      const currentOrder = cards.map((c) => c.uuid);
      const expectedOrder = lastOptimisticOrder.current;

      if (JSON.stringify(currentOrder) === JSON.stringify(expectedOrder)) {
        setIsOptimistic(false);
        setLocalCards(cards);
      }
    } else {
      setLocalCards(cards);
    }
  }, [cards, isOptimistic, blockDbUpdates]);

  const [activeId, setActiveId] = useState<string | null>(null);
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

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const cardUuid = event.active.id as string;
    const card = localCards.find(c => c.uuid === cardUuid);
    const isMultiSelect = selectedCards.has(cardUuid) && selectedCards.size > 1;

    if (isMultiSelect) {
      const draggedCards = localCards.filter(c => selectedCards.has(c.uuid));
      multiDragState.current = {
        isMultiDrag: true,
        draggedCards,
        originalLocalCards: [...localCards],
        activeId: cardUuid,
        ghostIds: new Set(),
      };

      // Collapse grid by removing selected cards, then inserting leader at its original index.
      const remainingCards = localCards.filter(c => !selectedCards.has(c.uuid));
      const leaderOriginalIndex = localCards.findIndex(c => c.uuid === cardUuid);
      const insertIndex = Math.min(leaderOriginalIndex, remainingCards.length);

      const newLocalCards = [...remainingCards];
      if (card) {
        newLocalCards.splice(insertIndex, 0, card);
      }

      // Defer state update for dnd-kit node capture.
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
  }, [localCards, selectedCards]);

  // Ref to track the latest localCards for the debounced handler
  const localCardsRef = useRef(localCards);
  useEffect(() => {
    localCardsRef.current = localCards;
  }, [localCards]);

  const dragOverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

      // Find indices in the source array (localCards)
      const oldIndex = currentLocalCards.findIndex((c) => c.uuid === activeId);
      const newIndex = currentLocalCards.findIndex((c) => c.uuid === overId);

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        setLocalCards((items) => {
          return arrayMove(items, oldIndex, newIndex);
        });
      }
    }, 100); // 100ms delay to prevent thrashing/infinite loops
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;

    setDroppedId(active.id as string);
    setActiveId(null);

    setTimeout(() => {
      setBlockDbUpdates(false);
    }, 500);

    if (!over) {
      if (multiDragState.current.isMultiDrag) {
        setLocalCards(multiDragState.current.originalLocalCards);
      }
      if (!multiDragState.current.isMultiDrag) {
        setLocalCards(cards);
      }

      multiDragState.current = { isMultiDrag: false, draggedCards: [], originalLocalCards: [], activeId: null, ghostIds: new Set() };
      return;
    }

    if (multiDragState.current.isMultiDrag) {
      const { draggedCards, activeId: leaderId } = multiDragState.current;

      const leaderIndex = localCards.findIndex(c => c.uuid === leaderId);
      if (leaderIndex === -1) {
        setLocalCards(multiDragState.current.originalLocalCards);
        return;
      }

      const cardsWithoutLeader = localCards.filter(c => c.uuid !== leaderId);
      const newLocalCards = [
        ...cardsWithoutLeader.slice(0, leaderIndex),
        ...draggedCards,
        ...cardsWithoutLeader.slice(leaderIndex)
      ];

      setLocalCards(newLocalCards);

      const adjustments: { uuid: string; oldOrder: number; newOrder: number }[] = [];
      const rebalanced = newLocalCards.map((c, i) => ({ ...c, order: (i + 1) * 1000 }));

      draggedCards.forEach((c) => {
        const moved = rebalanced.find(r => r.uuid === c.uuid);
        if (moved) {
          adjustments.push({ uuid: c.uuid, oldOrder: c.order, newOrder: moved.order });
        }
      });

      await undoableReorderMultipleCards(adjustments);

      // 4. Update the DB
      for (const c of draggedCards) {
        const adjustment = adjustments.find(a => a.uuid === c.uuid);
        if (adjustment) {
          await db.cards.update(c.uuid, { order: adjustment.newOrder });
        }
      }

      // 5. Rebalance all cards to ensure gaps/duplicates are fixed
      await rebalanceCardOrders(newLocalCards);

      multiDragState.current = { isMultiDrag: false, draggedCards: [], originalLocalCards: [], activeId: null, ghostIds: new Set() };
      return;
    }

    const currentIndex = localCards.findIndex((c) => c.uuid === active.id);
    if (currentIndex === -1) return;

    lastOptimisticOrder.current = localCards.map((c) => c.uuid);

    const prevCard = localCards[currentIndex - 1];
    const nextCard = localCards[currentIndex + 1];

    let newOrder: number;

    if (!prevCard) {
      newOrder = (nextCard?.order || 0) - 1;
    } else if (!nextCard) {
      newOrder = prevCard.order + 1;
    } else {
      newOrder = (prevCard.order + nextCard.order) / 2.0;
    }

    if (newOrder === prevCard?.order || newOrder === nextCard?.order) {
      await rebalanceCardOrders(localCards);
      return;
    }

    // Record undo action before updating DB
    const dragInfo = dragStartOrderRef.current;
    if (dragInfo && dragInfo.cardUuid === active.id) {
      await undoableReorderCards(dragInfo.cardUuid, dragInfo.oldOrder, newOrder);
    }
    dragStartOrderRef.current = null;

    await db.cards.update(active.id as string, { order: newOrder });
  }, [localCards, cards, multiDragState]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const prevZoom = prevZoomRef.current;
    if (prevZoom === zoom) return;

    // Mobile Pinch: Zoom about pinch center using relative movement.
    if (mobile && pinchState.current.active) {
      const { x: currX, y: currY } = pinchState.current;
      const { x: prevX, y: prevY } = lastPinchPosRef.current;
      const ratio = zoom / prevZoom;

      container.scrollLeft = (container.scrollLeft + prevX) * ratio - currX;
      container.scrollTop = (container.scrollTop + prevY) * ratio - currY;

      // Update last pinch pos for next frame
      lastPinchPosRef.current = { x: currX, y: currY };
    } else if (mobile) {
      // Mobile Fallback: Zoom about center.
      const cx = container.clientWidth / 2;
      const cy = container.clientHeight / 2;
      const ratio = zoom / prevZoom;

      container.scrollLeft = (container.scrollLeft + cx) * ratio - cx;
      container.scrollTop = (container.scrollTop + cy) * ratio - cy;
    } else {
      const { y: ratioY } = lastCenterOffsetRef.current;

      // Horizontal: Always center
      const targetScrollLeft = (container.scrollWidth - container.clientWidth) / 2;

      // Vertical: Maintain relative scroll percentage.
      const maxScrollTop = container.scrollHeight - container.clientHeight;
      const targetScrollTop = ratioY * maxScrollTop;

      container.scrollLeft = targetScrollLeft;
      container.scrollTop = targetScrollTop;
    }

    // Update the offset ref to match the new reality
    updateCenterOffset();

    prevZoomRef.current = zoom;
  }, [zoom, updateCenterOffset, mobile]);

  useEffect(() => {
    updateCenterOffset();
    window.addEventListener("resize", updateCenterOffset);
    return () => window.removeEventListener("resize", updateCenterOffset);
  }, [updateCenterOffset]);

  // Handle Ctrl+Scroll to zoom
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        const container = scrollContainerRef.current;
        const isInside = container && container.contains(e.target as Node);

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

    document.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      document.removeEventListener("wheel", handleWheel);
    };
  }, [setZoom]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      // Use Cmd on macOS, Ctrl on Windows/Linux
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const modifierActive = isMac ? e.metaKey : e.ctrlKey;

      if (modifierActive && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          // Redo
          e.preventDefault();
          void useUndoRedoStore.getState().redo();
        } else {
          // Undo
          e.preventDefault();
          void useUndoRedoStore.getState().undo();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [setZoom]);

  // Handle Pinch-to-Zoom on Mobile
  usePinch(
    ({ offset: [s], origin: [ox, oy], first, last, event }) => {
      if (event.type === 'wheel') return;

      if (first) {
        setIsPinching(true);
        pinchState.current.active = true;
        const container = scrollContainerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const x = ox - rect.left;
          const y = oy - rect.top;
          lastPinchPosRef.current = { x, y };
          pinchState.current.x = x;
          pinchState.current.y = y;
        }
      }

      if (pinchState.current.active) {
        const container = scrollContainerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          pinchState.current.x = ox - rect.left;
          pinchState.current.y = oy - rect.top;
        }
      }

      setZoom(s);

      if (last) {
        setTimeout(() => {
          pinchState.current.active = false;
          setIsPinching(false);
        }, 0);
      }
    },
    {
      target: document,
      scaleBounds: { min: 0.1, max: 5 },
      eventOptions: { passive: false, capture: true },
      from: () => [zoom, 0],
      rubberband: true,
      enabled: active,
    }
  );

  // Handle Shift+Drag to Zoom (for DevTools emulation / Desktop)
  useDrag(
    ({ movement: [, my], shiftKey, first, last, memo = zoom }) => {
      if (first && shiftKey) setIsPinching(true);
      if (last) setIsPinching(false);

      if (shiftKey) {
        const delta = my * -0.01;
        const newZoom = Math.min(Math.max(0.1, memo + delta), 5);
        setZoom(newZoom);
        return memo;
      }
      return memo;
    },
    {
      target: document,
      eventOptions: { passive: false, capture: true },
      enabled: active,
    }
  );

  const mobileZoomFactor = 0.4;

  // Desktop: Center view logic
  useEffect(() => {
    if (mobile) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    // Allow layout to update
    requestAnimationFrame(() => {
      const x = (container.scrollWidth - container.clientWidth) / 2;
      const y = (container.scrollHeight - container.clientHeight) / 2;
      container.scrollTo(x, y);

      // Update the center offset ref so subsequent zooms are correct
      updateCenterOffset();
    });
  }, [pageWidth, pageHeight, updateCenterOffset, mobile]);



  return (
    <div className="w-full h-full relative flex flex-col overflow-hidden">
      <PullToRefresh
        ref={scrollContainerRef}
        onScroll={updateCenterOffset}
        disabled={isPinching || !!activeId}
        className="w-full flex-1 overflow-y-auto bg-gray-200 h-full p-6 flex dark:bg-gray-800 relative"
        style={{ touchAction: "pan-x pan-y" }}
      >
        {(!cards || cards.length === 0) ? (
          <div className={`flex flex-col items-center mx-auto px-4 text-center ${mobile ? "my-auto" : ""}`}>
            <div className={`flex flex-col ${!mobile ? 'md:flex-row' : ''} items-center gap-2 md:gap-4`}>
              <Label className={`text-5xl ${!mobile ? 'md:text-7xl' : ''} justify-center font-bold whitespace-nowrap`}>
                Welcome to
              </Label>
              <img
                src={fullLogo}
                alt="Proxxied Logo"
                className={`h-40 ${!mobile ? 'md:h-36 md:mt-[1rem]' : ''}`}
              />
            </div>
            <Label className={`text-xl ${!mobile ? 'md:text-xl' : ''} text-gray-600 justify-center text-center mt-4`}>
              {mobile
                ? "Enter a decklist or upload files in the upload tab to get started"
                : "Enter a decklist or upload files to the left to get started"}
            </Label>
          </div>
        ) : (

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            modifiers={[]}
          >    <div ref={pageRef} className="flex flex-col gap-[1rem] m-auto" style={{ zoom: mobile ? zoom * mobileZoomFactor : zoom }}>
              <SortableContext
                items={filteredAndSortedCards.map((card) => card.uuid)}
                strategy={rectSortingStrategy}
              >
                {chunkCards(filteredAndSortedCards, pageCapacity).map((page, pageIndex) => (
                  <div
                    key={pageIndex}
                    className="proxy-page bg-white dark:bg-gray-700"
                    style={{
                      width: `${pageWidth}${pageSizeUnit} `,
                      height: `${pageHeight}${pageSizeUnit} `,
                      breakAfter: "page",
                      flexShrink: 0,
                      padding: 0,
                      margin: 0,
                    }}
                  >
                    <div className="relative w-full h-full">
                      {(() => {
                        // Compute layouts once for this page
                        const layouts = computeCardLayouts(page, sourceSettings, effectiveBleedWidth);

                        // Initialize with base dimensions (no bleed) to allow growing only as needed
                        // This prevents pages with only existing-bleed cards (e.g. MPC) from being forced
                        // to the global bleed size if the global setting is large.
                        const startWidth = baseCardWidthMm;
                        const startHeight = baseCardHeightMm;

                        // Compute max width per column (use base for empty columns)
                        const colWidths: number[] = Array(columns).fill(startWidth);
                        layouts.forEach((layout, idx) => {
                          const col = idx % columns;
                          colWidths[col] = Math.max(colWidths[col], layout.cardWidthMm);
                        });

                        // Compute max height per row - always use full grid rows
                        const rowHeights: number[] = Array(rows).fill(startHeight);
                        layouts.forEach((layout, idx) => {
                          const row = Math.floor(idx / columns);
                          rowHeights[row] = Math.max(rowHeights[row], layout.cardHeightMm);
                        });

                        return (
                          <>
                            <EdgeCutLines
                              cardLayouts={layouts}
                              colWidths={colWidths}
                              rowHeights={rowHeights}
                              baseCardWidthMm={baseCardWidthMm}
                              baseCardHeightMm={baseCardHeightMm}
                            />
                            <div
                              style={{
                                position: "absolute",
                                left: "50%",
                                top: "50%",
                                transform: `translate(calc(-50% + ${cardPositionX}mm), calc(-50% + ${cardPositionY}mm))`,
                                display: "grid",
                                gridTemplateColumns: colWidths.map(w => `${w}mm`).join(' '),
                                gridTemplateRows: rowHeights.map(h => `${h}mm`).join(' '),
                                gap: `${cardSpacingMm}mm`,
                              }}
                            >
                              {page.map((card, index) => {
                                const globalIndex = pageIndex * pageCapacity + index;
                                const layout = layouts[index];

                                // If the card has no imageId, it's permanently not found.
                                if (!card.imageId) {
                                  return (
                                    <div
                                      key={globalIndex}
                                      className="flex items-center justify-center"
                                      style={{
                                        width: `${layout.cardWidthMm}mm`,
                                        height: `${layout.cardHeightMm}mm`,
                                        justifySelf: 'center',
                                        alignSelf: 'center',
                                      }}
                                    >
                                      <div
                                        onContextMenu={(e) => {
                                          e.preventDefault();
                                          setContextMenu({
                                            visible: true,
                                            x: e.clientX,
                                            y: e.clientY,
                                            cardUuid: card.uuid,
                                          });
                                        }}
                                        onClick={() => {
                                          openArtworkModal({
                                            card,
                                            index: globalIndex,
                                          });
                                        }}
                                        className="flex items-center justify-center border-2 border-dashed border-red-500 bg-gray-50 text-center p-2 select-none w-full h-full"
                                        style={{
                                          boxSizing: "border-box",
                                        }}
                                        title={`"${card.name}" not found`}
                                      >
                                        <div>
                                          <div className="font-semibold text-red-700">
                                            "{card.name}"
                                          </div>
                                          <div className="text-xs text-gray-600">
                                            Image not available
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }

                                const processedBlobUrl = processedImageUrls[card.imageId];

                                return (
                                  <div
                                    key={card.uuid}
                                    style={{
                                      justifySelf: 'center',
                                      alignSelf: 'center',
                                    }}
                                  >
                                    <CardCellLazy
                                      card={card}
                                      state={loadingMap[card.uuid] ?? "idle"}
                                      hasImage={!!processedBlobUrl}
                                      ensureProcessed={ensureProcessed}
                                    >
                                      <SortableCard
                                        card={card}
                                        index={index}
                                        globalIndex={globalIndex}
                                        imageSrc={processedBlobUrl!}
                                        totalCardWidth={layout.cardWidthMm}
                                        totalCardHeight={layout.cardHeightMm}
                                        guideOffset={`${layout.bleedMm}mm`}
                                        imageBleedWidth={layout.bleedMm}
                                        allCardUuids={allCardUuids}
                                        setContextMenu={setContextMenu}
                                        disabled={dndDisabled}
                                        mobile={mobile}
                                        scale={mobile ? zoom * mobileZoomFactor : zoom}
                                        dropped={droppedId === card.uuid}
                                      />
                                    </CardCellLazy>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ))}

              </SortableContext>
            </div>
            <DragOverlay zIndex={40}>
              {droppedId ? null : (activeId ? (() => {
                if (multiDragState.current.isMultiDrag) {
                  // Render Stack
                  const stackCards = multiDragState.current.draggedCards;
                  const count = stackCards.length;

                  // Reorder to put leader on top for visualization
                  const leaderId = multiDragState.current.activeId;
                  const leaderIndex = stackCards.findIndex(c => c.uuid === leaderId);

                  let sortedStack = stackCards;
                  if (leaderIndex !== -1) {
                    const leader = stackCards[leaderIndex];
                    const others = stackCards.filter(c => c.uuid !== leaderId);
                    sortedStack = [leader, ...others];
                  }

                  // Show up to 3 cards
                  const previewCards = sortedStack.slice(0, 3);

                  return (
                    <div className="relative">
                      {previewCards.map((card, i) => {
                        // Compute per-card bleed
                        const bleedMm = getCardTargetBleed(card, sourceSettings, effectiveBleedWidth);
                        const cardWidthMm = baseCardWidthMm + bleedMm * 2;
                        const cardHeightMm = baseCardHeightMm + bleedMm * 2;
                        const processedUrl = processedImageUrls[card.imageId!] || "";

                        return (
                          <div
                            key={card.uuid}
                            className="absolute top-0 left-0 shadow-xl"
                            style={{
                              zIndex: 40 - i, // Top card on top
                              transform: `translate(0px, ${i * -60}px) scale(${1 - i * 0.05})`,
                              transformOrigin: 'bottom center',
                            }}
                          >
                            <CardView
                              card={card}
                              index={0}
                              globalIndex={0}
                              imageSrc={processedUrl}
                              totalCardWidth={cardWidthMm}
                              totalCardHeight={cardHeightMm}
                              guideOffset={`${bleedMm}mm`}
                              imageBleedWidth={bleedMm}
                              setContextMenu={setContextMenu}
                              disabled={true}
                              mobile={mobile}
                              isOverlay={true}
                            />
                            {/* Badge for total count if > 1, show on top card */}
                            {i === 0 && count > 1 && (
                              <div className="absolute -top-2 -right-2 bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold border-2 border-white z-50">
                                {count}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                const card = localCards.find(c => c.uuid === activeId)!;
                if (!card) return null;
                // Compute per-card bleed for the dragged card using source settings
                const bleedMm = getCardTargetBleed(card, sourceSettings, effectiveBleedWidth);
                const cardWidthMm = baseCardWidthMm + bleedMm * 2;
                const cardHeightMm = baseCardHeightMm + bleedMm * 2;

                return (
                  <CardView
                    card={card}
                    index={0} // Index doesn't matter for overlay
                    globalIndex={0} // Global index doesn't matter for overlay
                    imageSrc={processedImageUrls[card.imageId!] || ""}
                    totalCardWidth={cardWidthMm}
                    totalCardHeight={cardHeightMm}
                    guideOffset={`${bleedMm}mm`}
                    imageBleedWidth={bleedMm}
                    setContextMenu={setContextMenu}
                    disabled={true} // Disable interactions on overlay
                    mobile={mobile}
                    style={{
                      // The modifier handles centering
                      transformOrigin: 'center',
                    }}
                    isOverlay={true}
                  />
                );
              })() : null)}
            </DragOverlay>
          </DndContext>
        )
        }
      </PullToRefresh>

      {contextMenu.visible && contextMenu.cardUuid && (
        <div
          id="mobile-context-menu"
          className="fixed bg-white dark:bg-gray-800 border rounded-xl border-gray-300 dark:border-gray-700 shadow-md z-50 text-sm flex flex-col gap-1"
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
            padding: "0.25rem",
          }}
          onMouseLeave={() =>
            setContextMenu({ ...contextMenu, visible: false })
          }
        >
          {/* Show selection controls when multiple cards are selected */}
          {hasSelection && selectedCards.has(contextMenu.cardUuid) && (
            <>
              <Button
                size="xs"
                onClick={async () => {
                  const uuids = Array.from(selectedCards);
                  for (const uuid of uuids) {
                    await undoableDuplicateCard(uuid);
                  }
                  clearSelection();
                  setContextMenu({ ...contextMenu, visible: false });
                }}
              >
                <Copy className="size-3 mr-1" />
                Duplicate {selectedCards.size} Selected
              </Button>
              <Button
                size="xs"
                onClick={() => {
                  const card = cards?.find(c => c.uuid === contextMenu.cardUuid);
                  if (card) {
                    openArtworkModal({ card, index: null, initialTab: 'settings' });
                  }
                  setContextMenu({ ...contextMenu, visible: false });
                }}
              >
                <Settings className="size-3 mr-1" />
                Settings {selectedCards.size} Selected
              </Button>
              <Button
                size="xs"
                color="red"
                onClick={async () => {
                  const uuids = Array.from(selectedCards);
                  for (const uuid of uuids) {
                    await undoableDeleteCard(uuid);
                  }
                  clearSelection();
                  setContextMenu({ ...contextMenu, visible: false });
                }}
              >
                <Trash className="size-3 mr-1" />
                Delete {selectedCards.size} Selected
              </Button>
            </>
          )}
          {/* Single card operations */}
          {(!hasSelection || !selectedCards.has(contextMenu.cardUuid)) && (
            <>
              <Button
                size="xs"
                onClick={async () => {
                  await undoableDuplicateCard(contextMenu.cardUuid!);
                  setContextMenu({ ...contextMenu, visible: false });
                }}
              >
                <Copy className="size-3 mr-1" />
                Duplicate
              </Button>
              <Button
                size="xs"
                onClick={() => {
                  const card = cards?.find(c => c.uuid === contextMenu.cardUuid);
                  if (card) {
                    openArtworkModal({ card, index: null, initialTab: 'settings' });
                  }
                  setContextMenu({ ...contextMenu, visible: false });
                }}
              >
                <Settings className="size-3 mr-1" />
                Settings
              </Button>
              <Button
                size="xs"
                color="red"
                onClick={async () => {
                  await undoableDeleteCard(contextMenu.cardUuid!);
                  setContextMenu({ ...contextMenu, visible: false });
                }}
              >
                <Trash className="size-3 mr-1" />
                Delete
              </Button>
            </>
          )}
        </div>
      )}

      {/* Floating Selection Bar - shows when cards are selected */}
      {hasSelection && cards && cards.length > 0 && (
        <div
          className="fixed bottom-6 z-40 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg flex items-center"
          style={{
            left: `calc(50% + ${((isUploadPanelCollapsed ? 60 : uploadPanelWidth) - (isSettingsPanelCollapsed ? 60 : settingsPanelWidth)) / 2}px)`,
            transform: 'translateX(-50%)'
          }}>
          <span className="px-3 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap border-r border-gray-300 dark:border-gray-600">
            {selectedCards.size} selected
          </span>
          <button
            onClick={() => selectAll(allCardUuids)}
            className="px-3 py-3 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-75 active:translate-y-[1px] flex items-center gap-2 border-r border-gray-300 dark:border-gray-600"
            title="Select All"
          >
            <CheckSquare className="size-4" />
            <span className="text-sm">Select All</span>
          </button>
          <button
            onClick={clearSelection}
            className="px-3 py-3 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-75 active:translate-y-[1px] flex items-center gap-2"
            title="Deselect All"
          >
            <XSquare className="size-4" />
            <span className="text-sm">Deselect</span>
          </button>
        </div>
      )
      }
      {/* Floating Zoom Controls - Desktop Only */}
      {
        !mobile && cards && cards.length > 0 && (
          <div
            className="group fixed bottom-6 z-40"
            style={{
              right: `${(isSettingsPanelCollapsed ? 60 : settingsPanelWidth) + 20}px`
            }}
          >
            {/* Icon-only collapsed state */}
            <div className="absolute bottom-0 right-0 p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg cursor-pointer opacity-70 group-hover:opacity-0 transition-opacity duration-500 pointer-events-none">
              <ZoomIn className="size-5 text-gray-600 dark:text-gray-400" />
            </div>

            {/* Full controls on hover */}
            <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500 min-w-[250px]">
              <ZoomControls />
            </div>
          </div>
        )
      }

      {/* Floating Undo/Redo Controls - Desktop Only */}
      {
        !mobile && cards && cards.length > 0 && (
          <div
            className="fixed bottom-6 z-40"
            style={{
              left: `${(isUploadPanelCollapsed ? 60 : uploadPanelWidth) + 20}px`
            }}
          >
            <UndoRedoControls />
          </div>
        )
      }

      {/* Mobile Zoom Controls */}
      {
        mobile && cards && cards.length > 0 && (
          <div className="fixed bottom-20 right-4 landscape:bottom-4 landscape:right-4 z-[9999] flex flex-col items-end gap-2">
            {showMobileZoomControls && (
              <div
                ref={mobileZoomControlsRef}
                className="bg-white dark:bg-gray-800 p-2 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-64 mb-2"
              >
                <ZoomControls />
              </div>
            )}
            <button
              onClick={() => setShowMobileZoomControls(!showMobileZoomControls)}
              className="p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg text-gray-600 dark:text-gray-400"
            >
              {showMobileZoomControls ? <ZoomOut className="size-5" /> : <ZoomIn className="size-5" />}
            </button>
          </div>
        )
      }

      {/* Mobile Undo/Redo Controls */}
      {
        mobile && cards && cards.length > 0 && (
          <div className="fixed bottom-20 left-4 landscape:bottom-4 landscape:left-4 z-[9999]">
            <UndoRedoControls />
          </div>
        )
      }
      <ArtworkModal />
    </div >
  );
}