import { Button } from "flowbite-react";
import { Copy, Trash, Settings } from "lucide-react";
import { useEffect } from "react";
import { useSelectionStore } from "../../store/selection";
import { undoableDeleteCard, undoableDuplicateCard } from "@/helpers/undoableActions";
import { useArtworkModalStore } from "../../store";
import type { CardOption } from "../../../../shared/types";

interface PageViewContextMenuProps {
    contextMenu: {
        visible: boolean;
        x: number;
        y: number;
        cardUuid: string | null;
    };
    setContextMenu: (menu: { visible: boolean; x: number; y: number; cardUuid: string | null }) => void;
    cards: CardOption[];
}

export function PageViewContextMenu({ contextMenu, setContextMenu, cards }: PageViewContextMenuProps) {
    const selectedCards = useSelectionStore((state) => state.selectedCards);
    const clearSelection = useSelectionStore((state) => state.clearSelection);
    const openArtworkModal = useArtworkModalStore((state) => state.openModal);
    const hasSelection = selectedCards.size > 0;

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
            {/* Show selection controls when multiple cards are selected */}
            {hasSelection && selectedCards.has(contextMenu.cardUuid) && (
                <>
                    <Button
                        size="xs"
                        onClick={async () => {
                            const uuids = Array.from(selectedCards);
                            for (const uuid of uuids) {
                                await undoableDuplicateCard(uuid);
                            }
                            clearSelection();
                            setContextMenu({ ...contextMenu, visible: false });
                        }}
                    >
                        <Copy className="size-3 mr-1" />
                        Duplicate {selectedCards.size} Selected
                    </Button>
                    <Button
                        size="xs"
                        onClick={() => {
                            const card = cards?.find(c => c.uuid === contextMenu.cardUuid);
                            if (card) {
                                openArtworkModal({ card, index: null, initialTab: 'settings' });
                            }
                            setContextMenu({ ...contextMenu, visible: false });
                        }}
                    >
                        <Settings className="size-3 mr-1" />
                        Settings {selectedCards.size} Selected
                    </Button>
                    <Button
                        size="xs"
                        color="red"
                        onClick={async () => {
                            const uuids = Array.from(selectedCards);
                            for (const uuid of uuids) {
                                await undoableDeleteCard(uuid);
                            }
                            clearSelection();
                            setContextMenu({ ...contextMenu, visible: false });
                        }}
                    >
                        <Trash className="size-3 mr-1" />
                        Delete {selectedCards.size} Selected
                    </Button>
                </>
            )}
            {/* Single card operations */}
            {(!hasSelection || !selectedCards.has(contextMenu.cardUuid)) && (
                <>
                    <Button
                        size="xs"
                        onClick={async () => {
                            await undoableDuplicateCard(contextMenu.cardUuid!);
                            setContextMenu({ ...contextMenu, visible: false });
                        }}
                    >
                        <Copy className="size-3 mr-1" />
                        Duplicate
                    </Button>
                    <Button
                        size="xs"
                        onClick={() => {
                            const card = cards?.find(c => c.uuid === contextMenu.cardUuid);
                            if (card) {
                                openArtworkModal({ card, index: null, initialTab: 'settings' });
                            }
                            setContextMenu({ ...contextMenu, visible: false });
                        }}
                    >
                        <Settings className="size-3 mr-1" />
                        Settings
                    </Button>
                    <Button
                        size="xs"
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
