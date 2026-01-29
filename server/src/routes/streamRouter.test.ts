import { vi, describe, beforeEach, it, expect } from 'vitest';
import request from "supertest";
import express, { type Express, json } from "express";
import { streamRouter } from "./streamRouter";
import * as getCardImagesPaged from "../utils/getCardImagesPaged";
import type { CardInfo } from "../../../shared/types";

// Partial mock - only mock batchFetchCards, keep lookupCardFromBatch real
vi.mock("../utils/getCardImagesPaged", async (importOriginal) => {
    const actual = await importOriginal<typeof getCardImagesPaged>();
    return {
        ...actual,
        batchFetchCards: vi.fn(),
        getCardsWithImagesForCardInfo: vi.fn(),

    };
});

describe("Stream Router", () => {
    let app: Express;

    beforeEach(() => {
        vi.mocked(getCardImagesPaged.batchFetchCards).mockClear();
        vi.mocked(getCardImagesPaged.getCardsWithImagesForCardInfo).mockClear();
        vi.mocked(getCardImagesPaged.getCardsWithImagesForCardInfo).mockResolvedValue([]);
        app = express();
        app.use(json());
        app.use("/stream", streamRouter);
    });

    it("should stream card data correctly on happy path", async () => {
        // Mock batch returns a Map with the card data
        const mockBatchResults = new Map();
        mockBatchResults.set("sol ring", {
            name: "Sol Ring",
            image_uris: { png: "some_url" },
            colors: [],
            cmc: 1,
            type_line: "Artifact",
            rarity: "uncommon",
            set: "cmd",
            collector_number: "123"
        });
        vi.mocked(getCardImagesPaged.batchFetchCards).mockResolvedValue(mockBatchResults);

        const cardQueries: CardInfo[] = [{ name: "Sol Ring" }];

        const res = await request(app)
            .post("/stream/cards")
            .send({ cardQueries })
            .expect(200);

        const events = res.text.split("\n\n");

        // handshake
        expect(events[0]).toBe('event: handshake\ndata: {"total":1,"cardArt":"art"}');

        // card-found
        const cardFoundData = JSON.parse(events[1].match(/data: (.*)/)![1]);
        expect(events[1].startsWith("event: card-found")).toBe(true);
        expect(cardFoundData.name).toBe("Sol Ring");
        expect(cardFoundData.imageUrls).toEqual(["some_url"]);

        // progress
        expect(events[2]).toBe("event: progress\ndata: {\"processed\":1,\"total\":1}");

        // done
        expect(events[3]).toBe("event: done\ndata: {}");
    });

    it("should handle card-error events gracefully", async () => {
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
        // Return empty map = card not found
        vi.mocked(getCardImagesPaged.batchFetchCards).mockResolvedValue(new Map());

        const cardQueries: CardInfo[] = [{ name: "Unknown Card" }];

        const res = await request(app)
            .post("/stream/cards")
            .send({ cardQueries })
            .expect(200);

        const events = res.text.split("\n\n");

        // handshake
        expect(events[0]).toBe('event: handshake\ndata: {"total":1,"cardArt":"art"}');

        // card-error
        const cardErrorData = JSON.parse(events[1].match(/data: (.*)/)![1]);
        expect(events[1].startsWith("event: card-error")).toBe(true);
        expect(cardErrorData.query.name).toBe("Unknown Card");
        expect(cardErrorData.error).toBe("Card not found on Scryfall.");

        // progress
        expect(events[2]).toBe("event: progress\ndata: {\"processed\":1,\"total\":1}");

        // done
        expect(events[3]).toBe("event: done\ndata: {}");

        consoleErrorSpy.mockRestore();
    });

    it("should handle empty cardQueries array", async () => {
        const cardQueries: CardInfo[] = [];
        const res = await request(app)
            .post("/stream/cards")
            .send({ cardQueries })
            .expect(200);

        const events = res.text.split("\n\n");
        expect(events[0]).toBe('event: handshake\ndata: {"total":0,"cardArt":"art"}');
        expect(events[1]).toBe("event: done\ndata: {}");
    });

    it("should correctly stream cards with multiple faces", async () => {
        const mockBatchResults = new Map();
        mockBatchResults.set("valki, god of lies // tibalt, cosmic impostor", {
            name: "Valki, God of Lies // Tibalt, Cosmic Impostor",
            card_faces: [
                { image_uris: { png: "valki_url" } },
                { image_uris: { png: "tibalt_url" } }
            ],
            colors: ["B", "R"],
            cmc: 7,
            type_line: "Creature // Planeswalker",
            rarity: "mythic",
            set: "khm",
            collector_number: "114"
        });
        vi.mocked(getCardImagesPaged.batchFetchCards).mockResolvedValue(mockBatchResults);

        const cardQueries: CardInfo[] = [{ name: "Valki, God of Lies // Tibalt, Cosmic Impostor" }];

        const res = await request(app)
            .post("/stream/cards")
            .send({ cardQueries })
            .expect(200);

        const events = res.text.split("\n\n").filter((e: string) => e);
        const cardFoundEvent = events.find((e: string) => e.startsWith("event: card-found"));
        const cardFoundData = JSON.parse(cardFoundEvent!.match(/data: (.*)/s)![1]);

        expect(cardFoundData.name).toBe("Valki, God of Lies // Tibalt, Cosmic Impostor");
        expect(cardFoundData.imageUrls).toEqual(["valki_url", "tibalt_url"]);
    });

    it("should handle a mix of found and not-found cards", async () => {
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

        // Only "Sol Ring" is in the batch results
        const mockBatchResults = new Map();
        mockBatchResults.set("sol ring", {
            name: "Sol Ring",
            image_uris: { png: "sol_ring_url" },
            colors: [],
            cmc: 1,
            type_line: "Artifact",
            rarity: "uncommon",
            set: "cmd",
            collector_number: "123"
        });
        vi.mocked(getCardImagesPaged.batchFetchCards).mockResolvedValue(mockBatchResults);

        const cardQueries: CardInfo[] = [{ name: "Sol Ring" }, { name: "Unknown" }];

        const res = await request(app)
            .post("/stream/cards")
            .send({ cardQueries })
            .expect(200);

        const events = res.text.split("\n\n").filter(Boolean);

        // Correctly find all events of a certain type
        const handshake = events.find((e: string) => e.startsWith("event: handshake"));
        const cardFound = events.find((e: string) => e.startsWith("event: card-found"));
        const cardError = events.find((e: string) => e.startsWith("event: card-error"));
        const progressEvents = events.filter((e: string) => e.startsWith("event: progress"));
        const doneEvent = events.find((e: string) => e.startsWith("event: done"));

        expect(handshake).toBe('event: handshake\ndata: {"total":2,"cardArt":"art"}');

        const cardFoundData = JSON.parse(cardFound!.match(/data: (.*)/s)![1]);
        expect(cardFoundData.name).toBe("Sol Ring");

        const cardErrorData = JSON.parse(cardError!.match(/data: (.*)/s)![1]);
        expect(cardErrorData.query.name).toBe("Unknown");

        expect(progressEvents).toHaveLength(2);
        expect(progressEvents[0]).toBe("event: progress\ndata: {\"processed\":1,\"total\":2}");
        expect(progressEvents[1]).toBe("event: progress\ndata: {\"processed\":2,\"total\":2}");

        expect(doneEvent).toBe("event: done\ndata: {}");

        consoleErrorSpy.mockRestore();
    });

    it("should handle invalid body", async () => {
        const res = await request(app)
            .post("/stream/cards")
            .send({}) // Invalid body, missing cardQueries
            .expect(200);

        const events = res.text.split("\n\n").filter(Boolean);
        expect(events[0]).toBe('event: handshake\ndata: {"total":0,"cardArt":"art"}');
        expect(events[1]).toBe("event: done\ndata: {}");
    });

    it("should emit fatal-error on unexpected failure", async () => {
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
        const res = await request(app)
            .post("/stream/cards")
            .send({ cardQueries: [{ name: "Test" }], language: { invalid: true } }) // Invalid language type
            .expect(200);

        const events = res.text.split("\n\n").filter(Boolean);

        const fatalError = events.find((e: string) => e.startsWith("event: fatal-error"));
        expect(fatalError).toBe("event: fatal-error\ndata: {\"message\":\"An unexpected server error occurred.\"}");

        // The 'done' event should not be emitted
        const doneEvent = events.find((e: string) => e.startsWith("event: done"));
        expect(doneEvent).toBeUndefined();

        consoleErrorSpy.mockRestore();
    });

    it("should handle empty image array as card not found", async () => {
        // Card exists but has no images
        const mockBatchResults = new Map();
        mockBatchResults.set("empty card", {
            name: "Empty Card",
            // No image_uris or card_faces
            colors: [],
            cmc: 0,
            type_line: "Unknown",
            rarity: "common"
        });
        vi.mocked(getCardImagesPaged.batchFetchCards).mockResolvedValue(mockBatchResults);

        const cardQueries: CardInfo[] = [{ name: "Empty Card" }];

        const res = await request(app)
            .post("/stream/cards")
            .send({ cardQueries })
            .expect(200);

        const events = res.text.split("\n\n").filter(Boolean);
        const cardError = events.find((e: string) => e.startsWith("event: card-error"));
        const cardErrorData = JSON.parse(cardError!.match(/data: (.*)/)![1]);

        expect(cardErrorData.query.name).toBe("Empty Card");
        expect(cardErrorData.error).toBe("No images found for card on Scryfall.");
    });


});