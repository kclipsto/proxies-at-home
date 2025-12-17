import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSelectionStore, initializeFlipState } from "./selection";

// Mock the database
vi.mock("../db", () => ({
    db: {
        cards: {
            update: vi.fn().mockResolvedValue(undefined),
            bulkUpdate: vi.fn().mockResolvedValue(undefined),
            filter: vi.fn(() => ({
                toArray: vi.fn().mockResolvedValue([]),
            })),
        },
    },
}));

describe("useSelectionStore", () => {
    beforeEach(() => {
        // Reset store state before each test
        useSelectionStore.setState({
            selectedCards: new Set(),
            flippedCards: new Set(),
            lastClickedIndex: null,
            isMultiSelectMode: false,
        });
    });

    describe("toggleSelection", () => {
        it("should add a card to selection if not selected", () => {
            const { toggleSelection } = useSelectionStore.getState();

            toggleSelection("card-1");

            expect(useSelectionStore.getState().selectedCards.has("card-1")).toBe(true);
        });

        it("should remove a card from selection if already selected", () => {
            useSelectionStore.setState({ selectedCards: new Set(["card-1"]) });
            const { toggleSelection } = useSelectionStore.getState();

            toggleSelection("card-1");

            expect(useSelectionStore.getState().selectedCards.has("card-1")).toBe(false);
        });

        it("should update lastClickedIndex if index provided", () => {
            const { toggleSelection } = useSelectionStore.getState();

            toggleSelection("card-1", 5);

            expect(useSelectionStore.getState().lastClickedIndex).toBe(5);
        });

        it("should keep existing lastClickedIndex if no index provided", () => {
            useSelectionStore.setState({ lastClickedIndex: 3 });
            const { toggleSelection } = useSelectionStore.getState();

            toggleSelection("card-1");

            expect(useSelectionStore.getState().lastClickedIndex).toBe(3);
        });
    });

    describe("selectCard", () => {
        it("should add a card to selection", () => {
            const { selectCard } = useSelectionStore.getState();

            selectCard("card-1");

            expect(useSelectionStore.getState().selectedCards.has("card-1")).toBe(true);
        });

        it("should not duplicate cards in selection", () => {
            useSelectionStore.setState({ selectedCards: new Set(["card-1"]) });
            const { selectCard } = useSelectionStore.getState();

            selectCard("card-1");

            expect(useSelectionStore.getState().selectedCards.size).toBe(1);
        });

        it("should update lastClickedIndex if index provided", () => {
            const { selectCard } = useSelectionStore.getState();

            selectCard("card-1", 10);

            expect(useSelectionStore.getState().lastClickedIndex).toBe(10);
        });
    });

    describe("deselectCard", () => {
        it("should remove a card from selection", () => {
            useSelectionStore.setState({ selectedCards: new Set(["card-1", "card-2"]) });
            const { deselectCard } = useSelectionStore.getState();

            deselectCard("card-1");

            expect(useSelectionStore.getState().selectedCards.has("card-1")).toBe(false);
            expect(useSelectionStore.getState().selectedCards.has("card-2")).toBe(true);
        });

        it("should do nothing if card not in selection", () => {
            useSelectionStore.setState({ selectedCards: new Set(["card-1"]) });
            const { deselectCard } = useSelectionStore.getState();

            deselectCard("card-2");

            expect(useSelectionStore.getState().selectedCards.size).toBe(1);
        });
    });

    describe("selectCards", () => {
        it("should add multiple cards to selection", () => {
            const { selectCards } = useSelectionStore.getState();

            selectCards(["card-1", "card-2", "card-3"]);

            const state = useSelectionStore.getState();
            expect(state.selectedCards.has("card-1")).toBe(true);
            expect(state.selectedCards.has("card-2")).toBe(true);
            expect(state.selectedCards.has("card-3")).toBe(true);
        });

        it("should merge with existing selection", () => {
            useSelectionStore.setState({ selectedCards: new Set(["card-0"]) });
            const { selectCards } = useSelectionStore.getState();

            selectCards(["card-1", "card-2"]);

            const state = useSelectionStore.getState();
            expect(state.selectedCards.has("card-0")).toBe(true);
            expect(state.selectedCards.has("card-1")).toBe(true);
            expect(state.selectedCards.has("card-2")).toBe(true);
        });
    });

    describe("selectAll", () => {
        it("should select all provided UUIDs", () => {
            const { selectAll } = useSelectionStore.getState();

            selectAll(["card-1", "card-2", "card-3"]);

            const state = useSelectionStore.getState();
            expect(state.selectedCards.size).toBe(3);
        });

        it("should replace existing selection", () => {
            useSelectionStore.setState({ selectedCards: new Set(["old-card"]) });
            const { selectAll } = useSelectionStore.getState();

            selectAll(["card-1", "card-2"]);

            const state = useSelectionStore.getState();
            expect(state.selectedCards.has("old-card")).toBe(false);
            expect(state.selectedCards.size).toBe(2);
        });
    });

    describe("selectRange", () => {
        const allUuids = ["card-0", "card-1", "card-2", "card-3", "card-4"];

        it("should select range from lastClickedIndex to toIndex", () => {
            useSelectionStore.setState({ lastClickedIndex: 1 });
            const { selectRange } = useSelectionStore.getState();

            selectRange(allUuids, 3);

            const state = useSelectionStore.getState();
            expect(state.selectedCards.has("card-1")).toBe(true);
            expect(state.selectedCards.has("card-2")).toBe(true);
            expect(state.selectedCards.has("card-3")).toBe(true);
        });

        it("should work when toIndex is less than lastClickedIndex", () => {
            useSelectionStore.setState({ lastClickedIndex: 3 });
            const { selectRange } = useSelectionStore.getState();

            selectRange(allUuids, 1);

            const state = useSelectionStore.getState();
            expect(state.selectedCards.has("card-1")).toBe(true);
            expect(state.selectedCards.has("card-2")).toBe(true);
            expect(state.selectedCards.has("card-3")).toBe(true);
        });

        it("should use 0 as default lastClickedIndex", () => {
            const { selectRange } = useSelectionStore.getState();

            selectRange(allUuids, 2);

            const state = useSelectionStore.getState();
            expect(state.selectedCards.has("card-0")).toBe(true);
            expect(state.selectedCards.has("card-1")).toBe(true);
            expect(state.selectedCards.has("card-2")).toBe(true);
        });

        it("should update lastClickedIndex to toIndex", () => {
            const { selectRange } = useSelectionStore.getState();

            selectRange(allUuids, 3);

            expect(useSelectionStore.getState().lastClickedIndex).toBe(3);
        });

        it("should merge with existing selection", () => {
            useSelectionStore.setState({
                selectedCards: new Set(["card-0"]),
                lastClickedIndex: 3
            });
            const { selectRange } = useSelectionStore.getState();

            selectRange(allUuids, 4);

            const state = useSelectionStore.getState();
            expect(state.selectedCards.has("card-0")).toBe(true);
            expect(state.selectedCards.has("card-3")).toBe(true);
            expect(state.selectedCards.has("card-4")).toBe(true);
        });
    });

    describe("clearSelection", () => {
        it("should clear all selected cards", () => {
            useSelectionStore.setState({
                selectedCards: new Set(["card-1", "card-2"]),
                lastClickedIndex: 5
            });
            const { clearSelection } = useSelectionStore.getState();

            clearSelection();

            const state = useSelectionStore.getState();
            expect(state.selectedCards.size).toBe(0);
            expect(state.lastClickedIndex).toBe(null);
        });
    });

    describe("setMultiSelectMode", () => {
        it("should enable multi-select mode", () => {
            const { setMultiSelectMode } = useSelectionStore.getState();

            setMultiSelectMode(true);

            expect(useSelectionStore.getState().isMultiSelectMode).toBe(true);
        });

        it("should disable multi-select mode", () => {
            useSelectionStore.setState({ isMultiSelectMode: true });
            const { setMultiSelectMode } = useSelectionStore.getState();

            setMultiSelectMode(false);

            expect(useSelectionStore.getState().isMultiSelectMode).toBe(false);
        });
    });

    describe("getSelectedArray", () => {
        it("should return array of selected UUIDs", () => {
            useSelectionStore.setState({ selectedCards: new Set(["card-1", "card-2"]) });
            const { getSelectedArray } = useSelectionStore.getState();

            const result = getSelectedArray();

            expect(result).toContain("card-1");
            expect(result).toContain("card-2");
            expect(result.length).toBe(2);
        });

        it("should return empty array when no selection", () => {
            const { getSelectedArray } = useSelectionStore.getState();

            const result = getSelectedArray();

            expect(result).toEqual([]);
        });
    });

    describe("toggleFlip", () => {
        it("should flip a single unflipped card", () => {
            const { toggleFlip } = useSelectionStore.getState();

            toggleFlip("card-1");

            expect(useSelectionStore.getState().flippedCards.has("card-1")).toBe(true);
        });

        it("should unflip a flipped card", () => {
            useSelectionStore.setState({ flippedCards: new Set(["card-1"]) });
            const { toggleFlip } = useSelectionStore.getState();

            toggleFlip("card-1");

            expect(useSelectionStore.getState().flippedCards.has("card-1")).toBe(false);
        });

        it("should flip all selected cards when multiple selected and clicked card is in selection", () => {
            useSelectionStore.setState({
                selectedCards: new Set(["card-1", "card-2", "card-3"])
            });
            const { toggleFlip } = useSelectionStore.getState();

            toggleFlip("card-1");

            const state = useSelectionStore.getState();
            expect(state.flippedCards.has("card-1")).toBe(true);
            expect(state.flippedCards.has("card-2")).toBe(true);
            expect(state.flippedCards.has("card-3")).toBe(true);
        });

        it("should unflip all selected cards when clicked card is already flipped", () => {
            useSelectionStore.setState({
                selectedCards: new Set(["card-1", "card-2", "card-3"]),
                flippedCards: new Set(["card-1", "card-2", "card-3"])
            });
            const { toggleFlip } = useSelectionStore.getState();

            toggleFlip("card-1");

            const state = useSelectionStore.getState();
            expect(state.flippedCards.has("card-1")).toBe(false);
            expect(state.flippedCards.has("card-2")).toBe(false);
            expect(state.flippedCards.has("card-3")).toBe(false);
        });

        it("should flip only clicked card when only one card selected", () => {
            useSelectionStore.setState({
                selectedCards: new Set(["card-1"])
            });
            const { toggleFlip } = useSelectionStore.getState();

            toggleFlip("card-1");

            expect(useSelectionStore.getState().flippedCards.has("card-1")).toBe(true);
        });

        it("should flip only clicked card when clicked card not in selection", () => {
            useSelectionStore.setState({
                selectedCards: new Set(["card-2", "card-3"])
            });
            const { toggleFlip } = useSelectionStore.getState();

            toggleFlip("card-1");

            const state = useSelectionStore.getState();
            expect(state.flippedCards.has("card-1")).toBe(true);
            expect(state.flippedCards.has("card-2")).toBe(false);
            expect(state.flippedCards.has("card-3")).toBe(false);
        });
    });

    describe("isFlipped", () => {
        it("should return true for flipped cards", () => {
            useSelectionStore.setState({ flippedCards: new Set(["card-1"]) });
            const { isFlipped } = useSelectionStore.getState();

            expect(isFlipped("card-1")).toBe(true);
        });

        it("should return false for unflipped cards", () => {
            const { isFlipped } = useSelectionStore.getState();

            expect(isFlipped("card-1")).toBe(false);
        });
    });
});

describe("initializeFlipState", () => {
    it("should initialize flipped cards from database", async () => {
        // Mock database to return flipped cards
        const mockDb = await import("../db");
        vi.mocked(mockDb.db.cards.filter).mockReturnValue({
            toArray: vi.fn().mockResolvedValue([
                { uuid: "card-1" },
                { uuid: "card-3" }
            ]),
        } as never);

        await initializeFlipState();

        const state = useSelectionStore.getState();
        expect(state.flippedCards.has("card-1")).toBe(true);
        expect(state.flippedCards.has("card-3")).toBe(true);
    });
});
