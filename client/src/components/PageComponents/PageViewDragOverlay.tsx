import { DragOverlay } from "@dnd-kit/core";
import { CardView } from "../SortableCard";
import { baseCardWidthMm, baseCardHeightMm, getCardTargetBleed, type SourceTypeSettings } from "../../helpers/layout";
import type { CardOption } from "../../../../shared/types";
import type { MutableRefObject } from "react";
import { useSelectionStore } from "../../store/selection";

interface ContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    cardUuid: string | null;
}

interface PageViewDragOverlayProps {
    droppedId: string | null;
    activeId: string | null;
    multiDragState: MutableRefObject<{
        isMultiDrag: boolean;
        draggedCards: CardOption[];
        originalLocalCards: CardOption[];
        activeId: string | null;
        ghostIds: Set<string>;
    }>;
    localCards: CardOption[];
    backCardMap: Map<string, CardOption>;
    sourceSettings: SourceTypeSettings;
    effectiveBleedWidth: number;
    processedImageUrls: Record<string, string>;
    mobile?: boolean;
    scale?: number;
    setContextMenu: (menu: ContextMenuState) => void;
}

export function PageViewDragOverlay({
    droppedId,
    activeId,
    multiDragState,
    localCards,
    backCardMap,
    sourceSettings,
    effectiveBleedWidth,
    processedImageUrls,
    mobile,
    scale = 1,
    setContextMenu,
}: PageViewDragOverlayProps) {
    // Subscribe directly to flippedCards to avoid triggering parent re-renders
    const flippedCards = useSelectionStore((state) => state.flippedCards);
    return (
        <DragOverlay zIndex={40}>
            {droppedId ? null : (activeId ? (() => {
                if (multiDragState.current.isMultiDrag) {
                    // Render Stack
                    const stackCards = multiDragState.current.draggedCards;
                    const count = stackCards.length;

                    // Reorder to put leader on top for visualization
                    const leaderId = multiDragState.current.activeId;
                    const leaderIndex = stackCards.findIndex(c => c.uuid === leaderId);

                    let sortedStack = stackCards;
                    if (leaderIndex !== -1) {
                        const leader = stackCards[leaderIndex];
                        const others = stackCards.filter(c => c.uuid !== leaderId);
                        sortedStack = [leader, ...others];
                    }

                    // Show up to 3 cards
                    const previewCards = sortedStack.slice(0, 3);

                    return (
                        <div className="relative">
                            {previewCards.map((card, i) => {
                                // Check if card is flipped - if so, use back card for image and bleed
                                const isCardFlipped = flippedCards.has(card.uuid);
                                const backCard = backCardMap.get(card.uuid);
                                const displayCard = isCardFlipped && backCard ? backCard : card;

                                // Compute per-card bleed
                                const bleedMm = getCardTargetBleed(displayCard, sourceSettings, effectiveBleedWidth);
                                const cardWidthMm = baseCardWidthMm + bleedMm * 2;
                                const cardHeightMm = baseCardHeightMm + bleedMm * 2;
                                const processedUrl = processedImageUrls[displayCard.imageId!] || "";

                                return (
                                    <div
                                        key={card.uuid}
                                        className="absolute top-0 left-0 shadow-xl"
                                        style={{
                                            zIndex: 40 - i, // Top card on top
                                            transform: `translate(0px, ${i * -60}px) scale(${1 - i * 0.05})`,
                                            transformOrigin: 'bottom center',
                                        }}
                                    >
                                        <CardView
                                            card={displayCard}
                                            index={0}
                                            globalIndex={0}
                                            imageSrc={processedUrl}
                                            totalCardWidth={cardWidthMm}
                                            totalCardHeight={cardHeightMm}
                                            guideOffset={`${bleedMm}mm`}
                                            imageBleedWidth={bleedMm}
                                            setContextMenu={setContextMenu}
                                            disabled={true}
                                            mobile={mobile}
                                            style={{
                                                width: `${cardWidthMm}mm`,
                                                height: `${cardHeightMm}mm`,
                                                transform: `scale(${scale})`,
                                                transformOrigin: 'top left',
                                            }}
                                            isOverlay={true}
                                        />
                                        {/* Badge for total count if > 1, show on top card */}
                                        {i === 0 && count > 1 && (
                                            <div className="absolute -top-2 -right-2 bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold border-2 border-white z-50">
                                                {count}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    );
                }

                const card = localCards.find(c => c.uuid === activeId)!;
                if (!card) return null;

                // Check if card is flipped - if so, use back card for image and bleed
                const isFlipped = flippedCards.has(card.uuid);
                const backCard = backCardMap.get(card.uuid);
                const displayCard = isFlipped && backCard ? backCard : card;

                // Use the same bleed calculation as computeCardLayouts - getCardTargetBleed handles all cases
                const bleedMm = getCardTargetBleed(displayCard, sourceSettings, effectiveBleedWidth);
                const cardWidthMm = baseCardWidthMm + bleedMm * 2;
                const cardHeightMm = baseCardHeightMm + bleedMm * 2;

                const imageUrl = processedImageUrls[displayCard.imageId!] || "";

                // Use CardView with CSS filters for per-card adjustments (simpler than PixiJS, avoids WebGL context)
                return (
                    <CardView
                        card={displayCard}
                        index={0}
                        globalIndex={0}
                        imageSrc={imageUrl}
                        totalCardWidth={cardWidthMm}
                        totalCardHeight={cardHeightMm}
                        guideOffset={`${bleedMm}mm`}
                        imageBleedWidth={bleedMm}
                        setContextMenu={setContextMenu}
                        disabled={true}
                        mobile={mobile}
                        style={{
                            width: `${cardWidthMm}mm`,
                            height: `${cardHeightMm}mm`,
                            transform: `scale(${scale})`,
                            transformOrigin: 'top left',
                        }}
                        isOverlay={true}
                    />
                );
            })() : null)}
        </DragOverlay>
    );
}
