import { DragOverlay } from "@dnd-kit/core";
import { CardView } from "../SortableCard";
import { baseCardWidthMm, baseCardHeightMm, getCardTargetBleed, type SourceTypeSettings } from "../../helpers/layout";
import type { CardOption } from "../../../../shared/types";
import type { MutableRefObject } from "react";

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
    sourceSettings: SourceTypeSettings;
    effectiveBleedWidth: number;
    processedImageUrls: Record<string, string>;
    mobile?: boolean;
    setContextMenu: (menu: ContextMenuState) => void;
}

export function PageViewDragOverlay({
    droppedId,
    activeId,
    multiDragState,
    localCards,
    sourceSettings,
    effectiveBleedWidth,
    processedImageUrls,
    mobile,
    setContextMenu,
}: PageViewDragOverlayProps) {
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
                                // Compute per-card bleed
                                const bleedMm = getCardTargetBleed(card, sourceSettings, effectiveBleedWidth);
                                const cardWidthMm = baseCardWidthMm + bleedMm * 2;
                                const cardHeightMm = baseCardHeightMm + bleedMm * 2;
                                const processedUrl = processedImageUrls[card.imageId!] || "";

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
                                            card={card}
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
                // Compute per-card bleed for the dragged card using source settings
                const bleedMm = getCardTargetBleed(card, sourceSettings, effectiveBleedWidth);
                const cardWidthMm = baseCardWidthMm + bleedMm * 2;
                const cardHeightMm = baseCardHeightMm + bleedMm * 2;

                return (
                    <CardView
                        card={card}
                        index={0} // Index doesn't matter for overlay
                        globalIndex={0} // Global index doesn't matter for overlay
                        imageSrc={processedImageUrls[card.imageId!] || ""}
                        totalCardWidth={cardWidthMm}
                        totalCardHeight={cardHeightMm}
                        guideOffset={`${bleedMm}mm`}
                        imageBleedWidth={bleedMm}
                        setContextMenu={setContextMenu}
                        disabled={true} // Disable interactions on overlay
                        mobile={mobile}
                        style={{
                            // The modifier handles centering
                            transformOrigin: 'center',
                        }}
                        isOverlay={true}
                    />
                );
            })() : null)}
        </DragOverlay>
    );
}
