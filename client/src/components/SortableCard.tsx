import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useArtworkModalStore, useSettingsStore } from "../store";
import type { CardOption } from "../types/Card";

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
    cardIndex: number;
  }) => void;
};

export default function SortableCard({
  card,
  index,
  globalIndex,
  imageSrc,
  totalCardWidth,
  totalCardHeight,
  guideOffset,
  setContextMenu,
}: SortableCardProps) {
  const bleedEdge = useSettingsStore((state) => state.bleedEdge);
  const guideWidth = useSettingsStore((state) => state.guideWidth);
  const guideColor = useSettingsStore((state) => state.guideColor);
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: card.uuid });

  const openArtworkModal = useArtworkModalStore((state) => state.openModal);

  const style = {
    transform: CSS.Transform.toString(transform),
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
        className="cursor-pointer block"
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            cardIndex: globalIndex,
          });
        }}
      />

      {/* ⠿ Drag Handle */}
      <div
        {...listeners}
        className="absolute right-[4px] top-1 w-4 h-4 bg-white text-green text-xs rounded-sm flex items-center justify-center cursor-move group-hover:opacity-100 opacity-50"
        title="Drag"
      >
        ⠿
      </div>

      {bleedEdge && (
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
      )}
    </div>
  );
}
