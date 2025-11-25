import { describe, it, expect } from "vitest";

interface CardOption {
    name: string;
    rarity?: string;
    order: number;
}

const rarityMap: Record<string, number> = {
    common: 1,
    uncommon: 2,
    rare: 3,
    mythic: 4,
    special: 5,
    bonus: 6,
};

function sortCards(cards: CardOption[], direction: "asc" | "desc") {
    return [...cards].sort((a, b) => {
        const rA = rarityMap[a.rarity?.toLowerCase() || ""] || 0;
        const rB = rarityMap[b.rarity?.toLowerCase() || ""] || 0;
        const comparison = rA - rB;
        return direction === "asc" ? comparison : -comparison;
    });
}

describe("Rarity Sort Logic", () => {
    const cards: CardOption[] = [
        { name: "Basic Land", rarity: "common", order: 1 },
        { name: "Rare Card", rarity: "rare", order: 2 },
        { name: "Mythic Card", rarity: "mythic", order: 3 },
        { name: "Unknown Card", rarity: undefined, order: 4 },
    ];

    it("should sort ascending (Common -> Mythic)", () => {
        const sorted = sortCards(cards, "asc");
        // Expected: Unknown (0) -> Common (1) -> Rare (3) -> Mythic (4)
        expect(sorted.map(c => c.name)).toEqual([
            "Unknown Card",
            "Basic Land",
            "Rare Card",
            "Mythic Card",
        ]);
    });

    it("should sort descending (Mythic -> Common)", () => {
        const sorted = sortCards(cards, "desc");
        // Expected: Mythic (4) -> Rare (3) -> Common (1) -> Unknown (0)
        expect(sorted.map(c => c.name)).toEqual([
            "Mythic Card",
            "Rare Card",
            "Basic Land",
            "Unknown Card",
        ]);
    });
});
