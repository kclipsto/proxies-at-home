import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies with vi.hoisted
const mockGetMpcImageUrl = vi.hoisted(() => vi.fn());
const mockGetCachedMpcSearch = vi.hoisted(() => vi.fn());
const mockCacheMpcSearch = vi.hoisted(() => vi.fn());

vi.mock("./mpc", () => ({
    getMpcImageUrl: mockGetMpcImageUrl,
}));

vi.mock("./mpcSearchCache", () => ({
    getCachedMpcSearch: mockGetCachedMpcSearch,
    cacheMpcSearch: mockCacheMpcSearch,
}));

import {
    getMpcAutofillImageUrl,
    extractMpcIdentifierFromImageId,
    searchMpcAutofill,
    batchSearchMpcAutofill,
} from "./mpcAutofillApi";

import { parseMpcCardName } from "./mpcUtils";

describe("mpcAutofillApi", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal("fetch", vi.fn());
    });

    describe("getMpcAutofillImageUrl", () => {
        it("should return the MPC image URL for an identifier", () => {
            mockGetMpcImageUrl.mockReturnValue("https://example.com/mpc/abc123");

            const result = getMpcAutofillImageUrl("abc123");

            expect(result).toBe("https://example.com/mpc/abc123");
            expect(mockGetMpcImageUrl).toHaveBeenCalledWith("abc123", "full");
        });

        it("should return empty string if getMpcImageUrl returns null", () => {
            mockGetMpcImageUrl.mockReturnValue(null);

            const result = getMpcAutofillImageUrl("abc123");

            expect(result).toBe("");
        });
    });

    describe("extractMpcIdentifierFromImageId", () => {
        it("should return null for undefined imageId", () => {
            expect(extractMpcIdentifierFromImageId(undefined)).toBeNull();
        });

        it("should return null for empty string", () => {
            expect(extractMpcIdentifierFromImageId("")).toBeNull();
        });

        it("should extract identifier from full MPC URL", () => {
            const imageId = "/api/cards/images/mpc?id=abc123456789012345";
            expect(extractMpcIdentifierFromImageId(imageId)).toBe("abc123456789012345");
        });

        it("should extract identifier from MPC URL with additional params", () => {
            const imageId = "/api/cards/images/mpc?id=abc123456789012345&other=param";
            expect(extractMpcIdentifierFromImageId(imageId)).toBe("abc123456789012345");
        });

        it("should return bare identifier if it matches MPC format", () => {
            const bareId = "abc123456789012345678"; // 21+ alphanumeric chars
            expect(extractMpcIdentifierFromImageId(bareId)).toBe(bareId);
        });

        it("should allow underscores and hyphens in identifier", () => {
            const bareId = "abc_123-456789012345";
            expect(extractMpcIdentifierFromImageId(bareId)).toBe(bareId);
        });

        it("should return null for Scryfall URLs", () => {
            const scryfallUrl = "https://cards.scryfall.io/png/front/a/b/abc123.png";
            expect(extractMpcIdentifierFromImageId(scryfallUrl)).toBeNull();
        });

        it("should return null for short identifiers", () => {
            const shortId = "abc123"; // Less than 15 chars
            expect(extractMpcIdentifierFromImageId(shortId)).toBeNull();
        });
    });

    describe("parseMpcCardName", () => {
        it("should extract name before brackets", () => {
            expect(parseMpcCardName("Forest [THB] {254}")).toBe("Forest");
        });

        it("should extract name before parentheses", () => {
            expect(parseMpcCardName("Lightning Bolt (M21)")).toBe("Lightning Bolt");
        });

        it("should extract name before curly braces", () => {
            expect(parseMpcCardName("Sol Ring {C21}")).toBe("Sol Ring");
        });

        it("should handle name without extra info", () => {
            expect(parseMpcCardName("Lightning Bolt")).toBe("Lightning Bolt");
        });

        it("should trim whitespace", () => {
            expect(parseMpcCardName("  Forest  [SET]")).toBe("Forest");
        });

        it("should return fallback for empty name", () => {
            expect(parseMpcCardName("", "Fallback")).toBe("Fallback");
        });

        it("should return empty string if no fallback and empty name", () => {
            expect(parseMpcCardName("")).toBe("");
        });

        it("should handle complex MPC format", () => {
            expect(parseMpcCardName("Card Name [SET] (V2) {123}")).toBe("Card Name");
        });

        it("should return trimmed MPC name if regex doesn't match", () => {
            // Edge case: name starts with special character
            const result = parseMpcCardName("Test Card");
            expect(result).toBe("Test Card");
        });
    });

    describe("searchMpcAutofill", () => {
        it("should parse card names before returning results", async () => {
            // Setup: API returns unparsed names
            const mockResponse = {
                cards: [
                    { identifier: "id1", name: "Deflecting Swat (Borderless Greg Staples)", dpi: 300, tags: [], sourceName: "Test", source: "test", extension: "png", size: 1000, smallThumbnailUrl: "", mediumThumbnailUrl: "" },
                    { identifier: "id2", name: "Deflecting Swat {311} (Patrick Gañas) (Elemental Frame)", dpi: 300, tags: [], sourceName: "Test", source: "test", extension: "png", size: 1000, smallThumbnailUrl: "", mediumThumbnailUrl: "" },
                ],
            };
            mockGetCachedMpcSearch.mockResolvedValue(null); // No cache hit
            vi.mocked(fetch).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            } as Response);

            const results = await searchMpcAutofill("Deflecting Swat");

            // Verify returned names are parsed
            expect(results[0].name).toBe("Deflecting Swat");
            expect(results[1].name).toBe("Deflecting Swat");
        });

        it("should cache parsed names, not unparsed names", async () => {
            const mockResponse = {
                cards: [
                    { identifier: "id1", name: "Sol Ring {C21} (Artist Name)", dpi: 300, tags: [], sourceName: "Test", source: "test", extension: "png", size: 1000, smallThumbnailUrl: "", mediumThumbnailUrl: "" },
                ],
            };
            mockGetCachedMpcSearch.mockResolvedValue(null);
            vi.mocked(fetch).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            } as Response);

            await searchMpcAutofill("Sol Ring");

            // Verify cacheMpcSearch was called with parsed names
            expect(mockCacheMpcSearch).toHaveBeenCalled();
            const cachedCards = mockCacheMpcSearch.mock.calls[0][2];
            expect(cachedCards[0].name).toBe("Sol Ring");
        });

        it("should return empty array for empty query", async () => {
            const results = await searchMpcAutofill("");
            expect(results).toEqual([]);
        });
    });

    describe("batchSearchMpcAutofill", () => {
        it("should parse card names before returning results", async () => {
            const mockResponse = {
                results: {
                    "Lightning Bolt": [
                        { identifier: "id1", name: "Lightning Bolt (M21) (Artist)", dpi: 300, tags: [], sourceName: "Test", source: "test", extension: "png", size: 1000, smallThumbnailUrl: "", mediumThumbnailUrl: "" },
                    ],
                    "Forest": [
                        { identifier: "id2", name: "Forest [THB] {254}", dpi: 300, tags: [], sourceName: "Test", source: "test", extension: "png", size: 1000, smallThumbnailUrl: "", mediumThumbnailUrl: "" },
                    ],
                },
            };
            mockGetCachedMpcSearch.mockResolvedValue(null);
            vi.mocked(fetch).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            } as Response);

            const results = await batchSearchMpcAutofill(["Lightning Bolt", "Forest"]);

            // Verify returned names are parsed
            expect(results["Lightning Bolt"][0].name).toBe("Lightning Bolt");
            expect(results["Forest"][0].name).toBe("Forest");
        });

        it("should cache parsed names, not unparsed names", async () => {
            const mockResponse = {
                results: {
                    "Dark Ritual": [
                        { identifier: "id1", name: "Dark Ritual {311} (Borderless)", dpi: 300, tags: [], sourceName: "Test", source: "test", extension: "png", size: 1000, smallThumbnailUrl: "", mediumThumbnailUrl: "" },
                    ],
                },
            };
            mockGetCachedMpcSearch.mockResolvedValue(null);
            vi.mocked(fetch).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            } as Response);

            await batchSearchMpcAutofill(["Dark Ritual"]);

            // Verify cacheMpcSearch was called with parsed names
            expect(mockCacheMpcSearch).toHaveBeenCalled();
            const cachedCards = mockCacheMpcSearch.mock.calls[0][2];
            expect(cachedCards[0].name).toBe("Dark Ritual");
        });

        it("should return empty object for empty queries array", async () => {
            const results = await batchSearchMpcAutofill([]);
            expect(results).toEqual({});
        });
    });
});
