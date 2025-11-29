import { memo, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useArtworkModalStore, useSettingsStore } from "../store";
import type { CardOption } from "../../../shared/types";

type SortableCardProps = {
  card: CardOption;
  index: number;
  globalIndex: number;
  imageSrc: string;
  totalCardWidth: number;
  totalCardHeight: number;
  guideOffset: number | string;
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
  guideOffset,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listeners?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes?: any;
  forwardedRef?: React.Ref<HTMLDivElement>;
  isOverlay?: boolean;
  isDragging?: boolean;
}) {
  const guideWidth = useSettingsStore((state) => state.guideWidth);
  const guideColor = useSettingsStore((state) => state.guideColor);
  const openArtworkModal = useArtworkModalStore((state) => state.openModal);

  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCardClick = (e: React.MouseEvent) => {
    if (isOverlay) return; // No interactions on overlay

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
          openArtworkModal({ card, index: globalIndex });
          clickTimeoutRef.current = null;
        }, 300);
      }
    } else {
      // Desktop behavior
      openArtworkModal({ card, index: globalIndex });
    }
  };

  return (
    <div
      ref={forwardedRef}
      {...attributes}
      {...(mobile ? listeners : {})}
      className={`bg-black relative group ${isOverlay ? 'cursor-grabbing shadow-2xl z-50' : ''}`}
      style={style}
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
      {imageSrc && (
        <img
          src={imageSrc}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className="cursor-pointer block select-none"
        />
      )}

      {/* ⠿ Drag Handle - Desktop Only */}
      {!disabled && !mobile && !isOverlay && (
        <div
          {...listeners}
          className="absolute right-[4px] top-1 w-4 h-4 bg-white text-green text-xs rounded-sm flex items-center justify-center cursor-move group-hover:opacity-100 opacity-50 select-none z-20"
          title="Drag"
          onClick={(e) => e.stopPropagation()}
        >
          ⠿
        </div>
      )}

      {/* Cut Guide / Safe Area Box */}
      <div className="pointer-events-none z-10 absolute inset-0">
        <div
          data-testid="guide-top-left-h"
          style={{
            position: "absolute",
            top: guideOffset,
            left: guideOffset,
            width: `${guideWidth}px`,
            height: "2mm",
            backgroundColor: guideColor,
          }}
        />
        <div
          data-testid="guide-top-left-v"
          style={{
            position: "absolute",
            top: guideOffset,
            left: guideOffset,
            width: "2mm",
            height: `${guideWidth}px`,
            backgroundColor: guideColor,
          }}
        />

        <div
          data-testid="guide-top-right-h"
          style={{
            position: "absolute",
            top: guideOffset,
            right: guideOffset,
            width: `${guideWidth}px`,
            height: "2mm",
            backgroundColor: guideColor,
          }}
        />
        <div
          data-testid="guide-top-right-v"
          style={{
            position: "absolute",
            top: guideOffset,
            right: guideOffset,
            width: "2mm",
            height: `${guideWidth}px`,
            backgroundColor: guideColor,
          }}
        />

        <div
          data-testid="guide-bottom-left-h"
          style={{
            position: "absolute",
            bottom: guideOffset,
            left: guideOffset,
            width: `${guideWidth}px`,
            height: "2mm",
            backgroundColor: guideColor,
          }}
        />
        <div
          data-testid="guide-bottom-left-v"
          style={{
            position: "absolute",
            bottom: guideOffset,
            left: guideOffset,
            width: "2mm",
            height: `${guideWidth}px`,
            backgroundColor: guideColor,
          }}
        />

        <div
          data-testid="guide-bottom-right-h"
          style={{
            position: "absolute",
            bottom: guideOffset,
            right: guideOffset,
            width: `${guideWidth}px`,
            height: "2mm",
            backgroundColor: guideColor,
          }}
        />
        <div
          data-testid="guide-bottom-right-v"
          style={{
            position: "absolute",
            bottom: guideOffset,
            right: guideOffset,
            width: "2mm",
            height: `${guideWidth}px`,
            backgroundColor: guideColor,
          }}
        />
      </div>
    </div>
  );
});

const SortableCard = memo(function SortableCard(props: SortableCardProps) {
  const { card, dropped, totalCardWidth, totalCardHeight, scale = 1 } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: card.uuid,
      disabled: props.disabled,
    });


  const scaledTransform = transform ? {
    ...transform,
    x: transform.x / scale,
    y: transform.y / scale,
  } : null;

  const style = {
    transform: dropped ? undefined : CSS.Transform.toString(scaledTransform),
    transition,
    width: `${totalCardWidth}mm`,
    height: `${totalCardHeight}mm`,
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
