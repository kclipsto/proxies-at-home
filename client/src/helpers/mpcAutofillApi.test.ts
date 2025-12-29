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
    parseMpcCardName,
} from "./mpcAutofillApi";

describe("mpcAutofillApi", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("getMpcAutofillImageUrl", () => {
        it("should return the MPC image URL for an identifier", () => {
            mockGetMpcImageUrl.mockReturnValue("https://example.com/mpc/abc123");

            const result = getMpcAutofillImageUrl("abc123");

            expect(result).toBe("https://example.com/mpc/abc123");
            expect(mockGetMpcImageUrl).toHaveBeenCalledWith("abc123");
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
});
