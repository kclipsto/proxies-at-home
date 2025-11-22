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
import { useLiveQuery } from "dexie-react-hooks";
import { Button, Label } from "flowbite-react";
import { Copy, Trash } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import fullLogo from "../assets/fullLogo.png";
import CardCellLazy from "../components/CardCellLazy";
import EdgeCutLines from "../components/FullPageGuides";
import SortableCard from "../components/SortableCard";
import { db } from "../db"; // Import the Dexie database instance
import { deleteCard, duplicateCard } from "../helpers/dbUtils";
import { getBleedInPixels } from "../helpers/ImageHelper";
import { useImageProcessing } from "../hooks/useImageProcessing";
import { useArtworkModalStore, useSettingsStore } from "../store";
import { ArtworkModal } from "./ArtworkModal";

const unit = "mm";
const baseCardWidthMm = 63;
const baseCardHeightMm = 88;

type PageViewProps = {
  loadingMap: ReturnType<typeof useImageProcessing>["loadingMap"];
  ensureProcessed: ReturnType<typeof useImageProcessing>["ensureProcessed"];
};

export function PageView({ loadingMap, ensureProcessed }: PageViewProps) {
  const pageSizeUnit = useSettingsStore((state) => state.pageSizeUnit);
  const pageWidth = useSettingsStore((state) => state.pageWidth);
  const pageHeight = useSettingsStore((state) => state.pageHeight);
  const columns = useSettingsStore((state) => state.columns);
  const rows = useSettingsStore((state) => state.rows);
  const bleedEdgeWidth = useSettingsStore((state) => state.bleedEdgeWidth);

  const zoom = useSettingsStore((state) => state.zoom);

  const pageRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(useSensor(PointerSensor));

  const cards = useLiveQuery(() => db.cards.orderBy("order").toArray(), []);
  const images = useLiveQuery(() => db.images.toArray(), []);

  const urlCacheRef = useRef<Map<string, { blob: Blob; url: string }>>(new Map());

  const processedImageUrls: Record<string, string> = useMemo(() => {
    const urls: Record<string, string> = {};
    if (!images) return urls;

    const currentCache = urlCacheRef.current;
    const usedIds = new Set<string>();

    images.forEach((img) => {
      if (img.displayBlob && img.displayBlob.size > 0) {
        usedIds.add(img.id);

        // Check if we already have a URL for this exact blob
        const cached = currentCache.get(img.id);
        if (cached && cached.blob === img.displayBlob) {
          urls[img.id] = cached.url;
        } else {
          // Revoke old URL if it exists
          if (cached) {
            URL.revokeObjectURL(cached.url);
          }
          // Create new URL
          const newUrl = URL.createObjectURL(img.displayBlob);
          urls[img.id] = newUrl;
          currentCache.set(img.id, { blob: img.displayBlob, url: newUrl });
        }
      }
    });

    // Clean up URLs for images that no longer exist or don't have blobs
    for (const [id, cached] of currentCache.entries()) {
      if (!usedIds.has(id)) {
        URL.revokeObjectURL(cached.url);
        currentCache.delete(id);
      }
    }

    return urls;
  }, [images]);

  // Cleanup on unmount
  useEffect(() => {
    const cache = urlCacheRef.current;
    return () => {
      for (const cached of cache.values()) {
        URL.revokeObjectURL(cached.url);
      }
      cache.clear();
    };
  }, []);

  const openArtworkModal = useArtworkModalStore((state) => state.openModal);

  const bleedPixels = getBleedInPixels(bleedEdgeWidth, unit);
  const guideOffset = `${(bleedPixels * (25.4 / 300)).toFixed(3)}mm`;
  const totalCardWidth = baseCardWidthMm + bleedEdgeWidth * 2;
  const totalCardHeight = baseCardHeightMm + bleedEdgeWidth * 2;
  const pageCapacity = columns * rows;
  const cardSpacingMm = useSettingsStore((state) => state.cardSpacingMm);

  const gridWidthMm =
    totalCardWidth * columns + Math.max(0, columns - 1) * cardSpacingMm;
  const gridHeightMm =
    totalCardHeight * rows + Math.max(0, rows - 1) * cardSpacingMm;

  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    cardUuid: null as string | null,
  });

  const rebalanceOrders = useCallback(async () => {
    const sortedCards = await db.cards.orderBy("order").toArray();
    const rebalancedCards = sortedCards.map((card, index) => ({
      ...card,
      order: index + 1,
    }));
    await db.cards.bulkPut(rebalancedCards);
  }, []);

  useEffect(() => {
    const handler = () =>
      setContextMenu((prev) => ({ ...prev, visible: false }));
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  function chunkCards<T>(cards: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < cards.length; i += size) {
      chunks.push(cards.slice(i, i + size));
    }
    return chunks;
  }

  useEffect(() => {
    return () => {
      Object.values(processedImageUrls).forEach(URL.revokeObjectURL);
    };
  }, [processedImageUrls]);

  return (
    <div className="w-1/2 flex-1 overflow-y-auto bg-gray-200 h-full p-6 flex justify-center dark:bg-gray-800 ">
      {(!cards || cards.length === 0) ? (
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
      ) : (

        <div ref={pageRef} className="flex flex-col gap-[1rem]">
          {contextMenu.visible && contextMenu.cardUuid && (
            <div
              className="absolute bg-white border rounded-xl border-gray-300 shadow-md z-50 text-sm flex flex-col gap-1"
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
                size="xs"
                onClick={async () => {
                  await duplicateCard(contextMenu.cardUuid!);
                  setContextMenu({ ...contextMenu, visible: false });
                }}
              >
                <Copy className="size-3 mr-1" />
                Duplicate
              </Button>
              <Button
                size="xs"
                color="red"
                onClick={async () => {
                  await deleteCard(contextMenu.cardUuid!);
                  setContextMenu({ ...contextMenu, visible: false });
                }}
              >
                <Trash className="size-3 mr-1" />
                Delete
              </Button>
            </div>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter} onDragEnd={async ({ active, over }) => {
              if (!cards || !over || active.id === over.id) return;

              const oldIndex = cards.findIndex((c) => c.uuid === active.id);
              const newIndex = cards.findIndex((c) => c.uuid === over.id);
              if (oldIndex === -1 || newIndex === -1) return;

              const reorderedCards = arrayMove(cards, oldIndex, newIndex);

              const prevCard = reorderedCards[newIndex - 1];
              const nextCard = reorderedCards[newIndex + 1];

              let newOrder: number;

              if (!prevCard) {
                newOrder = (nextCard?.order || 0) - 1;
              } else if (!nextCard) {
                newOrder = prevCard.order + 1;
              } else {
                newOrder = (prevCard.order + nextCard.order) / 2.0;
              }

              if (newOrder === prevCard?.order || newOrder === nextCard?.order) {
                console.warn(
                  "Floating point precision limit reached. Triggering order re-balance."
                );
                await rebalanceOrders();
                return;
              }

              await db.cards.update(active.id as string, { order: newOrder });
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
                    width: `${pageWidth}${pageSizeUnit}`,
                    height: `${pageHeight}${pageSizeUnit}`,
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
                      gap: `${cardSpacingMm}mm`,
                    }}
                  >
                    {page.map((card, index) => {
                      const globalIndex = pageIndex * pageCapacity + index;

                      // If the card has no imageId, it's permanently not found.
                      if (!card.imageId) {
                        return (
                          <div
                            key={globalIndex}
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
                                Image not available
                              </div>
                            </div>
                          </div>
                        );
                      }

                      const processedBlobUrl = processedImageUrls[card.imageId];

                      return (
                        <CardCellLazy
                          key={globalIndex}
                          card={card}
                          state={loadingMap[card.uuid] ?? "idle"}
                          hasImage={!!processedBlobUrl}
                          ensureProcessed={ensureProcessed}
                        >
                          <SortableCard
                            key={globalIndex}
                            card={card}
                            index={index}
                            globalIndex={globalIndex}
                            imageSrc={processedBlobUrl!}
                            totalCardWidth={totalCardWidth}
                            totalCardHeight={totalCardHeight}
                            guideOffset={guideOffset}
                            setContextMenu={setContextMenu}
                          />
                        </CardCellLazy>
                      );
                    })}
                  </div>

                  <EdgeCutLines
                    totalCardWidthMm={totalCardWidth}
                    totalCardHeightMm={totalCardHeight}
                    baseCardWidthMm={baseCardWidthMm}
                    baseCardHeightMm={baseCardHeightMm}
                    bleedEdgeWidthMm={bleedEdgeWidth}
                  />
                </div>
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      <ArtworkModal />
    </div>
  );
}