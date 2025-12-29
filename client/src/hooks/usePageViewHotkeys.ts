import { useEffect, useRef } from "react";
import { useUndoRedoStore } from "../store/undoRedo";
import { useSelectionStore } from "../store/selection";
import { undoableDeleteCardsBatch, undoableDuplicateCardsBatch } from "../helpers/undoableActions";
import { useKeyboardShortcutsStore } from "../store/keyboardShortcuts";
import { useToastStore } from "../store/toast";
import { db } from "../db";

/**
 * Copy selected card names to clipboard in decklist format (quantity + name)
 * Cards are grouped by name and formatted as "2 Card Name" etc.
 * Returns the number of cards copied.
 */
async function copySelectedCardNames(uuids: string[]): Promise<number> {
    if (uuids.length === 0) return 0;

    try {
        // Fetch cards from database
        const cards = await db.cards.bulkGet(uuids);
        const validCards = cards.filter((c): c is NonNullable<typeof c> => c != null);

        // Filter out default cardbacks (cards with usesDefaultCardback: true)
        // But keep custom back cards (like Forest with Swamp on back)
        const cardsToExport = validCards.filter(c => !c.usesDefaultCardback);

        if (cardsToExport.length === 0) return 0;

        // Group cards by name+set+number and count
        // Key format: "name|set|number" to ensure unique grouping
        const cardGroups = new Map<string, { name: string; set?: string; number?: string; count: number }>();
        for (const card of cardsToExport) {
            const name = card.name || 'Unknown';
            const set = card.set?.toLowerCase();
            const number = card.number;
            const key = `${name}|${set || ''}|${number || ''}`;

            const existing = cardGroups.get(key);
            if (existing) {
                existing.count++;
            } else {
                cardGroups.set(key, { name, set, number, count: 1 });
            }
        }

        // Format as decklist: "1x Card Name (set) number"
        const lines: string[] = [];
        for (const group of cardGroups.values()) {
            let line = `${group.count}x ${group.name}`;
            if (group.set && group.number) {
                line += ` (${group.set}) ${group.number}`;
            } else if (group.set) {
                line += ` (${group.set})`;
            } else if (group.number) {
                line += ` ${group.number}`;
            }
            lines.push(line);
        }

        // Copy to clipboard
        const text = lines.join('\n');
        await navigator.clipboard.writeText(text);

        // Show success toast
        const cardCount = cardsToExport.length;
        useToastStore.getState().showCopyToast(`Copied ${cardCount} card${cardCount !== 1 ? 's' : ''}`);

        return cardCount;
    } catch (err) {
        console.error('Failed to copy card names to clipboard:', err);
        return 0;
    }
}
export function usePageViewHotkeys(allCardUuids: string[], active: boolean = true) {
    const uuidsRef = useRef(allCardUuids);

    useEffect(() => {
        uuidsRef.current = allCardUuids;
    }, [allCardUuids]);

    useEffect(() => {
        if (!active) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
                return;
            }
            // Escape key clears selection (no modifier needed)
            if (e.key === "Escape") {
                const { selectedCards, clearSelection } = useSelectionStore.getState();
                if (selectedCards.size > 0) {
                    e.preventDefault();
                    clearSelection();
                }
                return;
            }

            // F key flips selected cards (no modifier needed)
            if (e.key.toLowerCase() === "f" && !e.metaKey && !e.ctrlKey) {
                const { selectedCards, toggleFlip } = useSelectionStore.getState();
                if (selectedCards.size > 0) {
                    e.preventDefault();
                    // toggleFlip already handles multi-select internally
                    // Just call it once with the first selected card
                    const firstUuid = selectedCards.values().next().value;
                    if (firstUuid) {
                        toggleFlip(firstUuid);
                    }
                }
                return;
            }

            // Use Cmd on macOS, Ctrl on Windows/Linux
            const isMac = navigator.platform.toUpperCase().includes('MAC');
            const modifierActive = isMac ? e.metaKey : e.ctrlKey;

            if (modifierActive) {
                switch (e.key.toLowerCase()) {
                    case "z":
                        if (e.shiftKey) {
                            // Redo
                            e.preventDefault();
                            void useUndoRedoStore.getState().redo();
                        } else {
                            // Undo
                            e.preventDefault();
                            void useUndoRedoStore.getState().undo();
                        }
                        break;
                    case "a":
                        // Select All
                        e.preventDefault();
                        useSelectionStore.getState().selectAll(uuidsRef.current);
                        break;
                    case "d": {
                        // Duplicate selected cards as a batch (single undo action)
                        e.preventDefault();
                        const { selectedCards: cardsTodup } = useSelectionStore.getState();
                        if (cardsTodup.size > 0) {
                            void undoableDuplicateCardsBatch(Array.from(cardsTodup));
                        }
                        break;
                    }
                    case "c": {
                        // Copy selected card names to clipboard
                        e.preventDefault();
                        const { selectedCards: cardsToCopy } = useSelectionStore.getState();
                        if (cardsToCopy.size > 0) {
                            void copySelectedCardNames(Array.from(cardsToCopy));
                        }
                        break;
                    }
                    case "x": {
                        // Cut: Copy selected card names, then delete cards
                        e.preventDefault();
                        const { selectedCards: cardsToCut, clearSelection: clearForCut } = useSelectionStore.getState();
                        if (cardsToCut.size > 0) {
                            const uuidsArray = Array.from(cardsToCut);
                            void copySelectedCardNames(uuidsArray).then(() => {
                                // Delete cards after copying (batch operation)
                                void undoableDeleteCardsBatch(uuidsArray);
                                clearForCut();
                            });
                        }
                        break;
                    }
                }

                // Non-letter keys: check e.key directly (not lowercased)
                if (e.key === "/" || e.key === "\\") {
                    // Show keyboard shortcuts help
                    e.preventDefault();
                    useKeyboardShortcutsStore.getState().openModal();
                }
            }

            // Ctrl+Delete or Cmd+Delete - delete selected cards
            if (e.key === "Delete" && modifierActive) {
                e.preventDefault();
                const { selectedCards: cardsToDelete, clearSelection } = useSelectionStore.getState();
                if (cardsToDelete.size > 0) {
                    void undoableDeleteCardsBatch(Array.from(cardsToDelete));
                    clearSelection();
                }
            }
        };

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [active]);
}

