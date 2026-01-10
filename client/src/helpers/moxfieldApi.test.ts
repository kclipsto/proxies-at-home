import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    extractMoxfieldDeckId,
    isMoxfieldUrl,
    fetchMoxfieldDeck,
    extractCardsFromDeck,
    getDeckSummary,
    type MoxfieldDeck,
    type MoxfieldDeckCard,
} from "./moxfieldApi";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper to create mock deck card
function createDeckCard(
    name: string,
    quantity = 1,
    cn = "1",
    set = "ABC",
    boardType = "mainboard",
    type_line = "Creature"
): MoxfieldDeckCard {
    return {
        quantity,
        boardType,
        finish: "nonFoil",
        isFoil: false,
        card: {
            id: `id-${name}`,
            uniqueCardId: `unique-${name}`,
            scryfall_id: `scryfall-${name}`,
            set,
            set_name: "Test Set",
            name,
            cn,
            layout: "normal",
            type_line,
        },
    };
}

// Helper to create mock deck
function createMockDeck(overrides: Partial<MoxfieldDeck> = {}): MoxfieldDeck {
    return {
        id: "deck-id",
        name: "Test Deck",
        format: "commander",
        publicId: "abc123",
        publicUrl: "https://moxfield.com/decks/abc123",
        mainboard: {},
        sideboard: {},
        maybeboard: {},
        commanders: {},
        companions: {},
        mainboardCount: 0,
        sideboardCount: 0,
        maybeboardCount: 0,
        commandersCount: 0,
        companionsCount: 0,
        ...overrides,
    };
}

