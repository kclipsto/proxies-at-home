import { memo, useEffect } from "react";
import { useOnScreen } from "../hooks/useOnScreen";
import type { CardOption } from "../../../shared/types";
import { Priority } from "../helpers/imageProcessor";
import SortableCard from "./SortableCard";

type Props = {
  card: CardOption;
  backCard?: CardOption;
  state: "idle" | "loading" | "error" | undefined;
  hasImage: boolean;
  ensureProcessed: (card: CardOption, priority?: Priority) => Promise<void>;
  // SortableCard props
  index: number;
  globalIndex: number;
  imageSrc: string;
  backImageSrc?: string;
  backImageId?: string;
  totalCardWidth: number;
  totalCardHeight: number;
  guideOffset: string;
  imageBleedWidth: number;
  onRangeSelect?: (index: number) => void;
  setContextMenu: (menu: {
    visible: boolean;
    x: number;
    y: number;
    cardUuid: string;
  }) => void;
  disabled: boolean;
  mobile: boolean;
  scale: number;
  dropped: boolean;
};

const CardCellLazy = memo(function CardCellLazy({
  card,
  backCard,
  state,
  hasImage,
  ensureProcessed,
  // SortableCard props
  index,
  globalIndex,
  imageSrc,
  backImageSrc,
  backImageId,
  totalCardWidth,
  totalCardHeight,
  guideOffset,
  imageBleedWidth,
  onRangeSelect,
  setContextMenu,
  disabled,
  mobile,
  scale,
  dropped,
}: Props) {
  const { ref, visible } = useOnScreen<HTMLDivElement>("400px");

  // Extract stable identifiers - use null for missing values to keep array size constant
  const backCardUuid = backCard?.uuid ?? null;
  const backCardImageId = backCard?.imageId ?? null; // Trigger processing when visible
  useEffect(() => {
    if (visible && card.imageId) {
      if (card.order < 5) {
        // console.log('[PerfTrace] CardCellLazy effect triggered for', card.uuid, 'imageId:', card.imageId);
      }
      void ensureProcessed(card, Priority.HIGH);
      // Also process back card if it exists
      if (backCard) {
        void ensureProcessed(backCard, Priority.HIGH);
      }
    }
    // Use stable identifiers instead of object references to prevent
    // re-firing when useLiveQuery returns new object references
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, card.uuid, card.imageId, backCardUuid, backCardImageId, ensureProcessed]);

  return (
    <div ref={ref} className={`relative w-full h-full ${!hasImage ? "bg-black" : ""}`}>
      {!hasImage && state !== "error" && (
        <div className="absolute inset-0 grid place-items-center z-10">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-transparent" />
        </div>
      )}
      {state === "error" && !hasImage && (
        <div className="absolute inset-0 grid place-items-center z-10">
          <div className="px-2 py-1 text-xs bg-red-600 text-white rounded">
            load failed
          </div>
        </div>
      )}
      <div
        onClick={() => {
          if (state === "error") void ensureProcessed(card, Priority.HIGH);
        }}
      >
        <SortableCard
          card={card}
          index={index}
          globalIndex={globalIndex}
          imageSrc={imageSrc}
          backImageSrc={backImageSrc}
          backImageId={backImageId}
          totalCardWidth={totalCardWidth}
          totalCardHeight={totalCardHeight}
          guideOffset={guideOffset}
          imageBleedWidth={imageBleedWidth}
          onRangeSelect={onRangeSelect}
          setContextMenu={setContextMenu}
          disabled={disabled}
          mobile={mobile}
          scale={scale}
          dropped={dropped}
        />
      </div>
    </div>
  );
});

export default CardCellLazy;
