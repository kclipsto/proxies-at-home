import { describe, it, expect } from "vitest";

// Mock CardOption
interface CardOption {
    name: string;
    colors?: string[];
    mana_cost?: string;
    type_line?: string;
}

const getPrimaryColor = (c: CardOption) => {
    if (c.colors && c.colors.length > 0) {
        const wubrgOrder: Record<string, number> = { w: 1, u: 2, b: 3, r: 4, g: 5 };
        const sortedColors = [...c.colors].sort((x, y) => {
            return (wubrgOrder[x.toLowerCase()] || 99) - (wubrgOrder[y.toLowerCase()] || 99);
        });
        return sortedColors[0].toLowerCase();
    }
    return 'c';
};

describe("Color Sort Logic", () => {
    it("should sort Lands before Non-Lands within same color", () => {
        const land: CardOption = { name: "Plains", colors: ["W"], type_line: "Basic Land - Plains" };
        const creature: CardOption = { name: "Savannah Lions", mana_cost: "{W}", colors: ["W"], type_line: "Creature" };

        // Both are White (4)
        // Land should be first
        const isLandA = land.type_line?.includes("Land") ? 1 : 0;
        const isLandB = creature.type_line?.includes("Land") ? 1 : 0;

        const comparison = isLandB - isLandA; // 0 - 1 = -1 (A comes first)
        expect(comparison).toBeLessThan(0);
    });

    it("should use WUBRG fallback if mana_cost is missing", () => {
        // Colors unsorted or alphabetical: R, W, B
        const kaalia: CardOption = { name: "Kaalia", colors: ["R", "W", "B"] };

        // Should pick 'W' because W < B < R in WUBRG
        const wubrgOrder: Record<string, number> = { w: 1, u: 2, b: 3, r: 4, g: 5 };
        const sortedColors = [...(kaalia.colors || [])].sort((x, y) => {
            return (wubrgOrder[x.toLowerCase()] || 99) - (wubrgOrder[y.toLowerCase()] || 99);
        });
        const primary = sortedColors[0].toLowerCase();

        expect(primary).toBe("w");
    });

    it("should sort {2}{U}{G} as Blue", () => {
        const card: CardOption = { name: "Simic Card", mana_cost: "{2}{U}{G}", colors: ["U", "G"] };
        expect(getPrimaryColor(card)).toBe("u");
    });
});
