import { describe, it, expect } from "vitest";
import {
    getHasBuiltInBleed,
    getEffectiveBleedMode,
    getEffectiveExistingBleedMm,
    getExpectedBleedWidth,
    type GlobalSettings,
} from "./imageSpecs";
import type { CardOption } from "../../../shared/types";

// Helper to create test cards
function createTestCard(overrides: Partial<CardOption> = {}): CardOption {
    return {
        uuid: "test-uuid",
        name: "Test Card",
        order: 1,
        ...overrides,
    } as CardOption;
}

// Default test settings
const defaultSettings: GlobalSettings = {
    bleedEdgeWidth: 3,
    bleedEdgeUnit: "mm",
    withBleedSourceAmount: 3,
    withBleedTargetMode: "global",
    withBleedTargetAmount: 2,
    noBleedTargetMode: "global",
    noBleedTargetAmount: 3,
};

describe("imageSpecs", () => {
    describe("getHasBuiltInBleed", () => {
        it("should return undefined when no bleed properties are set (triggering auto-detect)", () => {
            const card = createTestCard();
            expect(getHasBuiltInBleed(card)).toBeUndefined();
        });

        it("should return true when hasBuiltInBleed is true", () => {
            const card = createTestCard({ hasBuiltInBleed: true });
            expect(getHasBuiltInBleed(card)).toBe(true);
        });

        it("should return false when hasBuiltInBleed is false", () => {
            const card = createTestCard({ hasBuiltInBleed: false });
            expect(getHasBuiltInBleed(card)).toBe(false);
        });

        it("should handle legacy hasBakedBleed property", () => {
            const card = createTestCard() as CardOption & { hasBakedBleed?: boolean };
            card.hasBakedBleed = true;
            expect(getHasBuiltInBleed(card)).toBe(true);
        });

        it("should prefer hasBuiltInBleed over hasBakedBleed", () => {
            const card = createTestCard({ hasBuiltInBleed: false }) as CardOption & { hasBakedBleed?: boolean };
            card.hasBakedBleed = true;
            expect(getHasBuiltInBleed(card)).toBe(false);
        });
    });

    describe("getEffectiveBleedMode", () => {
        it("should return per-card override when set", () => {
            const card = createTestCard({ bleedMode: "none" });
            expect(getEffectiveBleedMode(card, defaultSettings)).toBe("none");
        });

        it("should return 'generate' for cards with built-in bleed when targetMode is global", () => {
            const card = createTestCard({ hasBuiltInBleed: true });
            expect(getEffectiveBleedMode(card, defaultSettings)).toBe("generate");
        });

        it("should return 'none' for cards with built-in bleed when targetMode is none", () => {
            const card = createTestCard({ hasBuiltInBleed: true });
            const settings = { ...defaultSettings, withBleedTargetMode: "none" as const };
            expect(getEffectiveBleedMode(card, settings)).toBe("none");
        });

        it("should return 'generate' for user uploads", () => {
            const card = createTestCard({ isUserUpload: true });
            expect(getEffectiveBleedMode(card, defaultSettings)).toBe("generate");
        });

        it("should return 'none' for user uploads when noBleedTargetMode is none", () => {
            const card = createTestCard({ isUserUpload: true });
            const settings = { ...defaultSettings, noBleedTargetMode: "none" as const };
            expect(getEffectiveBleedMode(card, settings)).toBe("none");
        });

        it("should return 'generate' for Scryfall cards (default)", () => {
            const card = createTestCard();
            expect(getEffectiveBleedMode(card, defaultSettings)).toBe("generate");
        });
    });

    describe("getEffectiveExistingBleedMm", () => {
        it("should return per-card override when set", () => {
            const card = createTestCard({ existingBleedMm: 5 });
            expect(getEffectiveExistingBleedMm(card, defaultSettings)).toBe(5);
        });

        it("should return withBleedSourceAmount for cards with built-in bleed", () => {
            const card = createTestCard({ hasBuiltInBleed: true });
            expect(getEffectiveExistingBleedMm(card, defaultSettings)).toBe(3);
        });

        it("should return 0 for cards without built-in bleed", () => {
            const card = createTestCard();
            expect(getEffectiveExistingBleedMm(card, defaultSettings)).toBe(0);
        });

        it("should return 0 for user uploads without built-in bleed", () => {
            const card = createTestCard({ isUserUpload: true });
            expect(getEffectiveExistingBleedMm(card, defaultSettings)).toBe(0);
        });
    });

    describe("getExpectedBleedWidth", () => {
        it("should return 0 when effective mode is none", () => {
            const card = createTestCard({ bleedMode: "none" });
            expect(getExpectedBleedWidth(card, 3, defaultSettings)).toBe(0);
        });

        it("should return per-card generateBleedMm override when set", () => {
            const card = createTestCard({ generateBleedMm: 4 });
            expect(getExpectedBleedWidth(card, 3, defaultSettings)).toBe(4);
        });

        it("should return global bleed width for cards with built-in bleed (global mode)", () => {
            const card = createTestCard({ hasBuiltInBleed: true });
            expect(getExpectedBleedWidth(card, 3, defaultSettings)).toBe(3);
        });

        it("should return manual amount for cards with built-in bleed (manual mode)", () => {
            const card = createTestCard({ hasBuiltInBleed: true });
            const settings = { ...defaultSettings, withBleedTargetMode: "manual" as const };
            expect(getExpectedBleedWidth(card, 3, settings)).toBe(2);
        });

        it("should return global bleed width for cards without built-in bleed (global mode)", () => {
            const card = createTestCard();
            expect(getExpectedBleedWidth(card, 3, defaultSettings)).toBe(3);
        });

        it("should return manual amount for cards without built-in bleed (manual mode)", () => {
            const card = createTestCard({ isUserUpload: true });
            const settings = { ...defaultSettings, noBleedTargetMode: "manual" as const };
            expect(getExpectedBleedWidth(card, 3, settings)).toBe(3);
        });

        it("should use noBleedTargetAmount for non-builtin-bleed cards in manual mode", () => {
            const card = createTestCard();
            const settings: GlobalSettings = {
                ...defaultSettings,
                noBleedTargetMode: "manual" as const,
                noBleedTargetAmount: 1.5,
            };
            expect(getExpectedBleedWidth(card, 3, settings)).toBe(1.5);
        });
    });
});
