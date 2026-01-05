import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFilteredAndSortedCards, getCardTypes } from "./useFilteredAndSortedCards";
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

    describe("getCardTypes", () => {
        it("should return Creature for creature type line", () => {
            expect(getCardTypes("Legendary Creature — Human Wizard")).toBe("Creature");
        });

        it("should return Instant for instant type line", () => {
            expect(getCardTypes("Instant")).toBe("Instant");
        });

        it("should return Sorcery for sorcery type line", () => {
            expect(getCardTypes("Sorcery")).toBe("Sorcery");
        });

        it("should return Land for land type line", () => {
            expect(getCardTypes("Basic Land — Island")).toBe("Land");
        });

        it("should return Artifact for artifact type line", () => {
            expect(getCardTypes("Artifact — Equipment")).toBe("Artifact");
        });

        it("should return Enchantment for enchantment type line", () => {
            expect(getCardTypes("Enchantment — Aura")).toBe("Enchantment");
        });

        it("should return Planeswalker for planeswalker type line", () => {
            expect(getCardTypes("Legendary Planeswalker — Jace")).toBe("Planeswalker");
        });

        it("should return undefined for unknown type", () => {
            expect(getCardTypes("Unknown Type")).toBeUndefined();
        });

        it("should return undefined for empty string", () => {
            expect(getCardTypes("")).toBeUndefined();
        });

        it("should return undefined for undefined", () => {
            expect(getCardTypes(undefined)).toBeUndefined();
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

        it("should auto-flip card if hidden face matches filter", () => {
            const cards = [
                // Bala Ged Recovery (Sorcery) // Bala Ged Sanctuary (Land)
                // Currently showing Back (Land, isFlipped=true)
                createCard({
                    uuid: "front-uuid",
                    name: "Bala Ged Recovery",
                    type_line: "Sorcery",
                    linkedBackId: "back-uuid",
                    isFlipped: true // Showing back
                }),
                createCard({
                    uuid: "back-uuid",
                    name: "Bala Ged Sanctuary",
                    type_line: "Land",
                    linkedFrontId: "front-uuid",
                    // Back card entry doesn't strictly track isFlipped for the 'front' card concept,
                    // but it exists in the array.
                    isFlipped: true
                }),
            ];
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
            // Expect isFlipped to be false because the Virtual Card masquerades as the Front Face.
            expect(passedCard1.isFlipped).toBe(false);

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
