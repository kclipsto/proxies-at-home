import { memo, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import type { DraggableAttributes } from "@dnd-kit/core";
import { useArtworkModalStore, useSettingsStore } from "../store";
import { useSelectionStore } from "../store/selection";
import type { CardOption } from "../../../shared/types";
import { Check, RefreshCw } from "lucide-react";
import { CardGuides } from "./PageComponents/CardGuides";


type SortableCardProps = {
  card: CardOption;
  index: number;
  globalIndex: number;
  imageSrc: string;
  backImageSrc?: string;  // Back face image for DFCs
  backImageId?: string;   // Back card imageId (needed to detect cardback_builtin_blank)
  totalCardWidth: number;
  totalCardHeight: number;
  guideOffset: number | string;
  imageBleedWidth?: number;  // Per-image bleed width for custom bleed overrides
  onRangeSelect?: (index: number) => void;  // For shift+click range selection
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

export const CardView = memo(function CardView({
  card,
  globalIndex,
  imageSrc,
  backImageSrc,
  backImageId,
  guideOffset,
  imageBleedWidth,
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
  const guideWidth = useSettingsStore((state) => state.guideWidth);
  const guideColor = useSettingsStore((state) => state.guideColor);
  const perCardGuideStyle = useSettingsStore((state) => state.perCardGuideStyle);
  const guidePlacement = useSettingsStore((state) => state.guidePlacement);
  const openArtworkModal = useArtworkModalStore((state) => state.openModal);

  // Multi-select state
  const isSelected = useSelectionStore((state) => state.selectedCards.has(card.uuid));
  const toggleSelection = useSelectionStore((state) => state.toggleSelection);
  // selectRange is now handled by parent via onRangeSelect to prevent re-renders
  const hasAnySelection = useSelectionStore((state) => state.selectedCards.size > 0);
  const isFlipped = useSelectionStore((state) => state.flippedCards.has(card.uuid));
  const toggleFlip = useSelectionStore((state) => state.toggleFlip);

  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cache the last valid backImageSrc to avoid flash when changing artwork
  const lastBackImageRef = useRef<string | undefined>(backImageSrc);
  if (backImageSrc) {
    lastBackImageRef.current = backImageSrc;
  }
  // Use the cached image if current is undefined (during processing)
  const displayBackImageSrc = backImageSrc || lastBackImageRef.current;

  // Check if back is blank cardback (should render as white, no image)
  const isBlankBack = backImageId === 'cardback_builtin_blank';

  const handleCardClick = (e: React.MouseEvent) => {
    if (isOverlay) return; // No interactions on overlay

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
        // Double tap detected
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
        // Single tap - wait for potential second tap
        clickTimeoutRef.current = setTimeout(() => {
          // If card is selected, open Settings tab; if flipped, open back face
          openArtworkModal({ card, index: globalIndex, initialTab: isSelected ? 'settings' : 'artwork', initialFace: isFlipped ? 'back' : 'front' });
          clickTimeoutRef.current = null;
        }, 300);
      }
    } else {
      // Desktop behavior - if card is selected, open Settings tab; if flipped, open back face
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
      style={{
        ...style,
        // Only position transforms here, no flip rotation
      }}
      onClick={handleCardClick}
      onContextMenu={(e) => {
        e.preventDefault(); // Always prevent native context menu
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
      {/* Inner wrapper handles 3D flip, separate from positioning */}
      <div
        className={`w-full h-full relative ${isFlipped && isBlankBack ? 'bg-transparent' : 'bg-black'}`}
        style={{
          transform: isFlipped ? 'rotateY(180deg)' : undefined,
          transition: 'transform 0.4s ease-in-out',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* 3D Card faces - both always rendered, backface-visibility handles which is shown */}
        {/* Front Face - hide when flipped to blank back so black bg doesn't show through transparent */}
        {imageSrc && !(isFlipped && isBlankBack) && (
          <img
            src={imageSrc}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            className="absolute inset-0 cursor-pointer block select-none w-full h-full"
            style={{ backfaceVisibility: 'hidden' }}
          />
        )}
        {/* Back Face - pre-rotated 180deg so it shows when card flips */}
        {isBlankBack ? (
          /* Blank cardback: frosted glass effect with subtle visible backing */
          <div
            className="absolute inset-0 cursor-pointer bg-gradient-to-br from-gray-200/95 to-gray-300/95 dark:from-gray-500/95 dark:to-gray-600/95 border border-gray-300/60 dark:border-gray-500/40"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.4), inset 0 -1px 3px rgba(0,0,0,0.15)',
            }}
          />
        ) : displayBackImageSrc ? (
          <img
            src={displayBackImageSrc}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            className="absolute inset-0 cursor-pointer block select-none w-full h-full"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}
          />
        ) : (
          /* Back image not processed yet - show loading state */
          <div
            className="absolute inset-0 bg-gray-800 cursor-pointer flex items-center justify-center"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}
          >
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-500 border-t-transparent" />
          </div>
        )}

        {/* Controls container - counter-rotated to stay in place during flip */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: isFlipped ? 'rotateY(-180deg)' : undefined,
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Selection Overlay - visible when card is selected */}
          {isSelected && !isOverlay && (
            <div className="absolute inset-0 bg-blue-500/30 pointer-events-none z-10 border-4 border-blue-500" />
          )}

          {/* Selection Checkbox - visible on hover or when any card is selected. 
            CHANGED: Removed !disabled check to allow selection even when sorting is disabled (e.g. sorted mode) */}
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
                // Shift+click for range selection
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
              className="absolute right-[4px] top-1 w-4 h-4 bg-white text-green text-xs rounded-sm flex items-center justify-center cursor-move group-hover:opacity-100 opacity-50 select-none z-20 pointer-events-auto"
              title="Drag"
              onClick={(e) => e.stopPropagation()}
            >
              ⠿
            </div>
          )}

          {/* ↻ Flip Button - Always visible */}
          {!isOverlay && (
            <div
              data-testid="flip-button"
              className={`absolute right-[4px] top-6 w-4 h-4 rounded-sm flex items-center justify-center cursor-pointer group-hover:opacity-100 select-none z-20 transition-colors pointer-events-auto ${isFlipped
                ? 'bg-blue-500 text-white opacity-100'
                : 'bg-white text-gray-700 opacity-50 hover:bg-gray-100'
                }`}
              title={isFlipped ? "Show front" : "Show back"}
              onClick={(e) => {
                e.stopPropagation();
                toggleFlip(card.uuid);
              }}
            >
              <RefreshCw className="w-2.5 h-2.5" />
            </div>
          )}
        </div>

        {/* Cut Guide / Safe Area Box - hide when flipped to blank back */}
        {!(isFlipped && isBlankBack) && (
          <CardGuides
            guideWidth={guideWidth}
            guideColor={guideColor}
            perCardGuideStyle={perCardGuideStyle}
            guidePlacement={guidePlacement}
            guideOffset={guideOffset}
            imageBleedWidth={imageBleedWidth}
          />
        )}
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

  // Base card dimensions in mm (MTG standard)
  const BASE_CARD_WIDTH_MM = 63;
  const BASE_CARD_HEIGHT_MM = 88;

  // Calculate actual card dimensions: use per-card bleed if available, otherwise use passed totals
  const actualCardWidth = imageBleedWidth !== undefined
    ? BASE_CARD_WIDTH_MM + imageBleedWidth * 2
    : totalCardWidth;
  const actualCardHeight = imageBleedWidth !== undefined
    ? BASE_CARD_HEIGHT_MM + imageBleedWidth * 2
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
    opacity: isDragging ? 0 : 1, // Hide original when dragging
    touchAction: "manipulation",
    WebkitTouchCallout: "none", // Prevent iOS context menu on long press
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
