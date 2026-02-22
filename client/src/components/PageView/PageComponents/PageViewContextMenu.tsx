import { Button } from "flowbite-react";
import { Copy, Trash, Settings, Palette } from "lucide-react";
import { useEffect } from "react";
import { useSelectionStore } from "@/store/selection";
import { undoableDeleteCard, undoableDeleteCardsBatch, undoableDuplicateCard, undoableDuplicateCardsBatch } from "@/helpers/undoableActions";
import { useArtworkModalStore, useCardEditorModalStore, useSettingsStore } from "@/store";
import { db, type Image } from "@/db";
import type { CardOption } from "@/types";

interface PageViewContextMenuProps {
    contextMenu: {
        visible: boolean;
        x: number;
        y: number;
        cardUuid: string | null;
    };
    setContextMenu: (menu: { visible: boolean; x: number; y: number; cardUuid: string | null }) => void;
    cards: CardOption[];
    allCards: CardOption[];
    flippedCards: Set<string>;
}

/** Helper to get card with its back card and images from database */
async function getCardWithImages(allCards: CardOption[], cardUuid: string, globalDpi: number) {
    const card = allCards.find(c => c.uuid === cardUuid);
    if (!card || !card.imageId) return null;

    const image = await db.images.get(card.imageId);
    const backCard = card.linkedBackId
        ? allCards.find(c => c.uuid === card.linkedBackId)
        : undefined;

    let backImage: Image | undefined = undefined;
    if (backCard?.imageId) {
        backImage = await db.images.get(backCard.imageId);
        if (!backImage) {
            const cardback = await db.cardbacks.get(backCard.imageId);
            if (cardback) {
                backImage = {
                    id: cardback.id,
                    displayBlob: cardback.displayBlob,
                    exportBlob: cardback.exportBlob,
                    baseDisplayBlob: cardback.displayBlob,
                    baseExportBlob: cardback.exportBlob,
                    displayDpi: 300,
                    exportDpi: globalDpi,
                } as Image;
            }
        }
    }

    return { card, image: image ?? null, backCard, backImage: backImage ?? null };
}

export function PageViewContextMenu({ contextMenu, setContextMenu, cards, allCards, flippedCards }: PageViewContextMenuProps) {
    const selectedCards = useSelectionStore((state) => state.selectedCards);
    const clearSelection = useSelectionStore((state) => state.clearSelection);
    const openArtworkModal = useArtworkModalStore((state) => state.openModal);
    const openCardEditor = useCardEditorModalStore((state) => state.openModal);
    const hasSelection = selectedCards.size > 0;
    const globalDpi = useSettingsStore((state) => state.dpi);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (contextMenu.visible) {
                const menuEl = document.getElementById("mobile-context-menu");
                if (menuEl && menuEl.contains(e.target as Node)) {
                    return;
                }

                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ ...contextMenu, visible: false });
            }
        };

        if (contextMenu.visible) {
            window.addEventListener("click", handler, true);
        }

        return () => window.removeEventListener("click", handler, true);
    }, [contextMenu, setContextMenu]);

    if (!contextMenu.visible || !contextMenu.cardUuid) return null;

    return (
        <div
            id="mobile-context-menu"
            className="fixed bg-white dark:bg-gray-800 border rounded-xl border-gray-300 dark:border-gray-700 shadow-md z-50 text-sm flex flex-col gap-1"
            style={{
                top: contextMenu.y,
                left: contextMenu.x,
                padding: "0.25rem",
            }}
            onMouseLeave={() =>
                setContextMenu({ ...contextMenu, visible: false })
            }
        >
            {/* Show multi-select operations when multiple cards are selected */}
            {hasSelection && selectedCards.has(contextMenu.cardUuid) && (
                <>
                    <Button
                        size="sm"
                        color="green"
                        onClick={async () => {
                            const result = await getCardWithImages(allCards, contextMenu.cardUuid!, globalDpi);
                            if (result) {
                                openCardEditor({
                                    ...result,
                                    selectedCardUuids: Array.from(selectedCards),
                                });
                            }
                            setContextMenu({ ...contextMenu, visible: false });
                        }}
                    >
                        <Palette className="size-3 mr-1" />
                        Adjust {selectedCards.size} Cards
                    </Button>
                    <Button
                        size="sm"
                        onClick={async () => {
                            const uuids = Array.from(selectedCards);
                            await undoableDuplicateCardsBatch(uuids);
                            clearSelection();
                            setContextMenu({ ...contextMenu, visible: false });
                        }}
                    >
                        <Copy className="size-3 mr-1" />
                        Duplicate {selectedCards.size} Cards
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => {
                            const card = cards?.find(c => c.uuid === contextMenu.cardUuid);
                            if (card) {
                                openArtworkModal({ card, index: null, allCards: cards, initialTab: 'settings' });
                            }
                            setContextMenu({ ...contextMenu, visible: false });
                        }}
                    >
                        <Settings className="size-3 mr-1" />
                        {selectedCards.size} Cards Settings
                    </Button>
                    <Button
                        size="sm"
                        color="red"
                        onClick={async () => {
                            const uuids = Array.from(selectedCards);
                            await undoableDeleteCardsBatch(uuids);
                            clearSelection();
                            setContextMenu({ ...contextMenu, visible: false });
                        }}
                    >
                        <Trash className="size-3 mr-1" />
                        Delete {selectedCards.size} Cards
                    </Button>
                </>
            )}
            {/* Single card operations */}
            {(!hasSelection || !selectedCards.has(contextMenu.cardUuid)) && (
                <>
                    <Button
                        size="sm"
                        color="green"
                        onClick={async () => {
                            const result = await getCardWithImages(allCards, contextMenu.cardUuid!, globalDpi);
                            if (result) {
                                openCardEditor({
                                    ...result,
                                    initialFace: flippedCards.has(result.card.uuid) ? 'back' : 'front',
                                });
                            }
                            setContextMenu({ ...contextMenu, visible: false });
                        }}
                    >
                        <Palette className="size-3 mr-1" />
                        Adjust Art
                    </Button>
                    <Button
                        size="sm"
                        onClick={async () => {
                            await undoableDuplicateCard(contextMenu.cardUuid!);
                            setContextMenu({ ...contextMenu, visible: false });
                        }}
                    >
                        <Copy className="size-3 mr-1" />
                        Duplicate
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => {
                            const card = cards?.find(c => c.uuid === contextMenu.cardUuid);
                            if (card) {
                                openArtworkModal({ card, index: null, allCards: cards, initialTab: 'settings' });
                            }
                            setContextMenu({ ...contextMenu, visible: false });
                        }}
                    >
                        <Settings className="size-3 mr-1" />
                        Settings
                    </Button>
                    <Button
                        size="sm"
                        color="red"
                        onClick={async () => {
                            await undoableDeleteCard(contextMenu.cardUuid!);
                            setContextMenu({ ...contextMenu, visible: false });
                        }}
                    >
                        <Trash className="size-3 mr-1" />
                        Delete
                    </Button>
                </>
            )}
        </div>
    );
}
