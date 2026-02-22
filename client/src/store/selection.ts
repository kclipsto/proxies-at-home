import { create } from "zustand";

interface SelectionState {
    /**
     * Set of selected card UUIDs.
     */
    selectedCards: Set<string>;

    /**
     * Set of flipped card UUIDs (for showing back face).
     */
    flippedCards: Set<string>;

    /**
     * Last clicked card index for shift+click range selection.
     */
    lastClickedIndex: number | null;

    /**
     * Whether we're in multi-select mode (e.g., user is holding Ctrl/Cmd).
     */
    isMultiSelectMode: boolean;

    /**
     * Toggle a card's selection state.
     */
    toggleSelection: (uuid: string, index?: number) => void;

    /**
     * Add a card to the selection.
     */
    selectCard: (uuid: string, index?: number) => void;

    /**
     * Remove a card from the selection.
     */
    deselectCard: (uuid: string) => void;

    /**
     * Select multiple cards.
     */
    selectCards: (uuids: string[]) => void;

    /**
     * Select all cards from provided list.
     */
    selectAll: (allUuids: string[]) => void;

    /**
     * Select range of cards between lastClickedIndex and current index.
     */
    selectRange: (allUuids: string[], toIndex: number) => void;

    /**
     * Clear all selection.
     */
    clearSelection: () => void;

    /**
     * Set multi-select mode.
     */
    setMultiSelectMode: (enabled: boolean) => void;

    /**
     * Get array of selected card UUIDs.
     */
    getSelectedArray: () => string[];

    /**
     * Toggle flip state for a card. If cards are selected, flips all selected cards.
     */
    toggleFlip: (uuid: string) => void;

    /**
     * Check if a card is flipped.
     */
    isFlipped: (uuid: string) => boolean;

    /**
     * Explicitly set flip state for specific cards.
     */
    setFlipped: (uuids: string[], isFlipped: boolean) => void;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
    selectedCards: new Set(),
    flippedCards: new Set(),
    lastClickedIndex: null,
    isMultiSelectMode: false,

    toggleSelection: (uuid, index) =>
        set((state) => {
            const newSet = new Set(state.selectedCards);
            if (newSet.has(uuid)) {
                newSet.delete(uuid);
            } else {
                newSet.add(uuid);
            }
            return {
                selectedCards: newSet,
                lastClickedIndex: index ?? state.lastClickedIndex,
            };
        }),

    selectCard: (uuid, index) =>
        set((state) => {
            const newSet = new Set(state.selectedCards);
            newSet.add(uuid);
            return {
                selectedCards: newSet,
                lastClickedIndex: index ?? state.lastClickedIndex,
            };
        }),

    deselectCard: (uuid) =>
        set((state) => {
            const newSet = new Set(state.selectedCards);
            newSet.delete(uuid);
            return { selectedCards: newSet };
        }),

    selectCards: (uuids) =>
        set((state) => {
            const newSet = new Set(state.selectedCards);
            uuids.forEach((uuid) => newSet.add(uuid));
            return { selectedCards: newSet };
        }),

    selectAll: (allUuids) =>
        set({ selectedCards: new Set(allUuids) }),

    selectRange: (allUuids, toIndex) =>
        set((state) => {
            const fromIndex = state.lastClickedIndex ?? 0;
            const start = Math.min(fromIndex, toIndex);
            const end = Math.max(fromIndex, toIndex);
            const rangeUuids = allUuids.slice(start, end + 1);
            const newSet = new Set(state.selectedCards);
            rangeUuids.forEach((uuid) => newSet.add(uuid));
            return {
                selectedCards: newSet,
                lastClickedIndex: toIndex,
            };
        }),

    clearSelection: () => set({ selectedCards: new Set(), lastClickedIndex: null }),

    setMultiSelectMode: (enabled) => set({ isMultiSelectMode: enabled }),

    getSelectedArray: () => Array.from(get().selectedCards),

    toggleFlip: (uuid) => {
        const state = get();
        const newFlipped = new Set(state.flippedCards);
        const uuidsToUpdate: string[] = [];

        if (state.selectedCards.has(uuid) && state.selectedCards.size > 1) {
            const shouldFlip = !state.flippedCards.has(uuid);

            state.selectedCards.forEach((selectedUuid) => {
                if (shouldFlip) {
                    newFlipped.add(selectedUuid);
                } else {
                    newFlipped.delete(selectedUuid);
                }
                uuidsToUpdate.push(selectedUuid);
            });

            import('../db').then(({ db }) => {
                db.cards.bulkUpdate(
                    uuidsToUpdate.map(id => ({ key: id, changes: { isFlipped: shouldFlip } }))
                );
            });
        } else {
            const isCurrentlyFlipped = newFlipped.has(uuid);
            if (isCurrentlyFlipped) {
                newFlipped.delete(uuid);
            } else {
                newFlipped.add(uuid);
            }

            import('../db').then(({ db }) => {
                db.cards.update(uuid, { isFlipped: !isCurrentlyFlipped });
            });
        }

        set({ flippedCards: newFlipped });
    },

    isFlipped: (uuid) => get().flippedCards.has(uuid),

    setFlipped: (uuids, isFlipped) => {
        set((state) => {
            const newFlipped = new Set(state.flippedCards);
            uuids.forEach(uuid => {
                if (isFlipped) newFlipped.add(uuid);
                else newFlipped.delete(uuid);
            });
            return { flippedCards: newFlipped };
        });

        import('../db').then(({ db }) => {
            db.cards.bulkUpdate(
                uuids.map(id => ({ key: id, changes: { isFlipped } }))
            );
        });
    },
}));

/**
 * Initialize flip state from database.
 * Call this during app initialization to restore flip state.
 */
export async function initializeFlipState() {
    const { db } = await import('../db');
    const flippedCards = await db.cards
        .filter(c => c.isFlipped === true)
        .toArray();

    const flippedSet = new Set(flippedCards.map(c => c.uuid));
    useSelectionStore.setState({ flippedCards: flippedSet });
}

