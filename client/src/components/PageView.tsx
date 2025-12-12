import {
  DndContext,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { Label } from "flowbite-react";
import { useState, useMemo } from "react";
import fullLogo from "../assets/fullLogo.png";
import CardCellLazy from "../components/CardCellLazy";
import EdgeCutLines from "../components/FullPageGuides";
import SortableCard from "../components/SortableCard";
import { type Image } from "../db";
import type { CardOption } from "../../../shared/types";
import type { useImageProcessing } from "../hooks/useImageProcessing";
import { useArtworkModalStore } from "../store";
import { ArtworkModal } from "./ArtworkModal";
import { PullToRefresh } from "./PullToRefresh";
import {
  baseCardWidthMm,
  baseCardHeightMm,
  computeCardLayouts
} from "../helpers/layout";
import { useImageCache } from "../hooks/useImageCache";
import { usePageViewSettings } from "../hooks/usePageViewSettings";
import { usePageViewZoom } from "../hooks/usePageViewZoom";
import { useCardDragAndDrop } from "../hooks/useCardDragAndDrop";
import { usePageViewHotkeys } from "../hooks/usePageViewHotkeys";
import { PageViewContextMenu } from "./PageComponents/PageViewContextMenu";
import { PageViewSelectionBar } from "./PageComponents/PageViewSelectionBar";
import { PageViewFloatingControls } from "./PageComponents/PageViewFloatingControls";
import { PageViewDragOverlay } from "./PageComponents/PageViewDragOverlay";
import { useFilteredAndSortedCards } from "../hooks/useFilteredAndSortedCards";

type PageViewProps = {
  loadingMap: ReturnType<typeof useImageProcessing>["loadingMap"];
  ensureProcessed: ReturnType<typeof useImageProcessing>["ensureProcessed"];
  images: Image[];
  cards: CardOption[];
  mobile?: boolean;
  active?: boolean;
};

function chunkCards<T>(cards: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < cards.length; i += size) {
    chunks.push(cards.slice(i, i + size));
  }
  return chunks;
}

