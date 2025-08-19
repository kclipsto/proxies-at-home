import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CardOption } from "../types/Card";
import { usePageSettings } from "../providers/PageSettings";

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
  setModalCard: (card: CardOption) => void;
  setModalIndex: (index: number) => void;
  setIsModalOpen: (open: boolean) => void;
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
  setModalCard,
  setModalIndex,
  setIsModalOpen,
}: SortableCardProps) {
  const { bleedEdge, guideWidth, guideColor } = usePageSettings();
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: card.uuid });

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
        setModalCard(card);
        setModalIndex(globalIndex);
        setIsModalOpen(true);
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
