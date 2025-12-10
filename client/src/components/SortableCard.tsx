import { memo, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import type { DraggableAttributes } from "@dnd-kit/core";
import { useArtworkModalStore, useSettingsStore } from "../store";
import { useSelectionStore } from "../store/selection";
import type { CardOption } from "../../../shared/types";
import { Check } from "lucide-react";

type SortableCardProps = {
  card: CardOption;
  index: number;
  globalIndex: number;
  imageSrc: string;
  totalCardWidth: number;
  totalCardHeight: number;
  guideOffset: number | string;
  imageBleedWidth?: number;  // Per-image bleed width for custom bleed overrides
  allCardUuids?: string[];  // For shift+click range selection
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

// Corner radius for MTG cards per wiki: 2.5mm
const CARD_CORNER_RADIUS_MM = 2.5;

export const CardView = memo(function CardView({
  card,
  globalIndex,
  imageSrc,
  guideOffset,
  imageBleedWidth,
  allCardUuids,
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
  const selectRange = useSelectionStore((state) => state.selectRange);
  const hasAnySelection = useSelectionStore((state) => state.selectedCards.size > 0);

  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCardClick = (e: React.MouseEvent) => {
    if (isOverlay) return; // No interactions on overlay

    // Shift+click for range selection
    if (e.shiftKey && allCardUuids) {
      e.preventDefault();
      e.stopPropagation();
      selectRange(allCardUuids, globalIndex);
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
          // If card is selected, open Settings tab
          openArtworkModal({ card, index: globalIndex, initialTab: isSelected ? 'settings' : 'artwork' });
          clickTimeoutRef.current = null;
        }, 300);
      }
    } else {
      // Desktop behavior - if card is selected, open Settings tab
      openArtworkModal({ card, index: globalIndex, initialTab: isSelected ? 'settings' : 'artwork' });
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
          className="cursor-pointer block select-none w-full h-full"
        />
      )}

      {/* Selection Overlay - visible when card is selected */}
      {isSelected && !isOverlay && (
        <div className="absolute inset-0 bg-blue-500/30 pointer-events-none z-10 border-4 border-blue-500" />
      )}

      {/* Selection Checkbox - visible on hover or when any card is selected */}
      {!disabled && !isOverlay && (
        <div
          className={`absolute left-1 top-1 w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer z-20 transition-opacity ${isSelected
            ? 'bg-blue-600 border-blue-600 opacity-100'
            : hasAnySelection
              ? 'bg-white/80 border-gray-400 opacity-100'
              : 'bg-white/80 border-gray-400 opacity-0 group-hover:opacity-100'
            }`}
          onClick={(e) => {
            e.stopPropagation();
            // Shift+click for range selection
            if (e.shiftKey && allCardUuids) {
              selectRange(allCardUuids, globalIndex);
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
          className="absolute right-[4px] top-1 w-4 h-4 bg-white text-green text-xs rounded-sm flex items-center justify-center cursor-move group-hover:opacity-100 opacity-50 select-none z-20"
          title="Drag"
          onClick={(e) => e.stopPropagation()}
        >
          ⠿
        </div>
      )}

      {/* Cut Guide / Safe Area Box */}
      {perCardGuideStyle !== 'none' && (
        <div className="pointer-events-none z-10 absolute inset-0">
          {perCardGuideStyle === 'corners' ? (
            /* Corner marks - L-shaped tick marks at each corner */
            (() => {
              if (guideWidth <= 0) return null;

              // Guide width is in CSS pixels (96 DPI)
              const guideWidthPx = Math.max(1, Math.round(guideWidth));
              // For outside: offset by full width to place guide entirely outside the cut line
              // For inside: just use the offset as-is (guide grows inward)
              const offsetCalc = guidePlacement === 'outside'
                ? (val: number | string) => `calc(${typeof val === 'number' ? `${val}px` : val} - ${guideWidthPx}px)`
                : (val: number | string) => typeof val === 'number' ? `${val}px` : val;

              const length = guidePlacement === 'outside' ? `calc(2mm + ${guideWidthPx}px)` : '2mm';

              return (
                <>
                  {/* Top Left */}
                  <div
                    data-testid="guide-top-left-h"
                    style={{
                      position: "absolute",
                      top: offsetCalc(guideOffset),
                      left: offsetCalc(guideOffset),
                      width: length,
                      height: `${guideWidthPx}px`,
                      backgroundColor: guideColor,
                    }}
                  />
                  <div
                    data-testid="guide-top-left-v"
                    style={{
                      position: "absolute",
                      top: offsetCalc(guideOffset),
                      left: offsetCalc(guideOffset),
                      width: `${guideWidthPx}px`,
                      height: length,
                      backgroundColor: guideColor,
                    }}
                  />

                  {/* Top Right */}
                  <div
                    data-testid="guide-top-right-h"
                    style={{
                      position: "absolute",
                      top: offsetCalc(guideOffset),
                      right: offsetCalc(guideOffset),
                      width: length,
                      height: `${guideWidthPx}px`,
                      backgroundColor: guideColor,
                    }}
                  />
                  <div
                    data-testid="guide-top-right-v"
                    style={{
                      position: "absolute",
                      top: offsetCalc(guideOffset),
                      right: offsetCalc(guideOffset),
                      width: `${guideWidthPx}px`,
                      height: length,
                      backgroundColor: guideColor,
                    }}
                  />

                  {/* Bottom Left */}
                  <div
                    data-testid="guide-bottom-left-h"
                    style={{
                      position: "absolute",
                      bottom: offsetCalc(guideOffset),
                      left: offsetCalc(guideOffset),
                      width: length,
                      height: `${guideWidthPx}px`,
                      backgroundColor: guideColor,
                    }}
                  />
                  <div
                    data-testid="guide-bottom-left-v"
                    style={{
                      position: "absolute",
                      bottom: offsetCalc(guideOffset),
                      left: offsetCalc(guideOffset),
                      width: `${guideWidthPx}px`,
                      height: length,
                      backgroundColor: guideColor,
                    }}
                  />

                  {/* Bottom Right */}
                  <div
                    data-testid="guide-bottom-right-h"
                    style={{
                      position: "absolute",
                      bottom: offsetCalc(guideOffset),
                      right: offsetCalc(guideOffset),
                      width: length,
                      height: `${guideWidthPx}px`,
                      backgroundColor: guideColor,
                    }}
                  />
                  <div
                    data-testid="guide-bottom-right-v"
                    style={{
                      position: "absolute",
                      bottom: offsetCalc(guideOffset),
                      right: offsetCalc(guideOffset),
                      width: `${guideWidthPx}px`,
                      height: length,
                      backgroundColor: guideColor,
                    }}
                  />
                </>
              );
            })()
          ) : perCardGuideStyle === 'rounded-corners' ? (
            /* Rounded corner marks using 4 CSS quarter-circle borders */
            (() => {
              if (guideWidth <= 0) return null;

              // Guide width is in CSS pixels (96 DPI)
              const guideWidthPx = Math.max(1, Math.round(guideWidth));

              // Convert constants to pixels and round to snap to grid
              const DPI = 96;
              const mmToPx = (mm: number) => (mm * DPI) / 25.4;

              // Parse guideOffset to pixels, or use imageBleedWidth if available (for per-card custom bleed)
              let offsetPx = 0;
              if (imageBleedWidth !== undefined) {
                // Per-card bleed width takes precedence
                offsetPx = mmToPx(imageBleedWidth);
              } else if (typeof guideOffset === 'number') {
                offsetPx = guideOffset;
              } else if (typeof guideOffset === 'string' && guideOffset.endsWith('mm')) {
                offsetPx = mmToPx(parseFloat(guideOffset));
              }

              // Round offset to nearest pixel to avoid sub-pixel rendering
              const roundedOffsetPx = Math.round(offsetPx);

              // Calculate position: for outside, offset - guideWidth; for inside, just offset
              const pos = guidePlacement === 'outside'
                ? roundedOffsetPx - guideWidthPx
                : roundedOffsetPx;

              // Calculate dimensions
              const radiusPx = Math.round(mmToPx(CARD_CORNER_RADIUS_MM));
              // For outside: SVG box needs to be larger to accommodate the outward stroke
              // For inside: inner edge at card radius, so outer edge at radius + guideWidth
              const W = radiusPx + guideWidthPx;

              const w = guideWidthPx;
              // Arc radius: stroke is centered on the path
              // For outside: inner edge at card radius, path at radius + w/2, outer at radius + w
              // For inside: inner edge at card radius, path at radius + w/2, outer at radius + w
              // Both cases have the same arc radius!
              const Rc = radiusPx + w / 2;

              // SVG Path for Top-Left corner (stroked arc)
              // Center of arc is at (W, W)
              // Start at (w/2, W) -> (W - Rc, W)
              // End at (W, w/2) -> (W, W - Rc)
              // Arc from start to end
              const start = w / 2;
              const pathData = `M ${start} ${W} A ${Rc} ${Rc} 0 0 1 ${W} ${start}`;

              const commonStyle: React.CSSProperties = {
                position: 'absolute',
                width: `${W}px`,
                height: `${W}px`,
                pointerEvents: 'none',
              };

              return (
                <>
                  {/* Top Left */}
                  <svg style={{ ...commonStyle, top: `${pos}px`, left: `${pos}px` }}>
                    <path d={pathData} fill="none" stroke={guideColor} strokeWidth={w} strokeLinecap="butt" />
                  </svg>

                  {/* Top Right - Rotate 90deg */}
                  <svg style={{ ...commonStyle, top: `${pos}px`, right: `${pos}px`, transform: 'rotate(90deg)' }}>
                    <path d={pathData} fill="none" stroke={guideColor} strokeWidth={w} strokeLinecap="butt" />
                  </svg>

                  {/* Bottom Right - Rotate 180deg */}
                  <svg style={{ ...commonStyle, bottom: `${pos}px`, right: `${pos}px`, transform: 'rotate(180deg)' }}>
                    <path d={pathData} fill="none" stroke={guideColor} strokeWidth={w} strokeLinecap="butt" />
                  </svg>

                  {/* Bottom Left - Rotate 270deg */}
                  <svg style={{ ...commonStyle, bottom: `${pos}px`, left: `${pos}px`, transform: 'rotate(270deg)' }}>
                    <path d={pathData} fill="none" stroke={guideColor} strokeWidth={w} strokeLinecap="butt" />
                  </svg>
                </>
              );
            })()
          ) : (
            /* Solid or dashed rounded/square rectangle using CSS border-radius
               Guide width is in pixels */
            (() => {
              if (guideWidth <= 0) return null;

              // Guide width is in CSS pixels (96 DPI)
              const guideWidthPx = Math.max(1, Math.round(guideWidth));

              const isSquare = perCardGuideStyle === 'solid-squared-rect' || perCardGuideStyle === 'dashed-squared-rect';
              const isDashed = perCardGuideStyle === 'dashed-rounded-rect' || perCardGuideStyle === 'dashed-squared-rect';

              // Parse guideOffset to get offset value, or use imageBleedWidth if available (for per-card custom bleed)
              let offsetMm: number;
              if (imageBleedWidth !== undefined) {
                // Per-card bleed width takes precedence
                offsetMm = imageBleedWidth;
              } else if (typeof guideOffset === 'string' && guideOffset.endsWith('mm')) {
                offsetMm = parseFloat(guideOffset);
              } else if (typeof guideOffset === 'number') {
                // Convert pixels back to mm (assuming 96 DPI)
                offsetMm = (guideOffset * 25.4) / 96;
              } else {
                offsetMm = 0;
              }

              const offsetValue = `${offsetMm}mm`;
              const positionOffset = guidePlacement === 'outside'
                ? `calc(${offsetValue} - ${guideWidthPx}px)`
                : offsetValue;

              // For outside: outer radius = card radius + width (inner edge at card radius)
              // For inside: inner radius should be 2.5mm, so border-radius = 2.5mm + width
              //             (CSS border-radius is the outer edge, inner edge = outer - border-width)
              const borderRadius = isSquare
                ? 0
                : guidePlacement === 'outside'
                  ? `calc(${CARD_CORNER_RADIUS_MM}mm + ${guideWidthPx}px)`
                  : `calc(${CARD_CORNER_RADIUS_MM}mm + ${guideWidthPx}px)`;

              return (
                <div
                  className="absolute"
                  style={{
                    top: positionOffset,
                    left: positionOffset,
                    right: positionOffset,
                    bottom: positionOffset,
                    borderRadius,
                    border: `${guideWidthPx}px ${isDashed ? 'dashed' : 'solid'} ${guideColor}`,
                    boxSizing: 'border-box',
                  }}
                />
              );
            })()
          )}
        </div>
      )}
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