export function PageView({ loadingMap, ensureProcessed, cards, images, mobile, active = true }: PageViewProps) {
  const {
    pageSizeUnit,
    pageWidth,
    pageHeight,
    columns,
    rows,
    zoom,
    setZoom,
    darkenNearBlack,
    cardPositionX,
    cardPositionY,
    sourceSettings,
    effectiveBleedWidth,
    dndDisabled,
    cardSpacingMm,
  } = usePageViewSettings();

  const { processedImageUrls } = useImageCache(images, darkenNearBlack);
  const openArtworkModal = useArtworkModalStore((state) => state.openModal);
  const pageCapacity = columns * rows;

  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    cardUuid: null as string | null,
  });

  const {
    sensors,
    localCards,
    activeId,
    droppedId,
    multiDragState,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    closestCenter,
  } = useCardDragAndDrop({ cards, sourceSettings, effectiveBleedWidth });

  const {
    scrollContainerRef,
    isPinching,
    updateCenterOffset,
  } = usePageViewZoom({
    zoom,
    setZoom,
    mobile,
    active,
    pageWidth,
    pageHeight,
  });

  const { filteredAndSortedCards } = useFilteredAndSortedCards(localCards);
  const allCardUuids = useMemo(() => filteredAndSortedCards.map(c => c.uuid), [filteredAndSortedCards]);

  usePageViewHotkeys(allCardUuids, active);

  const mobileZoomFactor = 0.4;

  return (
    <div className="w-full h-full relative flex flex-col overflow-hidden">
      <PullToRefresh
        ref={scrollContainerRef}
        onScroll={updateCenterOffset}
        disabled={isPinching || !!activeId}
        className="w-full flex-1 overflow-y-auto bg-gray-200 h-full p-6 flex dark:bg-gray-800 relative"
        style={{ touchAction: "pan-x pan-y" }}
      >
        {(!cards || cards.length === 0) ? (
          <div className={`flex flex-col items-center mx-auto px-4 text-center ${mobile ? "my-auto" : ""}`}>
            <div className={`flex flex-col ${!mobile ? 'md:flex-row' : ''} items-center gap-2 md:gap-4`}>
              <Label className={`text-5xl ${!mobile ? 'md:text-7xl' : ''} justify-center font-bold whitespace-nowrap`}>
                Welcome to
              </Label>
              <img
                src={fullLogo}
                alt="Proxxied Logo"
                className={`h-40 ${!mobile ? 'md:h-36 md:mt-[1rem]' : ''}`}
              />
            </div>
            <Label className={`text-xl ${!mobile ? 'md:text-xl' : ''} text-gray-600 justify-center text-center mt-4`}>
              {mobile
                ? "Enter a decklist or upload files in the upload tab to get started"
                : "Enter a decklist or upload files to the left to get started"}
            </Label>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            modifiers={[]}
          >
            <div className="flex flex-col gap-[1rem] m-auto" style={{ zoom: mobile ? zoom * mobileZoomFactor : zoom }}>
              <SortableContext
                items={filteredAndSortedCards.map((card) => card.uuid)}
                strategy={rectSortingStrategy}
              >
                {chunkCards(filteredAndSortedCards, pageCapacity).map((page, pageIndex) => (
                  <div
                    key={pageIndex}
                    className="proxy-page bg-white dark:bg-gray-700"
                    style={{
                      width: `${pageWidth}${pageSizeUnit} `,
                      height: `${pageHeight}${pageSizeUnit} `,
                      breakAfter: "page",
                      flexShrink: 0,
                      padding: 0,
                      margin: 0,
                    }}
                  >
                    <div className="relative w-full h-full">
                      {(() => {
                        // Compute layouts once for this page
                        const layouts = computeCardLayouts(page, sourceSettings, effectiveBleedWidth);

                        // Initialize with base dimensions (no bleed) to allow growing only as needed
                        const startWidth = baseCardWidthMm;
                        const startHeight = baseCardHeightMm;

                        // Compute max width per column (use base for empty columns)
                        const colWidths: number[] = Array(columns).fill(startWidth);
                        layouts.forEach((layout, idx) => {
                          const col = idx % columns;
                          colWidths[col] = Math.max(colWidths[col], layout.cardWidthMm);
                        });

                        // Compute max height per row - always use full grid rows
                        const rowHeights: number[] = Array(rows).fill(startHeight);
                        layouts.forEach((layout, idx) => {
                          const row = Math.floor(idx / columns);
                          rowHeights[row] = Math.max(rowHeights[row], layout.cardHeightMm);
                        });

                        return (
                          <>
                            <EdgeCutLines
                              cardLayouts={layouts}
                              colWidths={colWidths}
                              rowHeights={rowHeights}
                              baseCardWidthMm={baseCardWidthMm}
                              baseCardHeightMm={baseCardHeightMm}
                            />
                            <div
                              style={{
                                position: "absolute",
                                left: "50%",
                                top: "50%",
                                transform: `translate(calc(-50% + ${cardPositionX}mm), calc(-50% + ${cardPositionY}mm))`,
                                display: "grid",
                                gridTemplateColumns: colWidths.map(w => `${w}mm`).join(' '),
                                gridTemplateRows: rowHeights.map(h => `${h}mm`).join(' '),
                                gap: `${cardSpacingMm}mm`,
                              }}
                            >
                              {page.map((card, index) => {
                                const globalIndex = pageIndex * pageCapacity + index;
                                const layout = layouts[index];

                                // If the card has no imageId, it's permanently not found.
                                if (!card.imageId) {
                                  return (
                                    <div
                                      key={globalIndex}
                                      className="flex items-center justify-center"
                                      style={{
                                        width: `${layout.cardWidthMm}mm`,
                                        height: `${layout.cardHeightMm}mm`,
                                        justifySelf: 'center',
                                        alignSelf: 'center',
                                      }}
                                    >
                                      <div
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
                                        className="flex items-center justify-center border-2 border-dashed border-red-500 bg-gray-50 text-center p-2 select-none w-full h-full"
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
                                    </div>
                                  );
                                }

                                const processedBlobUrl = processedImageUrls[card.imageId];

                                return (
                                  <div
                                    key={card.uuid}
                                    style={{
                                      justifySelf: 'center',
                                      alignSelf: 'center',
                                    }}
                                  >
                                    <CardCellLazy
                                      card={card}
                                      state={loadingMap[card.uuid] ?? "idle"}
                                      hasImage={!!processedBlobUrl}
                                      ensureProcessed={ensureProcessed}
                                    >
                                      <SortableCard
                                        card={card}
                                        index={index}
                                        globalIndex={globalIndex}
                                        imageSrc={processedBlobUrl!}
                                        totalCardWidth={layout.cardWidthMm}
                                        totalCardHeight={layout.cardHeightMm}
                                        guideOffset={`${layout.bleedMm}mm`}
                                        imageBleedWidth={layout.bleedMm}
                                        allCardUuids={allCardUuids}
                                        setContextMenu={setContextMenu}
                                        disabled={dndDisabled}
                                        mobile={mobile}
                                        scale={mobile ? zoom * mobileZoomFactor : zoom}
                                        dropped={droppedId === card.uuid}
                                      />
                                    </CardCellLazy>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ))}

              </SortableContext>
            </div>
            <PageViewDragOverlay
              droppedId={droppedId}
              activeId={activeId}
              multiDragState={multiDragState}
              localCards={localCards}
              sourceSettings={sourceSettings}
              effectiveBleedWidth={effectiveBleedWidth}
              processedImageUrls={processedImageUrls}
              mobile={mobile}
              setContextMenu={setContextMenu}
            />
          </DndContext>
        )}
      </PullToRefresh>

      <PageViewContextMenu
        contextMenu={contextMenu}
        setContextMenu={setContextMenu}
        cards={cards}
      />

      <PageViewSelectionBar cards={cards} />

      <PageViewFloatingControls mobile={mobile} hasCards={!!cards && cards.length > 0} />

      <ArtworkModal />
    </div >
  );
}