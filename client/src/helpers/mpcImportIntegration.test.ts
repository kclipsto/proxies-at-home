import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to ensure mocks are available before vi.mock factory runs
const mockBatchSearchMpcAutofill = vi.hoisted(() => vi.fn());
const mockGetMpcAutofillImageUrl = vi.hoisted(() => vi.fn());

vi.mock("./mpcAutofillApi", () => ({
    batchSearchMpcAutofill: mockBatchSearchMpcAutofill,
    getMpcAutofillImageUrl: mockGetMpcAutofillImageUrl,
}));

vi.mock("../store", () => ({
    useSettingsStore: {
        getState: () => ({
            favoriteMpcSources: [],
            favoriteMpcTags: [],
        }),
    },
}));

import { findBestMpcMatches, parseMpcCardLogic } from "./mpcImportIntegration";
import type { CardInfo } from "./streamCards";
import type { MpcAutofillCard } from "./mpcAutofillApi";

// Helper to create mock MPC card
function createMpcCard(overrides: Partial<MpcAutofillCard> = {}): MpcAutofillCard {
    return {
        identifier: "test-id",
        name: "Test Card",
        dpi: 800,
        extension: "png",
        smallThumbnailUrl: "https://example.com/small.png",
        mediumThumbnailUrl: "https://example.com/medium.png",
        source: "test",
        sourceName: "Test Source",
        tags: [],
        size: 1000000,
        ...overrides,
    };
}

// Helper to create card info
function createCardInfo(name: string): CardInfo {
    return { name } as CardInfo;
}

describe("mpcImportIntegration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetMpcAutofillImageUrl.mockImplementation((id: string) => `https://example.com/mpc/${id}`);
    });

    describe("findBestMpcMatches", () => {
        it("should return empty array when no cards match", async () => {
            mockBatchSearchMpcAutofill.mockResolvedValue({});

            const result = await findBestMpcMatches([createCardInfo("Lightning Bolt")]);

            expect(result).toEqual([]);
        });

        it("should return matches for found cards", async () => {
            const mpcCard = createMpcCard({ identifier: "bolt-123", name: "Lightning Bolt" });
            mockBatchSearchMpcAutofill.mockResolvedValue({
                "Lightning Bolt": [mpcCard],
            });

            const result = await findBestMpcMatches([createCardInfo("Lightning Bolt")]);

            expect(result).toHaveLength(1);
            expect(result[0].mpcCard).toEqual(mpcCard);
            expect(result[0].imageUrl).toBe("https://example.com/mpc/bolt-123");
        });

        it("should handle multiple cards with same name", async () => {
            const mpcCard = createMpcCard({ identifier: "bolt-123" });
            mockBatchSearchMpcAutofill.mockResolvedValue({
                "Lightning Bolt": [mpcCard],
            });

            const infos = [
                createCardInfo("Lightning Bolt"),
                createCardInfo("Lightning Bolt"),
            ];

            const result = await findBestMpcMatches(infos);

            expect(result).toHaveLength(2);
            // Should have deduplicated the search query
            expect(mockBatchSearchMpcAutofill).toHaveBeenCalledWith(["Lightning Bolt"]);
        });

        it("should pick card with highest DPI when multiple matches", async () => {
            const lowDpi = createMpcCard({ identifier: "low", dpi: 300 });
            const highDpi = createMpcCard({ identifier: "high", dpi: 1200 });
            mockBatchSearchMpcAutofill.mockResolvedValue({
                "Test Card": [lowDpi, highDpi],
            });

            const result = await findBestMpcMatches([createCardInfo("Test Card")]);

            expect(result[0].mpcCard.identifier).toBe("high");
        });
    });

    describe("parseMpcCardLogic", () => {
        it("should parse card name from MPC format with set in brackets", () => {
            const mpcCard = createMpcCard({ name: "Forest [THB] {254}" });

            const result = parseMpcCardLogic(mpcCard);

            expect(result.name).toBe("Forest");
            expect(result.hasBuiltInBleed).toBe(true);
            expect(result.needsEnrichment).toBe(true);
        });

        it("should parse card name from MPC format with parentheses", () => {
            const mpcCard = createMpcCard({ name: "Lightning Bolt (M21)" });

            const result = parseMpcCardLogic(mpcCard);

            expect(result.name).toBe("Lightning Bolt");
        });

        it("should parse card name with curly braces", () => {
            const mpcCard = createMpcCard({ name: "Sol Ring {C21}" });

            const result = parseMpcCardLogic(mpcCard);

            expect(result.name).toBe("Sol Ring");
        });

        it("should handle simple card name without extra info", () => {
            const mpcCard = createMpcCard({ name: "Lightning Bolt" });

            const result = parseMpcCardLogic(mpcCard);

            expect(result.name).toBe("Lightning Bolt");
        });

        it("should fallback to MPC name if parsing fails", () => {
            const mpcCard = createMpcCard({ name: "" });

            const result = parseMpcCardLogic(mpcCard, "Original Name");

            expect(result.name).toBe("Original Name");
        });

        it("should handle empty name", () => {
            const mpcCard = createMpcCard({ name: "" });

            const result = parseMpcCardLogic(mpcCard);

            expect(result.name).toBe("");
        });

        it("should trim whitespace from parsed name", () => {
            const mpcCard = createMpcCard({ name: "  Forest  [SET]" });

            const result = parseMpcCardLogic(mpcCard);

            expect(result.name).toBe("Forest");
        });
    });
});
