import { describe, it, expect, vi } from 'vitest';
import {
  inferCardNameFromFilename,
  getMpcImageUrl,
  extractDriveId,
  tryParseMpcSchemaXml,
  parseMpcText,
} from './Mpc';
import * as constants from '../constants';

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
      expect(getMpcImageUrl(frontId)).toBe(`${constants.API_BASE}/api/cards/images/front?id=${frontId}`);
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
      // Wait, this is query param.
      // Path ending:
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
      // Backs are not returned in the item structure directly?
      // Wait, MpcItem definition:
      // type MpcItem = { qty, name, filename?, frontId?, backId? };
      // tryParseMpcSchemaXml implementation does NOT populate backId!
      // It parses backs into a Map, but never uses it to set backId on items.
      // Line 82: const items: MpcItem[] = [];
      // Loop over fronts... items.push({...});
      // The `backs` map is unused!
      // This is a bug or incomplete implementation in Mpc.ts.
      // I should verify this.
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
});
