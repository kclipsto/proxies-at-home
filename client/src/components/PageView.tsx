import {
  DndContext,
} from "@dnd-kit/core";
import { restrictToFirstScrollableAncestor } from "@dnd-kit/modifiers";
import {
  SortableContext,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { useSelectionStore } from "../store/selection";
import { Label } from "flowbite-react";
import { useState, useMemo, useRef, useCallback } from "react";
import { NotFoundCard } from "./PageComponents/NotFoundCard";
import fullLogo from "../assets/fullLogo.png";
import CardCellLazy from "../components/CardCellLazy";
import EdgeCutLines from "../components/FullPageGuides";
import { type Image } from "../db";
import type { CardOption } from "../../../shared/types";
import type { useImageProcessing } from "../hooks/useImageProcessing";
import { ArtworkModal } from "./ArtworkModal";
import { PullToRefresh } from "./PullToRefresh";
import {
  baseCardWidthMm,
  baseCardHeightMm,
  computeCardLayouts,
  computeGridDimensions
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
  getLoadingState: ReturnType<typeof useImageProcessing>["getLoadingState"];
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

export function PageView({ getLoadingState, ensureProcessed, cards, images, mobile, active = true }: PageViewProps) {
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

  // Note: Selection state is now handled directly in SortableCard and NotFoundCard components
  // to prevent PageView re-renders on selection changes

  // Filter out back cards (linkedFrontId set) - they're shown via the flip button
  const visibleCards = useMemo(() =>
    filteredAndSortedCards.filter(c => !c.linkedFrontId),
    [filteredAndSortedCards]
  );

  // Create a map from front card UUID to back card for quick lookup
  const backCardMap = useMemo(() => {
    const map = new Map<string, typeof filteredAndSortedCards[0]>();
    for (const card of filteredAndSortedCards) {
      if (card.linkedFrontId) {
        map.set(card.linkedFrontId, card);
      }
    }
    return map;
  }, [filteredAndSortedCards]);

  // Create a stable callback for range selection that doesn't trigger re-renders
  // We use a ref to access the latest allCardUuids without making the callback dependent on it
  const allCardUuidsRef = useRef<string[]>([]);
  allCardUuidsRef.current = useMemo(() => visibleCards.map(c => c.uuid), [visibleCards]);

  // Stable identity for hotkeys hook
  const allCardUuids = allCardUuidsRef.current;

  // Memoize the callback itself with NO dependencies so props don't change
  const handleRangeSelect = useCallback((index: number) => {
    const currentUuids = allCardUuidsRef.current;
    if (currentUuids && currentUuids.length > 0) {
      useSelectionStore.getState().selectRange(currentUuids, index);
    }
  }, []);

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
            modifiers={[restrictToFirstScrollableAncestor]}
          >
            <div className="flex flex-col gap-[1rem] m-auto" style={{ zoom: mobile ? zoom * mobileZoomFactor : zoom }}>
              <SortableContext
                items={filteredAndSortedCards.map((card) => card.uuid)}
                strategy={rectSortingStrategy}
              >
                {chunkCards(visibleCards, pageCapacity).map((page, pageIndex) => (
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

                        const { colWidthsMm: colWidths, rowHeightsMm: rowHeights } = computeGridDimensions(layouts, columns, rows);

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
                                    <NotFoundCard
                                      key={globalIndex}
                                      card={card}
                                      globalIndex={globalIndex}
                                      onRangeSelect={handleRangeSelect}
                                      cardWidthMm={layout.cardWidthMm}
                                      cardHeightMm={layout.cardHeightMm}
                                      setContextMenu={setContextMenu}
                                    />
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
                                      backCard={backCardMap.get(card.uuid)}
                                      state={getLoadingState(card.imageId)}
                                      hasImage={!!processedBlobUrl}
                                      ensureProcessed={ensureProcessed}
                                      index={index}
                                      globalIndex={globalIndex}
                                      imageSrc={processedBlobUrl!}
                                      backImageSrc={backCardMap.get(card.uuid)?.imageId ? processedImageUrls[backCardMap.get(card.uuid)!.imageId!] : undefined}
                                      backImageId={backCardMap.get(card.uuid)?.imageId}
                                      totalCardWidth={layout.cardWidthMm}
                                      totalCardHeight={layout.cardHeightMm}
                                      guideOffset={`${layout.bleedMm}mm`}
                                      imageBleedWidth={layout.bleedMm}
                                      onRangeSelect={handleRangeSelect}
                                      setContextMenu={setContextMenu}
                                      disabled={dndDisabled}
                                      mobile={!!mobile}
                                      scale={mobile ? zoom * mobileZoomFactor : zoom}
                                      dropped={droppedId === card.uuid}
                                    />
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
              backCardMap={backCardMap}
              sourceSettings={sourceSettings}
              effectiveBleedWidth={effectiveBleedWidth}
              processedImageUrls={processedImageUrls}
              mobile={mobile}
              scale={mobile ? zoom * mobileZoomFactor : zoom}
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