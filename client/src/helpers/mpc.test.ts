import { describe, it, expect, vi } from "vitest";
import {
  inferCardNameFromFilename,
  getMpcImageUrl,
  extractDriveId,
} from './mpc';
import * as constants from '../constants';


// Mocks
vi.mock("./dbUtils");
vi.mock("./undoableActions");
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

    it('should construct URL without size param for full resolution (default)', () => {
      const frontId = 'some-front-id';
      // Full resolution (default) omits size param for cache compatibility
      expect(getMpcImageUrl(frontId)).toBe(`${constants.API_BASE}/api/cards/images/mpc?id=${frontId}`);
      expect(getMpcImageUrl(frontId, 'full')).toBe(`${constants.API_BASE}/api/cards/images/mpc?id=${frontId}`);
    });

    it('should include size param for small thumbnails', () => {
      const frontId = 'some-front-id';
      expect(getMpcImageUrl(frontId, 'small')).toBe(`${constants.API_BASE}/api/cards/images/mpc?id=${frontId}&size=small`);
    });

    it('should include size param for large thumbnails', () => {
      const frontId = 'some-front-id';
      expect(getMpcImageUrl(frontId, 'large')).toBe(`${constants.API_BASE}/api/cards/images/mpc?id=${frontId}&size=large`);
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

});
