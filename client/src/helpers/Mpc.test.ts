import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  inferCardNameFromFilename,
  getMpcImageUrl,
  extractDriveId,
  tryParseMpcSchemaXml,
  parseMpcText,
  processMpcImport,
} from './Mpc';
import * as constants from '../constants';
import { addRemoteImage, addRemoteImages, addCards } from "./dbUtils";
import { searchCards } from "./scryfallApi";

// Mocks
vi.mock("./dbUtils");
vi.mock("./scryfallApi"); // Mock Scryfall API
vi.mock('../constants', async () => {
  const originalConstants = await vi.importActual('../constants');
  return {
    ...originalConstants,
    API_BASE: 'http://localhost:3001',
  };
});

describe('Mpc', () => {
  describe('inferCardNameFromFilename', () => {
    it('should infer card name from a simple filename', () => {
      expect(inferCardNameFromFilename('Sol_Ring.png')).toBe('Sol Ring');
    });

    it('should handle parentheses in filename', () => {
      expect(inferCardNameFromFilename('Card Name (Version 1).jpg')).toBe('Card Name');
    });

    it('should handle multiple underscores and hyphens', () => {
      expect(inferCardNameFromFilename('a-very-long_card-name.png')).toBe('a very long card name');
    });
  });

  describe('getMpcImageUrl', () => {
    it('should return null if no frontId is provided', () => {
      expect(getMpcImageUrl(null)).toBeNull();
      expect(getMpcImageUrl(undefined)).toBeNull();
    });

    it('should construct the correct image URL', () => {
      const frontId = 'some-front-id';
      expect(getMpcImageUrl(frontId)).toBe(`${constants.API_BASE}/api/cards/images/mpc?id=${frontId}`);
    });
  });

  describe('extractDriveId', () => {
    it('should return undefined for null or empty input', () => {
      expect(extractDriveId(null)).toBeUndefined();
      expect(extractDriveId('')).toBeUndefined();
      expect(extractDriveId('  ')).toBeUndefined();
    });

    it('should extract ID from a plain string', () => {
      expect(extractDriveId('1-ABCDEFGHIJKL')).toBe('1-ABCDEFGHIJKL');
    });

    it('should extract ID from a Google Drive URL', () => {
      const url = 'https://drive.google.com/file/d/1-ABCDEFGHIJKL/view?usp=sharing';
      expect(extractDriveId(url)).toBe('1-ABCDEFGHIJKL');
    });

    it('should extract ID from a URL with id query param', () => {
      const url = 'https://example.com/something?id=1-ABCDEFGHIJKL';
      expect(extractDriveId(url)).toBe('1-ABCDEFGHIJKL');
    });

    it('should extract ID from path ending', () => {
      const url2 = 'https://example.com/folder/1-ABCDEFGHIJKL';
      expect(extractDriveId(url2)).toBe('1-ABCDEFGHIJKL');
    });

    it('should handle malformed URLs gracefully', () => {
      expect(extractDriveId('http://[invalid-url]')).toBeUndefined();
    });
  });

  describe('tryParseMpcSchemaXml', () => {
    it('should return null for invalid XML', () => {
      expect(tryParseMpcSchemaXml('this is not xml')).toBeNull();
    });

    it('should parse a valid MPC XML string', () => {
      const xml = `
        <order>
          <fronts>
            <card>
              <id>a-valid-looking-id</id>
              <name>Sol Ring</name>
              <slots>1,2</slots>
            </card>
            <card>
              <name>Island.png</name>
              <slots>3</slots>
            </card>
          </fronts>
        </order>
      `;
      const result = tryParseMpcSchemaXml(xml);
      expect(result).toEqual([
        { qty: 2, name: 'Sol Ring', filename: undefined, frontId: 'a-valid-looking-id' },
        { qty: 1, name: 'Island', filename: 'Island.png', frontId: undefined },
      ]);
    });
  });

  describe('parseMpcText', () => {
    it('should parse a simple line', () => {
      const text = '1 123456789012 0 some_card.png';
      const result = parseMpcText(text);
      expect(result).toEqual([
        {
          qty: 1,
          name: 'some card',
          filename: 'some_card.png',
          frontId: '123456789012',
          backId: undefined,
        },
      ]);
    });

    it('should parse multiple lines', () => {
      const text = `
            2 123456789012 0 some_card.png
            1 another.jpg 987654321098
        `;
      const result = parseMpcText(text);
      expect(result).toEqual([
        { qty: 2, name: 'some card', filename: 'some_card.png', frontId: '123456789012', backId: undefined },
        { qty: 1, name: 'another', filename: 'another.jpg', frontId: undefined, backId: '987654321098' },
      ]);
    });

    it('should handle lines without frontId or backId', () => {
      const text = '4 my_custom_art.png';
      const result = parseMpcText(text);
      expect(result).toEqual([
        { qty: 4, name: 'my custom art', filename: 'my_custom_art.png', frontId: undefined, backId: undefined },
      ]);
    });

    it('should handle lines with no image file', () => {
      const text = '1 some text without png or jpg';
      const result = parseMpcText(text);
      expect(result).toEqual([
        { qty: 1, name: 'Custom Art 1' }
      ]);
    });

    it('should fallback to searching for frontId if not at expected position', () => {
      // 123456789012 is frontId, but not immediately before 0
      const text = '1 123456789012 random 0 card.png';
      const result = parseMpcText(text);
      expect(result[0].frontId).toBe('123456789012');
    });

    it('should parse backId from tokens after filename', () => {
      const text = '1 card.png back-id-123456';
      const result = parseMpcText(text);
      expect(result[0].backId).toBe('back-id-123456');
    });
  });

  describe('tryParseMpcSchemaXml', () => {
    it('should return null for invalid XML', () => {
      expect(tryParseMpcSchemaXml('this is not xml')).toBeNull();
    });

    it('should parse backs and handle query fallback', () => {
      const xml = `
        <order>
          <fronts>
            <card>
              <query>Sol Ring</query>
              <slots>1</slots>
            </card>
          </fronts>
          <backs>
            <card>
              <id>back-id-123456</id>
              <slots>1</slots>
            </card>
          </backs>
        </order>
      `;
      const result = tryParseMpcSchemaXml(xml);
      expect(result).not.toBeNull();
      if (result) {
        expect(result[0].name).toBe('Sol Ring');
        expect(result[0].backId).toBe('back-id-123456');
      }
    });

    it('should ignore non-finite slot numbers', () => {
      const xml = `
        <order>
          <fronts>
            <card>
              <id>front-id-123456789</id>
              <slots>1, foo, 2</slots>
              <name>Test Card</name>
            </card>
          </fronts>
          <backs>
            <card>
              <id>back-id-123456789</id>
              <slots>1, 2</slots>
            </card>
          </backs>
        </order>
      `;
      const result = tryParseMpcSchemaXml(xml);
      expect(result).not.toBeNull();
      if (result) {
        expect(result[0].qty).toBe(2); // 1 and 2 are valid
        expect(result[0].backId).toBe('back-id-123456789');
      }
    });

    it('should parse multiple slots and assign backId', () => {
      const xml = `
        <order>
          <fronts>
            <card>
              <id>front-id-123</id>
              <slots>1, 2</slots>
              <name>Multi Slot Card</name>
            </card>
          </fronts>
          <backs>
            <card>
              <id>back-id-123456789</id>
              <slots>1, 2</slots>
            </card>
          </backs>
        </order>
      `;
      const result = tryParseMpcSchemaXml(xml);
      expect(result).not.toBeNull();
      if (result) {
        expect(result[0].name).toBe('Multi Slot Card');
        expect(result[0].qty).toBe(2);
        expect(result[0].backId).toBe('back-id-123456789');
      }
    });

  });

  describe("processMpcImport", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Default mock for searchCards
      (searchCards as Mock).mockResolvedValue([]);
    });

    it("should return error if XML parsing fails", async () => {
      // We rely on real tryParseMpcSchemaXml returning null for invalid XML
      const result = await processMpcImport("invalid xml");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to parse MPC XML");
      expect(addRemoteImage).not.toHaveBeenCalled();
      expect(addCards).not.toHaveBeenCalled();
    });

    it("should process valid MPC XML and add cards", async () => {
      const validXml = `
        <order>
          <fronts>
            <card>
              <id>123456789012</id>
              <name>MPC Import 1</name>
              <slots>1</slots>
            </card>
            <card>
              <id>123456789013</id>
              <name>MPC Import 2</name>
              <slots>2</slots>
            </card>
          </fronts>
        </order>
      `;

      const mockUrlMap = new Map();
      mockUrlMap.set(`${constants.API_BASE}/api/cards/images/mpc?id=123456789012`, "imgId1");
      mockUrlMap.set(`${constants.API_BASE}/api/cards/images/mpc?id=123456789013`, "imgId2");
      (addRemoteImages as Mock).mockResolvedValue(mockUrlMap);

      (addCards as Mock).mockResolvedValue([
        { uuid: 'uuid1', name: 'MPC Import 1' },
        { uuid: 'uuid2', name: 'MPC Import 2' }
      ]);

      const onProgress = vi.fn();
      const result = await processMpcImport(validXml, onProgress);

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);

      // Should batch add images
      expect(addRemoteImages).toHaveBeenCalledTimes(1);
      // Verify arg contains both images
      const calledArgs = (addRemoteImages as Mock).mock.calls[0][0];
      expect(calledArgs).toHaveLength(2);
      expect(calledArgs).toEqual(expect.arrayContaining([
        expect.objectContaining({ imageUrls: [`${constants.API_BASE}/api/cards/images/mpc?id=123456789012`] }),
        expect.objectContaining({ imageUrls: [`${constants.API_BASE}/api/cards/images/mpc?id=123456789013`] })
      ]));

      // Should add cards
      expect(addCards).toHaveBeenCalledTimes(1);
      expect(addCards).toHaveBeenCalledWith([
        expect.objectContaining({ name: "MPC Import 1", imageId: "imgId1", isUserUpload: true, hasBakedBleed: true }),
        expect.objectContaining({ name: "MPC Import 2", imageId: "imgId2", isUserUpload: true, hasBakedBleed: true }),
      ]);

      // Should call progress
      expect(onProgress).toHaveBeenCalledTimes(2);
    });

    it("should handle empty MPC data", async () => {
      const emptyXml = `
        <order>
          <fronts>
          </fronts>
        </order>
      `;

      const result = await processMpcImport(emptyXml);

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(addCards).not.toHaveBeenCalled();
    });

    it("should defer enrichment to background", async () => {
      const xml = `
        <order>
          <fronts>
            <card>
              <id>front1</id>
              <name>Sol Ring</name>
              <slots>1</slots>
            </card>
          </fronts>
        </order>
      `;

      const mockUrlMap = new Map();
      mockUrlMap.set(`${constants.API_BASE}/api/cards/images/mpc?id=front1`, "imgId");
      (addRemoteImages as Mock).mockResolvedValue(mockUrlMap);

      (addCards as Mock).mockResolvedValue([
        { uuid: 'uuid-sol-ring', name: 'Sol Ring' }
      ]);

      const result = await processMpcImport(xml);

      expect(result.success).toBe(true);
      expect(addCards).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "Sol Ring",
          needsEnrichment: true,
          hasBakedBleed: true,
        }),
      ]);
    });
  });
});
