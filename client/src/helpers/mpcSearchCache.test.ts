import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted to ensure mock is available before vi.mock factory runs
const mockMpcSearchCache = vi.hoisted(() => ({
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    orderBy: vi.fn(),
    clear: vi.fn(),
    bulkDelete: vi.fn(),
}));

// Mock the database
vi.mock("../db", () => ({
    db: {
        mpcSearchCache: mockMpcSearchCache,
    },
}));

import { getCachedMpcSearch, cacheMpcSearch, clearMpcSearchCache, getMpcCacheStats } from "./mpcSearchCache";
import type { MpcAutofillCard } from "./mpcAutofillApi";

// Helper to create mock MPC card
function createMockMpcCard(overrides: Partial<MpcAutofillCard> = {}): MpcAutofillCard {
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

describe("mpcSearchCache", () => {
    const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe("getCachedMpcSearch", () => {
        it("should return null when no cache entry exists", async () => {
            mockMpcSearchCache.get.mockResolvedValue(undefined);

            const result = await getCachedMpcSearch("lightning bolt", "CARD");

            expect(result).toBeNull();
            expect(mockMpcSearchCache.get).toHaveBeenCalledWith(["lightning bolt", "CARD"]);
        });

        it("should return null and delete when cache entry is expired", async () => {
            const now = Date.now();
            const expiredTime = now - CACHE_TTL_MS - 1000; // 1 second past expiry

            mockMpcSearchCache.get.mockResolvedValue({
                query: "test",
                cardType: "CARD",
                cards: [],
                cachedAt: expiredTime,
            });

            const result = await getCachedMpcSearch("test", "CARD");

            expect(result).toBeNull();
            expect(mockMpcSearchCache.delete).toHaveBeenCalledWith(["test", "CARD"]);
        });

        it("should return cached cards and update timestamp when fresh", async () => {
            const now = Date.now();
            const recentTime = now - 1000; // 1 second ago
            const mockCards = [createMockMpcCard()];

            mockMpcSearchCache.get.mockResolvedValue({
                query: "test",
                cardType: "CARD",
                cards: mockCards,
                cachedAt: recentTime,
            });

            const result = await getCachedMpcSearch("test", "CARD");

            expect(result).toEqual(mockCards);
            expect(mockMpcSearchCache.update).toHaveBeenCalledWith(
                ["test", "CARD"],
                { cachedAt: now }
            );
        });

        it("should normalize query to lowercase and trim", async () => {
            mockMpcSearchCache.get.mockResolvedValue(undefined);

            await getCachedMpcSearch("  Lightning BOLT  ", "CARD");

            expect(mockMpcSearchCache.get).toHaveBeenCalledWith(["lightning bolt", "CARD"]);
        });

        it("should return null on database error", async () => {
            mockMpcSearchCache.get.mockRejectedValue(new Error("DB error"));
            const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => { });

            const result = await getCachedMpcSearch("test", "CARD");

            expect(result).toBeNull();
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe("cacheMpcSearch", () => {
        it("should store search results with current timestamp", async () => {
            const now = Date.now();
            const mockCards = [createMockMpcCard()];
            mockMpcSearchCache.count.mockResolvedValue(10);

            await cacheMpcSearch("test", "CARD", mockCards);

            expect(mockMpcSearchCache.put).toHaveBeenCalledWith({
                query: "test",
                cardType: "CARD",
                cards: mockCards,
                cachedAt: now,
            });
        });

        it("should normalize query to lowercase and trim", async () => {
            mockMpcSearchCache.count.mockResolvedValue(10);

            await cacheMpcSearch("  TEST Query  ", "TOKEN", []);

            expect(mockMpcSearchCache.put).toHaveBeenCalledWith(
                expect.objectContaining({ query: "test query" })
            );
        });

        it("should handle database errors gracefully", async () => {
            mockMpcSearchCache.put.mockRejectedValue(new Error("DB error"));
            const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => { });

            // Should not throw
            await cacheMpcSearch("test", "CARD", []);

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe("clearMpcSearchCache", () => {
        it("should clear all cache entries", async () => {
            await clearMpcSearchCache();

            expect(mockMpcSearchCache.clear).toHaveBeenCalled();
        });

        it("should handle database errors gracefully", async () => {
            mockMpcSearchCache.clear.mockRejectedValue(new Error("DB error"));
            const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => { });

            await clearMpcSearchCache();

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe("getMpcCacheStats", () => {
        it("should return count and oldest timestamp", async () => {
            mockMpcSearchCache.count.mockResolvedValue(50);
            mockMpcSearchCache.orderBy.mockReturnValue({
                first: vi.fn().mockResolvedValue({
                    query: "old",
                    cachedAt: 1609459200000, // Jan 1, 2021
                }),
            });

            const stats = await getMpcCacheStats();

            expect(stats).toEqual({
                count: 50,
                oldestTimestamp: 1609459200000,
            });
        });

        it("should return null oldestTimestamp when cache is empty", async () => {
            mockMpcSearchCache.count.mockResolvedValue(0);
            mockMpcSearchCache.orderBy.mockReturnValue({
                first: vi.fn().mockResolvedValue(undefined),
            });

            const stats = await getMpcCacheStats();

            expect(stats).toEqual({
                count: 0,
                oldestTimestamp: null,
            });
        });

        it("should return empty stats on error", async () => {
            mockMpcSearchCache.count.mockRejectedValue(new Error("DB error"));

            const stats = await getMpcCacheStats();

            expect(stats).toEqual({
                count: 0,
                oldestTimestamp: null,
            });
        });
    });
});
