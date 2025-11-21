import { vi, describe, beforeEach, afterEach, it, expect, type Mock } from 'vitest';
import axios from "axios";
import {
  getImagesForCardInfo,
  getCardDataForCardInfo,
  getScryfallPngImagesForCard,
  getScryfallPngImagesForCardPrints,
} from "./getCardImagesPaged";

vi.mock("axios", () => {
  const mockGet = vi.fn();
  const mockInstance = { get: mockGet };
  const mockCreate = vi.fn(() => mockInstance);
  return {
    create: mockCreate,
    get: mockGet,
    default: {
      create: mockCreate,
      get: mockGet,
    },
  };
});

// Access the mocked instance's get method
// Since create() returns the same mockInstance, we can grab it here.
const mockedAxiosInstance = axios.create() as unknown as { get: Mock };
const mockedAxios = {
  get: mockedAxiosInstance.get,
  create: axios.create as Mock,
};

describe("getCardImagesPaged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.create.mockClear();
    mockedAxios.get.mockReset();
  });

  // Mock Scryfall API response
  const mockScryfallResponse = (data: unknown[], has_more = false, next_page = "") => ({
    data: {
      object: "list",
      total_cards: data.length,
      has_more,
      next_page,
      data,
    },
  });

  const singleFaceCard = {
    name: "Sol Ring",
    image_uris: { png: "sol_ring_url" },
  };

  const doubleFaceCard = {
    name: "Valki // Tibalt",
    card_faces: [
      { image_uris: { png: "valki_url" } },
      { image_uris: { png: "tibalt_url" } },
    ],
  };

  describe("getImagesForCardInfo", () => {
    it("should fetch image by exact print first", async () => {
      mockedAxios.get.mockResolvedValue(mockScryfallResponse([singleFaceCard]));
      const cardInfo = { name: "Sol Ring", set: "cmr", number: "332" };
      await getImagesForCardInfo(cardInfo, "prints");

      const expectedUrl =
        "https://api.scryfall.com/cards/search?q=set%3Acmr%20number%3A332%20name%3A%22Sol%20Ring%22%20include%3Aextras%20unique%3Aprints%20lang%3Aen";
      expect(mockedAxios.get).toHaveBeenCalledWith(expectedUrl);
    });

    it("should fall back to name-only query if set+number fails", async () => {
      mockedAxios.get
        .mockResolvedValueOnce(mockScryfallResponse([])) // Exact fails
        .mockResolvedValueOnce(mockScryfallResponse([singleFaceCard])); // name-only succeeds

      const cardInfo = { name: "Sol Ring", set: "cmr", number: "999" };
      await getImagesForCardInfo(cardInfo, "prints");

      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      // First call for set+number+name
      expect(mockedAxios.get.mock.calls[0]?.[0]).toEqual(expect.stringContaining("set%3Acmr%20number%3A999"));
      // Second call for name-only
      expect(mockedAxios.get.mock.calls[1]?.[0]).toEqual(expect.stringContaining("!%22Sol%20Ring%22"));
    });

    it("should fall back to name-only query when set is not provided", async () => {
      mockedAxios.get.mockResolvedValueOnce(mockScryfallResponse([singleFaceCard])); // Name-only succeeds

      const cardInfo = { name: "Sol Ring", number: "999" };
      await getImagesForCardInfo(cardInfo, "prints");

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      expect(mockedAxios.get.mock.calls[0]?.[0]).toEqual(expect.stringContaining("!%22Sol%20Ring%22"));
    });

    it("should respect language preference", async () => {
      mockedAxios.get.mockResolvedValue(mockScryfallResponse([singleFaceCard]));
      const cardInfo = { name: "Sol Ring" };
      await getImagesForCardInfo(cardInfo, "art", "de");

      expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining("lang%3Ade"));
    });

    it("should fall back to english if language not found", async () => {
      mockedAxios.get
        .mockResolvedValueOnce(mockScryfallResponse([])) // German fails
        .mockResolvedValueOnce(mockScryfallResponse([singleFaceCard])); // English succeeds

      const cardInfo = { name: "Sol Ring" };
      await getImagesForCardInfo(cardInfo, "art", "de");

      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      expect(mockedAxios.get.mock.calls[0]?.[0]).toEqual(expect.stringContaining("lang%3Ade"));
      expect(mockedAxios.get.mock.calls[1]?.[0]).toEqual(expect.stringContaining("lang%3Aen"));
    });

    it("should handle double-faced cards", async () => {
      mockedAxios.get.mockResolvedValue(mockScryfallResponse([doubleFaceCard]));
      const cardInfo = { name: "Valki" };
      const urls = await getImagesForCardInfo(cardInfo);

      expect(urls).toEqual(["valki_url", "tibalt_url"]);
    });

    it("should handle pagination", async () => {
      mockedAxios.get.mockClear();
      const page1 = [{ image_uris: { png: "page1_url" } }];
      const page2 = [{ image_uris: { png: "page2_url" } }];

      mockedAxios.get
        .mockResolvedValueOnce(mockScryfallResponse(page1, true, "next_page_url"))
        .mockResolvedValueOnce(mockScryfallResponse(page2));

      const cardInfo = { name: "Sol Ring" };
      const urls = await getImagesForCardInfo(cardInfo);

      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      expect(mockedAxios.get.mock.calls[1]?.[0]).toBe("next_page_url");
      expect(urls).toEqual(["page1_url", "page2_url"]);
    }, 30000);

    it("should not fall back to English if fallbackToEnglish is false", async () => {
      mockedAxios.get.mockResolvedValue(mockScryfallResponse([])); // Language query fails
      const cardInfo = { name: "Sol Ring" };
      await getImagesForCardInfo(cardInfo, "art", "de", false);

      expect(mockedAxios.get).toHaveBeenCalledTimes(1); // Only called for German
      expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining("lang%3Ade"));
    });
  });

  describe("getCardDataForCardInfo", () => {
    it("should return a single card object", async () => {
      mockedAxios.get.mockResolvedValue(mockScryfallResponse([singleFaceCard]));
      const cardInfo = { name: "Sol Ring" };
      const data = await getCardDataForCardInfo(cardInfo);

      expect(data).toEqual(singleFaceCard);
    });

    it("should return null if no card is found", async () => {
      mockedAxios.get.mockResolvedValue(mockScryfallResponse([]));
      const cardInfo = { name: "Nonexistent Card" };
      const data = await getCardDataForCardInfo(cardInfo);

      expect(data).toBeNull();
    });
  });

  describe("getScryfallPngImagesForCard", () => {
    it("should call with unique=art by default", async () => {
      mockedAxios.get.mockResolvedValue(mockScryfallResponse([singleFaceCard]));
      await getScryfallPngImagesForCard("Sol Ring");
      expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining("unique%3Aart"));
    });

    it("should respect the unique parameter", async () => {
      mockedAxios.get.mockResolvedValue(mockScryfallResponse([singleFaceCard]));
      await getScryfallPngImagesForCard("Sol Ring", "prints");
      expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining("unique%3Aprints"));
    });
  });

  describe("getScryfallPngImagesForCardPrints", () => {
    it("should call with unique=prints", async () => {
      mockedAxios.get.mockResolvedValue(mockScryfallResponse([singleFaceCard]));
      await getScryfallPngImagesForCardPrints("Sol Ring");
      expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining("unique%3Aprints"));
    });
  });

  describe("Error Handling", () => {
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    it("getImagesForCardInfo should return an empty array on API error", async () => {
      mockedAxios.get.mockClear();
      mockedAxios.get.mockRejectedValue(new Error("Scryfall API is down"));
      const cardInfo = { name: "Sol Ring" };
      const urls = await getImagesForCardInfo(cardInfo);
      expect(urls).toEqual([]);
      expect(consoleWarnSpy).toHaveBeenCalled();
    });


    it("getCardDataForCardInfo should return null on API error", async () => {
      mockedAxios.get.mockClear();
      mockedAxios.get.mockRejectedValue(new Error("Scryfall API is down"));
      const cardInfo = { name: "Sol Ring" };
      const data = await getCardDataForCardInfo(cardInfo);
      expect(data).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalled();
    }, 10000);
  });

  describe("Additional Strategies", () => {
    it("getImagesForCardInfo should use Set + Name strategy when number is missing", async () => {
      mockedAxios.get.mockResolvedValue(mockScryfallResponse([singleFaceCard]));
      const cardInfo = { name: "Sol Ring", set: "cmr" };
      await getImagesForCardInfo(cardInfo, "prints");

      const expectedUrlPart = "set%3Acmr%20name%3A%22Sol%20Ring%22";
      expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining(expectedUrlPart));
    });

    it("getCardDataForCardInfo should use Set + Number strategy", async () => {
      mockedAxios.get.mockResolvedValue(mockScryfallResponse([singleFaceCard]));
      const cardInfo = { name: "Sol Ring", set: "cmr", number: "332" };
      await getCardDataForCardInfo(cardInfo);

      const expectedUrlPart = "set%3Acmr%20number%3A332";
      expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining(expectedUrlPart));
    });

    it("getCardDataForCardInfo should use Set + Name strategy", async () => {
      mockedAxios.get.mockResolvedValue(mockScryfallResponse([singleFaceCard]));
      const cardInfo = { name: "Sol Ring", set: "cmr" };
      await getCardDataForCardInfo(cardInfo);

      const expectedUrlPart = "set%3Acmr%20name%3A%22Sol%20Ring%22";
      expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining(expectedUrlPart));
    });

    it("getCardDataForCardInfo should handle null cardInfo", async () => {
      mockedAxios.get.mockClear();
      mockedAxios.get.mockResolvedValue(mockScryfallResponse([]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await getCardDataForCardInfo(null as any);
      expect(result).toBeNull();
    });

    it("getCardDataForCardInfo should return null if strategy 1 returns empty", async () => {
      mockedAxios.get.mockResolvedValue(mockScryfallResponse([]));
      const cardInfo = { name: "Card", set: "SET", number: "123" };
      const result = await getCardDataForCardInfo(cardInfo);
      expect(result).toBeNull();
    });

    it("getCardDataForCardInfo should return null if strategy 2 returns empty", async () => {
      mockedAxios.get.mockResolvedValue(mockScryfallResponse([]));
      const cardInfo = { name: "Card", set: "SET" };
      const result = await getCardDataForCardInfo(cardInfo);
      expect(result).toBeNull();
    });
    it("getImagesForCardInfo should return empty array if strategy 1 returns empty", async () => {
      mockedAxios.get.mockResolvedValue(mockScryfallResponse([]));
      const cardInfo = { name: "Card", set: "SET", number: "123" };
      const result = await getImagesForCardInfo(cardInfo);
      expect(result).toEqual([]);
    });

    it("getImagesForCardInfo should return empty array if strategy 2 returns empty", async () => {
      mockedAxios.get.mockResolvedValue(mockScryfallResponse([]));
      const cardInfo = { name: "Card", set: "SET" };
      const result = await getImagesForCardInfo(cardInfo);
      expect(result).toEqual([]);
    });
  });
});