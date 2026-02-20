import { memo, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import type { DraggableAttributes } from "@dnd-kit/core";
import { useArtworkModalStore } from "../store";
import { useSelectionStore } from "../store/selection";
import type { CardOption } from "../../../shared/types";
import { Check, RefreshCw } from "lucide-react";
import { CONSTANTS } from "@/constants/commonConstants";

type SortableCardProps = {
  card: CardOption;
  index: number;
  globalIndex: number;
  totalCardWidth: number;
  totalCardHeight: number;
  imageBleedWidth?: number;
  onRangeSelect?: (index: number) => void;
  setContextMenu: (menu: {
    visible: boolean;
    x: number;
    y: number;
    cardUuid: string;
  }) => void;
  disabled?: boolean;
  mobile?: boolean;
  scale?: number;
  dropped?: boolean;
};

/**
 * CardView - Transparent overlay for card interactions.
 * All rendering is handled by PixiJS canvas underneath.
 * This component only provides interactive controls (selection, drag, flip).
 */
export const CardView = memo(function CardView({
  card,
  globalIndex,
  onRangeSelect,
  setContextMenu,
  disabled,
  mobile,
  style,
  listeners,
  attributes,
  forwardedRef,
  isOverlay,
}: SortableCardProps & {
  style?: React.CSSProperties;
  listeners?: SyntheticListenerMap;
  attributes?: DraggableAttributes;
  forwardedRef?: React.Ref<HTMLDivElement>;
  isOverlay?: boolean;
  isDragging?: boolean;
}) {
  const openArtworkModal = useArtworkModalStore((state) => state.openModal);

  // Multi-select state
  const isSelected = useSelectionStore((state) => state.selectedCards.has(card.uuid));
  const toggleSelection = useSelectionStore((state) => state.toggleSelection);
  const hasAnySelection = useSelectionStore((state) => state.selectedCards.size > 0);
  const isFlipped = useSelectionStore((state) => state.flippedCards.has(card.uuid));
  const toggleFlip = useSelectionStore((state) => state.toggleFlip);

  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCardClick = (e: React.MouseEvent) => {
    if (isOverlay) return;

    // Shift+click for range selection
    if (e.shiftKey && onRangeSelect) {
      e.preventDefault();
      e.stopPropagation();
      onRangeSelect(globalIndex);
      return;
    }

    // Ctrl/Cmd+click for multi-select
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      toggleSelection(card.uuid, globalIndex);
      return;
    }

    if (mobile) {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({
          visible: true,
          x: e.clientX,
          y: e.clientY,
          cardUuid: card.uuid,
        });
      } else {
        clickTimeoutRef.current = setTimeout(() => {
          openArtworkModal({ card, index: globalIndex, initialTab: isSelected ? 'settings' : 'artwork', initialFace: isFlipped ? 'back' : 'front' });
          clickTimeoutRef.current = null;
        }, 300);
      }
    } else {
      openArtworkModal({ card, index: globalIndex, initialTab: isSelected ? 'settings' : 'artwork', initialFace: isFlipped ? 'back' : 'front' });
    }
  };

  return (
    <div
      ref={forwardedRef}
      {...attributes}
      data-dnd-sortable-item={card.uuid}
      {...(mobile ? listeners : {})}
      className={`relative group ${isOverlay ? 'cursor-grabbing shadow-2xl z-50' : ''}`}
      style={style}
      onClick={handleCardClick}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!mobile && !isOverlay) {
          setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            cardUuid: card.uuid,
          });
        }
      }}
    >
      {/* Transparent interaction layer - PixiJS renders underneath */}
      <div className="w-full h-full relative">
        {/* Controls container */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Selection Overlay - visible when card is selected */}
          {isSelected && !isOverlay && (
            <div className="absolute inset-0 bg-blue-500/30 pointer-events-none z-10 border-4 border-blue-500" />
          )}

          {/* Selection Checkbox */}
          {!isOverlay && (
            <div
              className={`absolute left-1 top-1 w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer z-20 transition-opacity pointer-events-auto ${isSelected
                ? 'bg-blue-600 border-blue-600 opacity-100'
                : hasAnySelection
                  ? 'bg-white/80 border-gray-400 opacity-100'
                  : 'bg-white/80 border-gray-400 opacity-0 group-hover:opacity-100'
                }`}
              onClick={(e) => {
                e.stopPropagation();
                if (e.shiftKey && onRangeSelect) {
                  onRangeSelect(globalIndex);
                } else {
                  toggleSelection(card.uuid, globalIndex);
                }
              }}
              title="Select card"
            >
              {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
            </div>
          )}

          {/* ⠿ Drag Handle - Desktop Only */}
          {!disabled && !mobile && !isOverlay && (
            <div
              {...listeners}
              className="absolute right-[4px] top-1 w-6 h-6 bg-white text-green text-sm rounded-sm flex items-center justify-center cursor-move group-hover:opacity-100 opacity-50 select-none z-20 pointer-events-auto"
              title="Drag"
              onClick={(e) => e.stopPropagation()}
            >
              ⠿
            </div>
          )}

          {/* ↻ Flip Button */}
          {!isOverlay && (
            <div
              data-testid="flip-button"
              className={`absolute right-[4px] top-8 w-6 h-6 rounded-sm flex items-center justify-center cursor-pointer group-hover:opacity-100 select-none z-20 transition-colors pointer-events-auto ${isFlipped
                ? 'bg-blue-500 text-white opacity-100'
                : 'bg-white text-gray-700 opacity-50 hover:bg-gray-100'
                }`}
              title={isFlipped ? "Show front" : "Show back"}
              onClick={(e) => {
                e.stopPropagation();
                toggleFlip(card.uuid);
              }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

const SortableCard = memo(function SortableCard(props: SortableCardProps) {
  const { card, dropped, totalCardWidth, totalCardHeight, imageBleedWidth, scale = 1 } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: card.uuid,
      disabled: props.disabled,
    });

  // Calculate actual card dimensions
  const actualCardWidth = imageBleedWidth !== undefined
    ? CONSTANTS.CARD_WIDTH_MM + imageBleedWidth * 2
    : totalCardWidth;
  const actualCardHeight = imageBleedWidth !== undefined
    ? CONSTANTS.CARD_HEIGHT_MM + imageBleedWidth * 2
    : totalCardHeight;

  const scaledTransform = transform ? {
    ...transform,
    x: transform.x / scale,
    y: transform.y / scale,
  } : null;

  const style = {
    transform: dropped ? undefined : CSS.Transform.toString(scaledTransform),
    transition,
    width: `${actualCardWidth}mm`,
    height: `${actualCardHeight}mm`,
    zIndex: isDragging ? 999 : "auto",
    opacity: isDragging ? 0 : 1,
    touchAction: "manipulation",
    WebkitTouchCallout: "none",
  } as React.CSSProperties;

  return (
    <CardView
      {...props}
      forwardedRef={setNodeRef}
      style={style}
      listeners={listeners}
      attributes={attributes}
      isDragging={isDragging}
    />
  );
});

export default SortableCard;