describe("moxfieldApi", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("extractMoxfieldDeckId", () => {
        it("should extract deck ID from standard URL", () => {
            const url = "https://moxfield.com/decks/ly1m26eBokyw3NnYO-yYNA";
            expect(extractMoxfieldDeckId(url)).toBe("ly1m26eBokyw3NnYO-yYNA");
        });

        it("should extract deck ID from www URL", () => {
            const url = "https://www.moxfield.com/decks/abc123_xyz-789";
            expect(extractMoxfieldDeckId(url)).toBe("abc123_xyz-789");
        });

        it("should extract deck ID without protocol", () => {
            const url = "moxfield.com/decks/abc123";
            expect(extractMoxfieldDeckId(url)).toBe("abc123");
        });

        it("should return null for non-Moxfield URL", () => {
            expect(extractMoxfieldDeckId("https://example.com/deck/123")).toBeNull();
        });

        it("should return null for empty string", () => {
            expect(extractMoxfieldDeckId("")).toBeNull();
        });

        it("should handle URL with trailing content", () => {
            const url = "https://moxfield.com/decks/abc123?view=list";
            expect(extractMoxfieldDeckId(url)).toBe("abc123");
        });
    });

    describe("isMoxfieldUrl", () => {
        it("should return true for valid Moxfield URL", () => {
            expect(isMoxfieldUrl("https://moxfield.com/decks/abc123")).toBe(true);
        });

        it("should return false for non-Moxfield URL", () => {
            expect(isMoxfieldUrl("https://archidekt.com/decks/123")).toBe(false);
        });

        it("should return false for empty string", () => {
            expect(isMoxfieldUrl("")).toBe(false);
        });
    });

    describe("fetchMoxfieldDeck", () => {
        it("should fetch and return deck data", async () => {
            const mockDeck = createMockDeck({ name: "Fetched Deck" });
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockDeck),
            });

            const result = await fetchMoxfieldDeck("abc123");

            expect(result.name).toBe("Fetched Deck");
            expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/api/moxfield/decks/abc123"));
        });

        it("should throw error for 404 response", async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
                statusText: "Not Found",
            });

            await expect(fetchMoxfieldDeck("notfound")).rejects.toThrow("Deck not found");
        });

        it("should throw error for other HTTP errors", async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: "Server Error",
            });

            await expect(fetchMoxfieldDeck("abc123")).rejects.toThrow("Failed to fetch deck: 500");
        });
    });

    describe("extractCardsFromDeck", () => {
        it("should extract cards from mainboard", () => {
            const deck = createMockDeck({
                mainboard: {
                    "card1": createDeckCard("Lightning Bolt", 4),
                },
            });

            const cards = extractCardsFromDeck(deck);

            expect(cards).toHaveLength(1);
            expect(cards[0].name).toBe("Lightning Bolt");
            expect(cards[0].quantity).toBe(4);
            expect(cards[0].category).toBe("Mainboard");
        });

        it("should extract cards from all boards", () => {
            const deck = createMockDeck({
                commanders: { "cmd1": createDeckCard("Commander Card", 1, "1", "ABC", "commanders") },
                companions: { "comp1": createDeckCard("Companion Card", 1, "1", "ABC", "companions") },
                mainboard: { "main1": createDeckCard("Main Card", 1, "1", "ABC", "mainboard") },
                sideboard: { "side1": createDeckCard("Side Card", 1, "1", "ABC", "sideboard") },
                maybeboard: { "maybe1": createDeckCard("Maybe Card", 1, "1", "ABC", "maybeboard") },
            });

            const cards = extractCardsFromDeck(deck);

            expect(cards).toHaveLength(5);
            const categories = cards.map(c => c.category);
            expect(categories).toContain("Commander");
            expect(categories).toContain("Companion");
            expect(categories).toContain("Mainboard");
            expect(categories).toContain("Sideboard");
            expect(categories).toContain("Maybeboard");
        });

        it("should lowercase set codes", () => {
            const deck = createMockDeck({
                mainboard: {
                    "card1": createDeckCard("Test Card", 1, "123", "DOM"),
                },
            });

            const cards = extractCardsFromDeck(deck);

            expect(cards[0].set).toBe("dom");
        });

        it("should include scryfall ID", () => {
            const deck = createMockDeck({
                mainboard: {
                    "card1": createDeckCard("Test Card"),
                },
            });

            const cards = extractCardsFromDeck(deck);

            expect(cards[0].scryfallId).toBe("scryfall-Test Card");
        });

        it("should detect token cards from type_line", () => {
            const deck = createMockDeck({
                mainboard: {
                    "token1": createDeckCard("Treasure", 1, "1", "ABC", "mainboard", "Token Artifact — Treasure"),
                },
            });

            const cards = extractCardsFromDeck(deck);

            expect(cards[0].isToken).toBe(true);
        });

        it("should not mark regular cards as tokens", () => {
            const deck = createMockDeck({
                mainboard: {
                    "card1": createDeckCard("Sol Ring", 1, "1", "ABC", "mainboard", "Artifact"),
                },
            });

            const cards = extractCardsFromDeck(deck);

            expect(cards[0].isToken).toBe(false);
        });

        it("should detect tokens with Token in type_line (case insensitive)", () => {
            const deck = createMockDeck({
                mainboard: {
                    "token1": createDeckCard("Human Soldier", 1, "1", "ABC", "mainboard", "TOKEN CREATURE — Human Soldier"),
                },
            });

            const cards = extractCardsFromDeck(deck);

            expect(cards[0].isToken).toBe(true);
        });

        it("should handle empty deck", () => {
            const deck = createMockDeck();

            const cards = extractCardsFromDeck(deck);

            expect(cards).toHaveLength(0);
        });
    });

    describe("getDeckSummary", () => {
        it("should return deck name and total card count", () => {
            const deck = createMockDeck({
                name: "My Commander Deck",
                mainboard: {
                    "card1": createDeckCard("Card 1", 4),
                    "card2": createDeckCard("Card 2", 2),
                },
                commanders: {
                    "cmd1": createDeckCard("Commander", 1),
                },
            });

            const summary = getDeckSummary(deck);

            expect(summary.name).toBe("My Commander Deck");
            expect(summary.cardCount).toBe(7); // 4 + 2 + 1
        });

        it("should return 0 for empty deck", () => {
            const deck = createMockDeck({ name: "Empty Deck" });

            const summary = getDeckSummary(deck);

            expect(summary.cardCount).toBe(0);
        });
    });
});
