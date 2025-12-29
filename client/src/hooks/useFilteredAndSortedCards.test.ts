import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFilteredAndSortedCards, getPrimaryType } from "./useFilteredAndSortedCards";
import type { CardOption } from "../../../shared/types";

// Mock settings store
const mockSettingsState = vi.hoisted(() => ({
    sortBy: "manual" as string,
    sortOrder: "asc" as "asc" | "desc",
    filterManaCost: [] as number[],
    filterColors: [] as string[],
    filterTypes: [] as string[],
    filterCategories: [] as string[],
    filterMatchType: "any" as "any" | "exact",
}));

vi.mock("../store/settings", () => ({
    useSettingsStore: (selector: (state: typeof mockSettingsState) => unknown) => {
        return selector(mockSettingsState);
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
        mockSettingsState.filterMatchType = "any";
    });

    describe("getPrimaryType", () => {
        it("should return Creature for creature type line", () => {
            expect(getPrimaryType("Legendary Creature — Human Wizard")).toBe("Creature");
        });

        it("should return Instant for instant type line", () => {
            expect(getPrimaryType("Instant")).toBe("Instant");
        });

        it("should return Sorcery for sorcery type line", () => {
            expect(getPrimaryType("Sorcery")).toBe("Sorcery");
        });

        it("should return Land for land type line", () => {
            expect(getPrimaryType("Basic Land — Island")).toBe("Land");
        });

        it("should return Artifact for artifact type line", () => {
            expect(getPrimaryType("Artifact — Equipment")).toBe("Artifact");
        });

        it("should return Enchantment for enchantment type line", () => {
            expect(getPrimaryType("Enchantment — Aura")).toBe("Enchantment");
        });

        it("should return Planeswalker for planeswalker type line", () => {
            expect(getPrimaryType("Legendary Planeswalker — Jace")).toBe("Planeswalker");
        });

        it("should return undefined for unknown type", () => {
            expect(getPrimaryType("Unknown Type")).toBeUndefined();
        });

        it("should return undefined for empty string", () => {
            expect(getPrimaryType("")).toBeUndefined();
        });

        it("should return undefined for undefined", () => {
            expect(getPrimaryType(undefined)).toBeUndefined();
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
