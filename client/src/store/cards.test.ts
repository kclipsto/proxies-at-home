import { describe, it, expect, beforeEach, vi, type Mock} from "vitest";
import { useCardsStore } from "./cards";
import { db } from "../db";

// Mock the db
vi.mock("../db", () => ({
  db: {
    transaction: vi.fn(),
    cards: {
      clear: vi.fn(),
    },
    images: {
      clear: vi.fn(),
    },
  },
}));

describe("useCardsStore", () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  it("should clear all cards and images", async () => {
    const { clearAllCardsAndImages } = useCardsStore.getState();

    // Mock the transaction implementation
    (db.transaction as Mock).mockImplementation(async (...args: unknown[]) => {
        const txFunc = args.pop() as () => Promise<void>;
        await txFunc();
    });

    await clearAllCardsAndImages();

    expect(db.transaction).toHaveBeenCalledWith(
      "rw",
      db.cards,
      db.images,
      expect.any(Function)
    );
    expect(db.cards.clear).toHaveBeenCalledTimes(1);
    expect(db.images.clear).toHaveBeenCalledTimes(1);
  });
});
