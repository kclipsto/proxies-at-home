import { memo } from "react";
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
};

const SortableCard = memo(function SortableCard({
  card,
  index,
  globalIndex,
  imageSrc,
  totalCardWidth,
  totalCardHeight,
  guideOffset,
  setContextMenu,
  disabled,
}: SortableCardProps) {
  const guideWidth = useSettingsStore((state) => state.guideWidth);
  const guideColor = useSettingsStore((state) => state.guideColor);
  const zoom = useSettingsStore((state) => state.zoom);
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: card.uuid, disabled });

  const openArtworkModal = useArtworkModalStore((state) => state.openModal);

  const scaledTransform = transform
    ? {
      ...transform,
      x: transform.x * (1 / zoom),
      y: transform.y * (1 / zoom),
    }
    : null;

  const style = {
    transform: CSS.Transform.toString(scaledTransform),
    transition,
    width: `${totalCardWidth}mm`,
    height: `${totalCardHeight}mm`,
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      key={`${card.uuid}-${index}`}
      className="bg-black relative group"
      style={style}
      onClick={() => {
        openArtworkModal({ card, index: globalIndex });
      }}
    >
      <img
        src={imageSrc}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        className="cursor-pointer block"
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            cardUuid: card.uuid,
          });
        }}
      />

      {/* ⠿ Drag Handle */}
      {!disabled && (
        <div
          {...listeners}
          className="absolute right-[4px] top-1 w-4 h-4 bg-white text-green text-xs rounded-sm flex items-center justify-center cursor-move group-hover:opacity-100 opacity-50 select-none"
          title="Drag"
        >
          ⠿
        </div>
      )}

      <>
        <div
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
          style={{
            position: "absolute",
            bottom: guideOffset,
            right: guideOffset,
            width: "2mm",
            height: `${guideWidth}px`,
            backgroundColor: guideColor,
          }}
        />
      </>
    </div>
  );
});

export default SortableCard;
