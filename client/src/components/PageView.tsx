/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
} from "@dnd-kit/sortable";
import { Button, Label } from "flowbite-react";
import { useEffect, useRef, useState } from "react";
import fullLogo from "../assets/fullLogo.png";
import CardCellLazy from "../components/CardCellLazy";
import EdgeCutLines from "../components/FullPageGuides";
import SortableCard from "../components/SortableCard";
import { getBleedInPixels } from "../helpers/ImageHelper";
import { useImageProcessing } from "../hooks/useImageProcessing";
import { usePageSettings } from "../providers/PageSettings";
import type { CardOption } from "../types/Card";

const unit = "mm";
const baseCardWidthMm = 63;
const baseCardHeightMm = 88;

export function PageView({
  cards,
  setCards,
  selectedImages,
  setSelectedImages,
  originalSelectedImages,
  setOriginalSelectedImages,
  setModalCard,
  setModalIndex,
  setIsModalOpen,
}: {
  cards: CardOption[];
  setCards: (cards: CardOption[]) => void;
  selectedImages: Record<string, string>;
  setSelectedImages: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  originalSelectedImages: Record<string, string>;
  setOriginalSelectedImages: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  setModalCard: React.Dispatch<React.SetStateAction<CardOption | null>>;
  setModalIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const {
    pageWidthIn,
    pageHeightIn,
    columns,
    rows,
    bleedEdgeWidth,
    bleedEdge,
    guideWidth,
    zoom,
  } = usePageSettings();
  const pageRef = useRef<HTMLDivElement>(null);

  const bleedPixels = getBleedInPixels(bleedEdgeWidth, unit);
  const guideOffset = `${(bleedPixels * (25.4 / 300)).toFixed(3)}mm`;
  const totalCardWidth = baseCardWidthMm + bleedEdgeWidth * 2;
  const totalCardHeight = baseCardHeightMm + bleedEdgeWidth * 2;
  const gridWidthMm = totalCardWidth * columns;
  const gridHeightMm = totalCardHeight * rows;
  const pageCapacity = columns * rows;

  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    cardIndex: null as number | null,
  });

  useEffect(() => {
    const handler = () =>
      setContextMenu((prev) => ({ ...prev, visible: false }));
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  function duplicateCard(index: number) {
    const cardToCopy = cards[index];
    const newCard = { ...cardToCopy, uuid: crypto.randomUUID() };

    const newCards = [...cards];
    newCards.splice(index + 1, 0, newCard);
    setCards(newCards);

    const original = originalSelectedImages[cardToCopy.uuid];
    const processed = selectedImages[cardToCopy.uuid];

    setOriginalSelectedImages((prev) => ({
      ...prev,
      [newCard.uuid]: original,
    }));

    setSelectedImages((prev) => ({
      ...prev,
      [newCard.uuid]: processed,
    }));
  }

  function deleteCard(index: number) {
    const cardToRemove = cards[index];
    const cardUuid = cardToRemove.uuid;

    const newCards = cards.filter((_, i) => i !== index);

    const { [cardUuid]: _, ...newSelectedImages } = selectedImages;
    const { [cardUuid]: __, ...newOriginalSelectedImages } =
      originalSelectedImages;

    setCards(newCards);
    setSelectedImages(newSelectedImages);
    setOriginalSelectedImages(newOriginalSelectedImages);
  }

  const reorderImageMap = (
    cards: CardOption[],
    oldIndex: number,
    newIndex: number,
    map: Record<string, string>
  ) => {
    const uuids = cards.map((c) => c.uuid);
    const reorderedUuids = arrayMove(uuids, oldIndex, newIndex);

    const newMap: Record<string, string> = {};
    reorderedUuids.forEach((uuid) => {
      if (map[uuid]) {
        newMap[uuid] = map[uuid];
      }
    });

    return newMap;
  };

  function chunkCards<T>(cards: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < cards.length; i += size) {
      chunks.push(cards.slice(i, i + size));
    }
    return chunks;
  }

  const { loadingMap, ensureProcessed } = useImageProcessing({
    unit, // "mm" | "in"
    bleedEdgeWidth, // number
    selectedImages,
    setSelectedImages,
    originalSelectedImages,
    setOriginalSelectedImages,
  });

  return (
    <div className="w-1/2 flex-1 overflow-y-auto bg-gray-200 h-full p-6 flex justify-center dark:bg-gray-800 ">
      {cards.length === 0 ? (
        <div className="flex flex-col items-center">
          <div className="flex flex-row items-center">
            <Label className="text-7xl justify-center font-bold whitespace-nowrap">
              Welcome to
            </Label>
            <img
              src={fullLogo}
              alt="Proxxied Logo"
              className="h-36 mt-[1rem]"
            />
          </div>
          <Label className="text-xl text-gray-600 justify-center">
            Enter a decklist to the left or Upload Files to get started
          </Label>
        </div>
      ) : null}

      <div ref={pageRef} className="flex flex-col gap-[1rem]">
        {contextMenu.visible && contextMenu.cardIndex !== null && (
          <div
            className="absolute bg-white border border-gray-300 rounded shadow-md z-50 text-sm space-y-1"
            style={{
              top: contextMenu.y,
              left: contextMenu.x,
              padding: "0.25rem",
            }}
            onMouseLeave={() =>
              setContextMenu({ ...contextMenu, visible: false })
            }
          >
            <Button
              className="bg-gray-400 hover:bg-gray-500 w-full"
              onClick={() => {
                duplicateCard(contextMenu.cardIndex!);
                setContextMenu({ ...contextMenu, visible: false });
              }}
            >
              Duplicate
            </Button>
            <Button
              className="bg-red-700 hover:bg-red-800 w-full"
              onClick={() => {
                deleteCard(contextMenu.cardIndex!);
                setContextMenu({ ...contextMenu, visible: false });
              }}
            >
              Delete
            </Button>
          </div>
        )}

        <DndContext
          sensors={useSensors(useSensor(PointerSensor))}
          collisionDetection={closestCenter}
          onDragEnd={({ active, over }) => {
            if (over && active.id !== over.id) {
              const oldIndex = cards.findIndex((c) => c.uuid === active.id);
              const newIndex = cards.findIndex((c) => c.uuid === over.id);
              if (oldIndex === -1 || newIndex === -1) return;

              const updatedCards = arrayMove(cards, oldIndex, newIndex);
              setCards(updatedCards);

              setSelectedImages(
                reorderImageMap(cards, oldIndex, newIndex, selectedImages)
              );
              setOriginalSelectedImages(
                reorderImageMap(
                  cards,
                  oldIndex,
                  newIndex,
                  originalSelectedImages
                )
              );
            }
          }}
        >
          <SortableContext
            items={cards.map((card) => card.uuid)}
            strategy={rectSortingStrategy}
          >
            {chunkCards(cards, pageCapacity).map((page, pageIndex) => (
              <div
                key={pageIndex}
                className="proxy-page relative bg-white dark:bg-gray-700"
                style={{
                  zoom: zoom,
                  width: `${pageWidthIn}in`,
                  height: `${pageHeightIn}in`,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                  breakAfter: "page",
                  flexShrink: 0,
                  padding: 0,
                  margin: 0,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${columns}, ${totalCardWidth}mm)`,
                    gridTemplateRows: `repeat(${rows}, ${totalCardHeight}mm)`,
                    width: `${gridWidthMm}mm`,
                    height: `${gridHeightMm}mm`,
                    gap: 0,
                  }}
                >
                  {page.map((card, index) => {
                    const globalIndex = pageIndex * 9 + index;
                    const img = selectedImages[card.uuid];
                    const noImages =
                      !img &&
                      !originalSelectedImages[card.uuid] &&
                      !(card.imageUrls && card.imageUrls.length);

                    if (noImages) {
                      return (
                        <div
                          key={globalIndex}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({
                              visible: true,
                              x: e.clientX,
                              y: e.clientY,
                              cardIndex: globalIndex,
                            });
                          }}
                          onClick={() => {
                            setModalCard(card);
                            setModalIndex(globalIndex);
                            setIsModalOpen(true);
                          }}
                          className="flex items-center justify-center border-2 border-dashed border-red-500 bg-gray-50 text-center p-2 select-none"
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
                              not found
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <CardCellLazy
                        key={globalIndex}
                        card={card}
                        state={loadingMap[card.uuid] ?? "idle"}
                        hasImage={!!selectedImages[card.uuid]}
                        ensureProcessed={ensureProcessed}
                      >
                        <SortableCard
                          key={globalIndex}
                          card={card}
                          index={index}
                          globalIndex={globalIndex}
                          imageSrc={img}
                          totalCardWidth={totalCardWidth}
                          totalCardHeight={totalCardHeight}
                          guideOffset={guideOffset}
                          setContextMenu={setContextMenu}
                          setModalCard={setModalCard}
                          setModalIndex={setModalIndex}
                          setIsModalOpen={setIsModalOpen}
                        />
                      </CardCellLazy>
                    );
                  })}
                </div>
                {bleedEdge && (
                  <EdgeCutLines
                    pageWidthIn={pageWidthIn}
                    pageHeightIn={pageHeightIn}
                    cols={columns}
                    rows={rows}
                    totalCardWidthMm={totalCardWidth}
                    totalCardHeightMm={totalCardHeight}
                    baseCardWidthMm={baseCardWidthMm}
                    baseCardHeightMm={baseCardHeightMm}
                    bleedEdgeWidthMm={bleedEdgeWidth}
                    guideWidthPx={guideWidth}
                  />
                )}
              </div>
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
