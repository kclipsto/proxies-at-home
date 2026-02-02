import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFilteredAndSortedCards } from "./useFilteredAndSortedCards";
import { getCardTypes } from "../helpers/sortAndFilterUtils";
import type { CardOption } from "../../../shared/types";

// Mock settings store
const mockSettingsState = vi.hoisted(() => ({
    sortBy: "manual" as string,
    sortOrder: "asc" as "asc" | "desc",
    filterManaCost: [] as number[],
    filterColors: [] as string[],
    filterTypes: [] as string[],
    filterCategories: [] as string[],
    filterMatchType: "partial" as "partial" | "exact",
}));

vi.mock("../store/settings", () => ({
    useSettingsStore: (selector: (state: typeof mockSettingsState) => unknown) => {
        return selector(mockSettingsState);
    },
}));

// Mock selection store - flippedCards is a Set<string> of flipped card UUIDs
const mockFlippedCards = vi.hoisted(() => new Set<string>());

vi.mock("../store/selection", () => ({
    useSelectionStore: (selector: (state: { flippedCards: Set<string> }) => unknown) => {
        return selector({ flippedCards: mockFlippedCards });
    },
}));

describe("useFilteredAndSortedCards", () => {
    const createCard = (overrides: Partial<CardOption> = {}): CardOption => ({
        uuid: `card-${Math.random()}`,
        name: "Test Card",
        order: 1,
        isUserUpload: false,
        ...overrides,
    });

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset to defaults
        mockSettingsState.sortBy = "manual";
        mockSettingsState.sortOrder = "asc";
        mockSettingsState.filterManaCost = [];
        mockSettingsState.filterColors = [];
        mockSettingsState.filterTypes = [];
        mockSettingsState.filterCategories = [];
        mockSettingsState.filterMatchType = "partial";
        // Reset flipped cards
        mockFlippedCards.clear();
    });

    describe("getCardTypes", () => {
        it("should return Creature for creature type line", () => {
            expect(getCardTypes("Legendary Creature — Human Wizard")).toContain("Creature");
        });

        it("should return Instant for instant type line", () => {
            expect(getCardTypes("Instant")).toContain("Instant");
        });

        it("should return Sorcery for sorcery type line", () => {
            expect(getCardTypes("Sorcery")).toContain("Sorcery");
        });

        it("should return Land for land type line", () => {
            expect(getCardTypes("Basic Land — Island")).toContain("Land");
        });

        it("should return Artifact for artifact type line", () => {
            expect(getCardTypes("Artifact — Equipment")).toContain("Artifact");
        });

        it("should return Enchantment for enchantment type line", () => {
            expect(getCardTypes("Enchantment — Aura")).toContain("Enchantment");
        });

        it("should return Planeswalker for planeswalker type line", () => {
            expect(getCardTypes("Legendary Planeswalker — Jace")).toContain("Planeswalker");
        });

        it("should return empty array for unknown type", () => {
            expect(getCardTypes("Unknown Type")).toEqual([]);
        });

        it("should return empty array for empty string", () => {
            expect(getCardTypes("")).toEqual([]);
        });

        it("should return empty array for undefined", () => {
            expect(getCardTypes(undefined)).toEqual([]);
        });
    });

    describe("filtering", () => {
        it("should return all cards when no filters applied", () => {
            const cards = [
                createCard({ name: "Card 1" }),
                createCard({ name: "Card 2" }),
            ];

            const { result } = renderHook(() => useFilteredAndSortedCards(cards));

            expect(result.current.filteredAndSortedCards).toHaveLength(2);
        });

        it("should filter by mana cost", () => {
            const cards = [
                createCard({ name: "Cheap", cmc: 1 }),
                createCard({ name: "Medium", cmc: 3 }),
                createCard({ name: "Expensive", cmc: 7 }),
            ];
            mockSettingsState.filterManaCost = [3];

            const { result } = renderHook(() => useFilteredAndSortedCards(cards));

            expect(result.current.filteredAndSortedCards).toHaveLength(1);
            expect(result.current.filteredAndSortedCards[0].name).toBe("Medium");
        });

        it("should filter by mana cost with 7+ grouping", () => {
            const cards = [
                createCard({ name: "Cheap", cmc: 1 }),
                createCard({ name: "Expensive", cmc: 8 }),
                createCard({ name: "Also Expensive", cmc: 10 }),
            ];
            mockSettingsState.filterManaCost = [7];

            const { result } = renderHook(() => useFilteredAndSortedCards(cards));

            expect(result.current.filteredAndSortedCards).toHaveLength(2);
        });

        it("should filter by colors (any match)", () => {
            const cards = [
                createCard({ name: "Red Card", colors: ["R"] }),
                createCard({ name: "Blue Card", colors: ["U"] }),
                createCard({ name: "Gold Card", colors: ["R", "U"] }),
            ];
            mockSettingsState.filterColors = ["R"];

            const { result } = renderHook(() => useFilteredAndSortedCards(cards));

            expect(result.current.filteredAndSortedCards).toHaveLength(2);
        });

        it("should filter colorless cards", () => {
            const cards = [
                createCard({ name: "Colorless", colors: [] }),
                createCard({ name: "Red Card", colors: ["R"] }),
            ];
            mockSettingsState.filterColors = ["C"];

            const { result } = renderHook(() => useFilteredAndSortedCards(cards));

            expect(result.current.filteredAndSortedCards).toHaveLength(1);
            expect(result.current.filteredAndSortedCards[0].name).toBe("Colorless");
        });

        it("should filter multicolor cards", () => {
            const cards = [
                createCard({ name: "Mono", colors: ["R"] }),
                createCard({ name: "Multi", colors: ["R", "U"] }),
            ];
            mockSettingsState.filterColors = ["M"];

            const { result } = renderHook(() => useFilteredAndSortedCards(cards));

            expect(result.current.filteredAndSortedCards).toHaveLength(1);
            expect(result.current.filteredAndSortedCards[0].name).toBe("Multi");
        });

        it("should filter by card type", () => {
            const cards = [
                createCard({ name: "Creature", type_line: "Creature — Human" }),
                createCard({ name: "Instant", type_line: "Instant" }),
            ];
            mockSettingsState.filterTypes = ["Creature"];

            const { result } = renderHook(() => useFilteredAndSortedCards(cards));

            expect(result.current.filteredAndSortedCards).toHaveLength(1);
            expect(result.current.filteredAndSortedCards[0].name).toBe("Creature");
        });

        it("should filter by deck category", () => {
            const cards = [
                createCard({ name: "Commander", category: "Commander" }),
                createCard({ name: "Main", category: "Mainboard" }),
            ];
            mockSettingsState.filterCategories = ["Commander"];

            const { result } = renderHook(() => useFilteredAndSortedCards(cards));

            expect(result.current.filteredAndSortedCards).toHaveLength(1);
            expect(result.current.filteredAndSortedCards[0].name).toBe("Commander");
        });

        it("should filter by feature (dfc) using Dual Faced type", () => {
            const cards = [
                createCard({ name: "Regular" }),
                createCard({ name: "DFC Front", uuid: "front-uuid", linkedBackId: "back-uuid" }),
                createCard({ name: "DFC Back", uuid: "back-uuid", linkedFrontId: "front-uuid" }),
            ];
            mockSettingsState.filterTypes = ["Dual Faced"];

            const { result } = renderHook(() => useFilteredAndSortedCards(cards));

            expect(result.current.filteredAndSortedCards).toHaveLength(1);
            const names = result.current.filteredAndSortedCards.map(c => c.name);
            expect(names).toContain("DFC Front");
            expect(names).not.toContain("DFC Back");
        });

        describe("Token filtering", () => {
            it("should filter by Token using isToken field", () => {
                const cards = [
                    createCard({ name: "Sol Ring", type_line: "Artifact", isToken: false }),
                    createCard({ name: "Soldier Token", type_line: "Token Creature — Soldier", isToken: true }),
                    createCard({ name: "Treasure", type_line: "Token Artifact — Treasure", isToken: true }),
                ];
                mockSettingsState.filterTypes = ["Token"];

                const { result } = renderHook(() => useFilteredAndSortedCards(cards));

                expect(result.current.filteredAndSortedCards).toHaveLength(2);
                const names = result.current.filteredAndSortedCards.map(c => c.name);
                expect(names).toContain("Soldier Token");
                expect(names).toContain("Treasure");
                expect(names).not.toContain("Sol Ring");
            });

            it("should filter tokens even without type_line containing Token", () => {
                // Tokens imported from deck builders may have isToken but unclear type_line
                const cards = [
                    createCard({ name: "Beast", isToken: true }),  // No type_line set
                    createCard({ name: "Lightning Bolt", type_line: "Instant" }),
                ];
                mockSettingsState.filterTypes = ["Token"];

                const { result } = renderHook(() => useFilteredAndSortedCards(cards));

                expect(result.current.filteredAndSortedCards).toHaveLength(1);
                expect(result.current.filteredAndSortedCards[0].name).toBe("Beast");
            });

            it("should combine Token filter with other type filters in partial mode", () => {
                const cards = [
                    createCard({ name: "Soldier Token", isToken: true }),
                    createCard({ name: "Lightning Bolt", type_line: "Instant" }),
                    createCard({ name: "Sol Ring", type_line: "Artifact" }),
                ];
                mockSettingsState.filterTypes = ["Token", "Instant"];
                mockSettingsState.filterMatchType = "partial";

                const { result } = renderHook(() => useFilteredAndSortedCards(cards));

                expect(result.current.filteredAndSortedCards).toHaveLength(2);
                const names = result.current.filteredAndSortedCards.map(c => c.name);
                expect(names).toContain("Soldier Token");
                expect(names).toContain("Lightning Bolt");
                expect(names).not.toContain("Sol Ring");
            });

            it("should require token AND other types in exact mode", () => {
                const cards = [
                    // This should NOT match because a token creature is still just a token
                    createCard({ name: "Soldier Token", type_line: "Token Creature", isToken: true }),
                    createCard({ name: "Regular Creature", type_line: "Creature" }),
                ];
                mockSettingsState.filterTypes = ["Token", "Creature"];
                mockSettingsState.filterMatchType = "exact";

                const { result } = renderHook(() => useFilteredAndSortedCards(cards));

                // Token filter AND Creature filter must both match
                // Soldier Token is a token AND has creature in type_line
                expect(result.current.filteredAndSortedCards).toHaveLength(1);
                expect(result.current.filteredAndSortedCards[0].name).toBe("Soldier Token");
            });

            it("should not match non-tokens when Token filter is selected in exact mode", () => {
                const cards = [
                    createCard({ name: "Creature", type_line: "Creature", isToken: false }),
                    createCard({ name: "Token Creature", isToken: true }),
                ];
                mockSettingsState.filterTypes = ["Token"];
                mockSettingsState.filterMatchType = "exact";

                const { result } = renderHook(() => useFilteredAndSortedCards(cards));

                expect(result.current.filteredAndSortedCards).toHaveLength(1);
                expect(result.current.filteredAndSortedCards[0].name).toBe("Token Creature");
            });
        });

        it("should auto-flip card if hidden face matches filter", () => {
            const cards = [
                // Bala Ged Recovery (Sorcery) // Bala Ged Sanctuary (Land)
                // Currently showing Back (Land)
                createCard({
                    uuid: "front-uuid",
                    name: "Bala Ged Recovery",
                    type_line: "Sorcery",
                    linkedBackId: "back-uuid",
                }),
                createCard({
                    uuid: "back-uuid",
                    name: "Bala Ged Sanctuary",
                    type_line: "Land",
                    linkedFrontId: "front-uuid",
                }),
            ];
            // Simulate card is flipped (showing back face)
            mockFlippedCards.add("front-uuid");
            // Filter by Sorcery (Front face)
            mockSettingsState.filterTypes = ["Sorcery"];

            const { result } = renderHook(() => useFilteredAndSortedCards(cards));

            // Should pass because:
            // 1. Front (Bala Ged Recovery) showing Back (Land) -> Does not match "Sorcery".
            // 2. Hidden Face (Front/Sorcery) -> Matches "Sorcery". Auto-flip triggers.
            // 3. Back card entity is skipped/hidden from main list.
            expect(result.current.filteredAndSortedCards).toHaveLength(1);

            const passedCard1 = result.current.filteredAndSortedCards[0];
            expect(passedCard1.name).toBe("Bala Ged Recovery");
            // The hook returns idsToFlip to signal which cards should be flipped
            expect(result.current.idsToFlip).toContainEqual({ uuid: "front-uuid", targetState: false });

        });
    });

    describe("sorting", () => {
        it("should sort by name", () => {
            const cards = [
                createCard({ name: "Zebra", order: 1 }),
                createCard({ name: "Apple", order: 2 }),
                createCard({ name: "Mango", order: 3 }),
            ];
            mockSettingsState.sortBy = "name";

            const { result } = renderHook(() => useFilteredAndSortedCards(cards));

            expect(result.current.filteredAndSortedCards[0].name).toBe("Apple");
            expect(result.current.filteredAndSortedCards[2].name).toBe("Zebra");
        });

        it("should sort by cmc", () => {
            const cards = [
                createCard({ name: "Expensive", cmc: 7, order: 1 }),
                createCard({ name: "Cheap", cmc: 1, order: 2 }),
                createCard({ name: "Medium", cmc: 3, order: 3 }),
            ];
            mockSettingsState.sortBy = "cmc";

            const { result } = renderHook(() => useFilteredAndSortedCards(cards));

            expect(result.current.filteredAndSortedCards[0].name).toBe("Cheap");
            expect(result.current.filteredAndSortedCards[2].name).toBe("Expensive");
        });

        it("should reverse order when sortOrder is desc", () => {
            const cards = [
                createCard({ name: "A", order: 1 }),
                createCard({ name: "B", order: 2 }),
            ];
            mockSettingsState.sortBy = "name";
            mockSettingsState.sortOrder = "desc";

            const { result } = renderHook(() => useFilteredAndSortedCards(cards));

            expect(result.current.filteredAndSortedCards[0].name).toBe("B");
            expect(result.current.filteredAndSortedCards[1].name).toBe("A");
        });

        it("should preserve order for manual sort", () => {
            const cards = [
                createCard({ name: "First", order: 1 }),
                createCard({ name: "Second", order: 2 }),
            ];
            mockSettingsState.sortBy = "manual";

            const { result } = renderHook(() => useFilteredAndSortedCards(cards));

            expect(result.current.filteredAndSortedCards[0].name).toBe("First");
            expect(result.current.filteredAndSortedCards[1].name).toBe("Second");
        });
    });
});
