import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    extractArchidektDeckId,
    isArchidektUrl,
    extractCardsFromDeck,
    getDeckSummary,
    fetchArchidektDeck,
    type ArchidektDeck,
} from "./archidektApi";

describe("archidektApi", () => {
    describe("extractArchidektDeckId", () => {
        it("should extract ID from standard URL", () => {
            expect(extractArchidektDeckId("https://archidekt.com/decks/123456")).toBe("123456");
        });

        it("should extract ID from URL with deck name", () => {
            expect(extractArchidektDeckId("https://archidekt.com/decks/123456/my-deck-name")).toBe("123456");
        });

        it("should extract ID from URL with www", () => {
            expect(extractArchidektDeckId("https://www.archidekt.com/decks/123456/deck")).toBe("123456");
        });

        it("should extract ID from URL without protocol", () => {
            expect(extractArchidektDeckId("archidekt.com/decks/789")).toBe("789");
        });

        it("should return null for empty string", () => {
            expect(extractArchidektDeckId("")).toBeNull();
        });

        it("should return null for non-archidekt URL", () => {
            expect(extractArchidektDeckId("https://moxfield.com/decks/123456")).toBeNull();
        });

        it("should return null for invalid archidekt URL", () => {
            expect(extractArchidektDeckId("https://archidekt.com/users/123")).toBeNull();
        });

        it("should return null for URL without deck ID", () => {
            expect(extractArchidektDeckId("https://archidekt.com/decks/")).toBeNull();
        });
    });

    describe("isArchidektUrl", () => {
        it("should return true for valid archidekt deck URL", () => {
            expect(isArchidektUrl("https://archidekt.com/decks/123456")).toBe(true);
        });

        it("should return false for non-archidekt URL", () => {
            expect(isArchidektUrl("https://google.com")).toBe(false);
        });

        it("should return false for empty string", () => {
            expect(isArchidektUrl("")).toBe(false);
        });
    });

    describe("fetchArchidektDeck", () => {
        const mockDeck: ArchidektDeck = {
            id: 123456,
            name: "Test Deck",
            description: "",
            featured: "",
            categories: [],
            cards: [],
        };

        beforeEach(() => {
            vi.stubGlobal("fetch", vi.fn());
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it("should return deck data on success", async () => {
            (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockDeck),
            });

            const result = await fetchArchidektDeck("123456");

            expect(result).toEqual(mockDeck);
            expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/archidekt/decks/123456"));
        });

        it("should throw error on 404 response", async () => {
            (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: "Not Found",
            });

            await expect(fetchArchidektDeck("999999")).rejects.toThrow(
                "Deck not found. It may be private or deleted."
            );
        });

        it("should throw error on other error responses", async () => {
            (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: "Internal Server Error",
            });

            await expect(fetchArchidektDeck("123456")).rejects.toThrow(
                "Failed to fetch deck: 500 Internal Server Error"
            );
        });
    });

    describe("extractCardsFromDeck", () => {
        const mockDeck: ArchidektDeck = {
            id: 123456,
            name: "Test Commander Deck",
            description: "A test deck",
            featured: "",
            categories: [
                { name: "Commander", includedInDeck: true, includedInPrice: true, isPremier: true },
                { name: "Mainboard", includedInDeck: true, includedInPrice: true, isPremier: false },
                { name: "Maybeboard", includedInDeck: false, includedInPrice: false, isPremier: false },
            ],
            cards: [
                {
                    quantity: 1,
                    categories: ["Commander"],
                    card: {
                        id: 1,
                        uid: "scryfall-uuid-1",
                        artist: "Test Artist",
                        collectorNumber: "123",
                        edition: { editioncode: "CMM", editionname: "Commander Masters" },
                        oracleCard: {
                            id: 1,
                            name: "Sol Ring",
                            cmc: 1,
                            colorIdentity: [],
                            colors: [],
                            layout: "normal",
                            types: ["Artifact"],
                        },
                    },
                },
                {
                    quantity: 4,
                    categories: ["Mainboard"],
                    card: {
                        id: 2,
                        uid: "scryfall-uuid-2",
                        artist: "Another Artist",
                        collectorNumber: "456",
                        edition: { editioncode: "M21", editionname: "Core Set 2021" },
                        oracleCard: {
                            id: 2,
                            name: "Counterspell",
                            cmc: 2,
                            colorIdentity: ["U"],
                            colors: ["U"],
                            layout: "normal",
                            types: ["Instant"],
                        },
                    },
                },
                {
                    quantity: 2,
                    categories: ["Maybeboard"],
                    card: {
                        id: 3,
                        uid: "scryfall-uuid-3",
                        artist: "Third Artist",
                        collectorNumber: "789",
                        edition: { editioncode: "2XM", editionname: "Double Masters" },
                        oracleCard: {
                            id: 3,
                            name: "Lightning Bolt",
                            cmc: 1,
                            colorIdentity: ["R"],
                            colors: ["R"],
                            layout: "normal",
                            types: ["Instant"],
                        },
                    },
                },
            ],
        };

        it("should extract cards from all categories", () => {
            const cards = extractCardsFromDeck(mockDeck);
            expect(cards).toHaveLength(3); // Including maybeboard for category filtering
        });

        it("should include cards from maybeboard with category label", () => {
            const cards = extractCardsFromDeck(mockDeck);
            const maybeboardCard = cards.find((c) => c.name === "Lightning Bolt");
            expect(maybeboardCard).toBeDefined();
            expect(maybeboardCard?.category).toBe("Maybeboard");
        });

        it("should preserve quantity", () => {
            const cards = extractCardsFromDeck(mockDeck);
            const counterspell = cards.find((c) => c.name === "Counterspell");
            expect(counterspell?.quantity).toBe(4);
        });

        it("should extract set code in lowercase", () => {
            const cards = extractCardsFromDeck(mockDeck);
            const solRing = cards.find((c) => c.name === "Sol Ring");
            expect(solRing?.set).toBe("cmm");
        });

        it("should identify Commander category correctly", () => {
            const cards = extractCardsFromDeck(mockDeck);
            const solRing = cards.find((c) => c.name === "Sol Ring");
            expect(solRing?.category).toBe("Commander");
        });

        it("should include scryfall UUID", () => {
            const cards = extractCardsFromDeck(mockDeck);
            const solRing = cards.find((c) => c.name === "Sol Ring");
            expect(solRing?.scryfallId).toBe("scryfall-uuid-1");
        });

        it("should detect token cards from tokens category", () => {
            const deckWithToken: ArchidektDeck = {
                id: 123456,
                name: "Test Deck",
                description: "",
                featured: "",
                categories: [{ name: "Tokens", includedInDeck: true, includedInPrice: false, isPremier: false }],
                cards: [
                    {
                        quantity: 1,
                        categories: ["Tokens"],
                        card: {
                            id: 1,
                            uid: "token-uuid",
                            artist: "",
                            collectorNumber: "1",
                            edition: { editioncode: "T2X", editionname: "Tokens" },
                            oracleCard: { id: 1, name: "Treasure", cmc: 0, colorIdentity: [], colors: [], layout: "token", types: ["Token", "Artifact"] },
                        },
                    },
                ],
            };

            const cards = extractCardsFromDeck(deckWithToken);
            expect(cards[0].isToken).toBe(true);
        });

        it("should not mark regular cards as tokens", () => {
            const cards = extractCardsFromDeck(mockDeck);
            const solRing = cards.find((c) => c.name === "Sol Ring");
            // Sol Ring is in Commander category, not Tokens
            expect(solRing?.isToken).toBe(false);
        });
    });

    describe("getDeckSummary", () => {
        const mockDeck: ArchidektDeck = {
            id: 123456,
            name: "My EDH Deck",
            description: "",
            featured: "",
            categories: [
                { name: "Commander", includedInDeck: true, includedInPrice: true, isPremier: true },
                { name: "Mainboard", includedInDeck: true, includedInPrice: true, isPremier: false },
            ],
            cards: [
                {
                    quantity: 1,
                    categories: ["Commander"],
                    card: {
                        id: 1,
                        uid: "uuid-1",
                        artist: "",
                        collectorNumber: "1",
                        edition: { editioncode: "SET", editionname: "Set" },
                        oracleCard: { id: 1, name: "Commander", cmc: 3, colorIdentity: [], colors: [], layout: "normal", types: [] },
                    },
                },
                {
                    quantity: 99,
                    categories: ["Mainboard"],
                    card: {
                        id: 2,
                        uid: "uuid-2",
                        artist: "",
                        collectorNumber: "2",
                        edition: { editioncode: "SET", editionname: "Set" },
                        oracleCard: { id: 2, name: "Other Cards", cmc: 1, colorIdentity: [], colors: [], layout: "normal", types: [] },
                    },
                },
            ],
        };

        it("should return deck name", () => {
            const summary = getDeckSummary(mockDeck);
            expect(summary.name).toBe("My EDH Deck");
        });

        it("should calculate total card count", () => {
            const summary = getDeckSummary(mockDeck);
            expect(summary.cardCount).toBe(100); // 1 commander + 99 mainboard
        });
    });
});
