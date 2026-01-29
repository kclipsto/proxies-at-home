/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock dependencies
vi.mock("../db/db.js", () => ({
  getDatabase: vi.fn(() => ({
    prepare: vi.fn(() => ({
      get: vi.fn(() => undefined),
      run: vi.fn(),
    })),
  })),
}));

vi.mock("../utils/debug.js", () => ({
  debugLog: vi.fn(),
}));

// Mock axios - not strictly needed as we mock getCardsWithImagesForCardInfo, but scryfallRouter imports it
vi.mock("axios", () => {
  const mockAxios = {
    create: vi.fn(() => mockAxios),
    get: vi.fn(),
    isAxiosError: vi.fn((err) => err?.isAxiosError === true),
  };
  return { default: mockAxios };
});

// Mock getCardsWithImagesForCardInfo
vi.mock("../utils/getCardImagesPaged.js", () => ({
  getCardsWithImagesForCardInfo: vi.fn(),
}));

import { scryfallRouter } from "./scryfallRouter.js";
import { getCardsWithImagesForCardInfo } from "../utils/getCardImagesPaged.js";

describe("scryfallRouter - /prints", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use("/api/scryfall", scryfallRouter);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should populate faceName for single-faced cards when mixed with DFCs", async () => {
    // Mock data representing a mixed result (e.g., "Treasure" token)
    const mockPrints: Partial<any>[] = [
      {
        // Single-faced Treasure Token
        name: "Treasure",
        set: "tcmr",
        collector_number: "11",
        rarity: "common",
        lang: "en",
        image_uris: { png: "https://example.com/treasure.png" },
      },
      {
        // DFC: Dinosaur // Treasure
        name: "Dinosaur // Treasure",
        set: "trix",
        collector_number: "2",
        rarity: "common",
        lang: "en",
        card_faces: [
          {
            name: "Dinosaur",
            image_uris: { png: "https://example.com/dinosaur.png" },
          },
          {
            name: "Treasure",
            image_uris: { png: "https://example.com/treasure_back.png" },
          },
        ],
      },
    ];

    vi.mocked(getCardsWithImagesForCardInfo).mockResolvedValue(
      mockPrints as unknown as any
    );

    const res = await request(app).get("/api/scryfall/prints?name=Treasure");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3); // 1 single-faced + 2 faces of DFC

    const prints = res.body.prints;

    // Verify single-faced card has faceName populated
    const singleFaced = prints.find(
      (p: { imageUrl: string; faceName?: string }) =>
        p.imageUrl === "https://example.com/treasure.png"
    );
    expect(singleFaced).toBeDefined();
    expect(singleFaced.faceName).toBe("Treasure");

    // Verify DFC faces
    const dinosaurFace = prints.find(
      (p: { imageUrl: string; faceName?: string }) => p.faceName === "Dinosaur"
    );
    expect(dinosaurFace).toBeDefined();
    expect(dinosaurFace.imageUrl).toBe("https://example.com/dinosaur.png");

    const treasureFace = prints.find(
      (p: { imageUrl: string; faceName?: string }) =>
        p.imageUrl === "https://example.com/treasure_back.png"
    );
    expect(treasureFace).toBeDefined();
    expect(treasureFace.faceName).toBe("Treasure");
  });

  it("should handle only single-faced cards correctly", async () => {
    const mockPrints = [
      {
        name: "Sol Ring",
        set: "cmd",
        collector_number: "1",
        image_uris: { png: "https://example.com/solring.png" },
      },
    ];
    vi.mocked(getCardsWithImagesForCardInfo).mockResolvedValue(
      mockPrints as unknown as any
    );

    const res = await request(app).get("/api/scryfall/prints?name=Sol Ring");

    expect(res.status).toBe(200);
    expect(res.body.prints[0].faceName).toBe("Sol Ring");
  });
});
