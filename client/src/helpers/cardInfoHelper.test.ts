import { describe, it, expect } from 'vitest';
import { extractCardInfo, parseDeckToInfos, cardKey } from "./cardInfoHelper";

describe('CardInfoHelper', () => {
  describe('extractCardInfo', () => {
    it('should parse a standard line with set and number', () => {
      const input = '1x Sol Ring (CMM) 432';
      expect(extractCardInfo(input)).toEqual({
        name: 'Sol Ring',
        quantity: 1,
        set: 'cmm',
        number: '432',
      });
    });

    it('should parse a line with only a set', () => {
      const input = '1x Counterspell (A25)';
      expect(extractCardInfo(input)).toEqual({
        name: 'Counterspell',
        quantity: 1,
        set: 'a25',
        number: undefined,
      });
    });

    it('should parse a line with no set or number', () => {
      const input = '1x Brainstorm';
      expect(extractCardInfo(input)).toEqual({
        name: 'Brainstorm',
        quantity: 1,
        set: undefined,
        number: undefined,
      });
    });

    it('should handle lines without a quantity', () => {
      const input = 'Swords to Plowshares';
      expect(extractCardInfo(input)).toEqual({
        name: 'Swords to Plowshares',
        quantity: 1,
        set: undefined,
        number: undefined,
      });
    });

    it('should strip extra metadata like [foil]', () => {
      const input = '1x Path to Exile [2X2]';
      expect(extractCardInfo(input)).toEqual({
        name: 'Path to Exile',
        quantity: 1,
        set: undefined,
        number: undefined,
      });
    });

    it('should strip extra metadata like ^promo^', () => {
      const input = '1x Demonic Tutor ^promo^';
      expect(extractCardInfo(input)).toEqual({
        name: 'Demonic Tutor',
        quantity: 1,
        set: undefined,
        number: undefined,
      });
    });

    it('should strip multiple tags recursively', () => {
      const input = '1x Card Name [Tag1] ^Promo^ [Tag2]';
      expect(extractCardInfo(input)).toEqual({
        name: 'Card Name',
        quantity: 1,
        set: undefined,
        number: undefined
      });
    });

    it('should handle various whitespace and casing', () => {
      const input = '  2x   dark ritual   (StA)   5  ';
      const result = parseDeckToInfos(input);
      expect(result[0]).toEqual({
        name: 'dark ritual',
        quantity: 2,
        set: 'sta',
        number: '5',
      });
    });

    it('should handle card names with parentheses', () => {
      const input = '1x Vorinclex, Monstrous Raider (KHM) 199';
      expect(extractCardInfo(input)).toEqual({
        name: 'Vorinclex, Monstrous Raider',
        quantity: 1,
        set: 'khm',
        number: '199'
      });
    });

    it('should parse set: prefix syntax', () => {
      const input = '1x Lightning Bolt set:sta';
      expect(extractCardInfo(input)).toEqual({
        name: 'Lightning Bolt',
        quantity: 1,
        set: 'sta',
        number: undefined,
      });
    });

    it('should parse s: prefix syntax', () => {
      const input = '1x Counterspell s:a25';
      expect(extractCardInfo(input)).toEqual({
        name: 'Counterspell',
        quantity: 1,
        set: 'a25',
        number: undefined,
      });
    });

    it('should parse num: prefix syntax', () => {
      const input = '1x Sol Ring set:cmm num:432';
      expect(extractCardInfo(input)).toEqual({
        name: 'Sol Ring',
        quantity: 1,
        set: 'cmm',
        number: '432',
        mpcIdentifier: undefined,
      });
    });

    it('should parse cn: prefix syntax', () => {
      const input = '1x Dark Ritual s:sta cn:57';
      expect(extractCardInfo(input)).toEqual({
        name: 'Dark Ritual',
        quantity: 1,
        set: 'sta',
        number: '57',
        mpcIdentifier: undefined,
      });
    });

    it('should strip bracket metadata in parsing loop', () => {
      // This tests the bracketTail cleanup in the parsing loop (lines 116-118)
      const input = '1x Lightning Bolt (sta) 57 [foil]';
      expect(extractCardInfo(input)).toEqual({
        name: 'Lightning Bolt',
        quantity: 1,
        set: 'sta',
        number: '57',
      });
    });

    it('should strip caret metadata in parsing loop', () => {
      // This tests the caretTail cleanup in the parsing loop (lines 122-124)
      const input = '1x Counterspell (a25) ^special^';
      expect(extractCardInfo(input)).toEqual({
        name: 'Counterspell',
        quantity: 1,
        set: 'a25',
        number: undefined,
      });
    });

    it('should parse [mpc:xxx] notation', () => {
      const input = '1x Sol Ring [mpc:abc123]';
      expect(extractCardInfo(input)).toEqual({
        name: 'Sol Ring',
        quantity: 1,
        set: undefined,
        number: undefined,
        mpcIdentifier: 'abc123',
      });
    });

    it('should parse [Set] {Number} format', () => {
      const input = '1x Counterspell [FIC] {7}';
      expect(extractCardInfo(input)).toEqual({
        name: 'Counterspell',
        quantity: 1,
        set: 'fic',
        number: '7',
      });
    });
  });

  describe('parseDeckToInfos', () => {
    it('should parse a multi-line decklist', () => {
      const decklist = `
        2x Sol Ring (CMM) 432
        4 Brainstorm
        1 Counterspell (A25)
      `;
      const result = parseDeckToInfos(decklist);
      expect(result).toEqual([
        { name: 'Sol Ring', set: 'cmm', number: '432', quantity: 2 },
        { name: 'Brainstorm', set: undefined, number: undefined, quantity: 4 },
        { name: 'Counterspell', set: 'a25', number: undefined, quantity: 1 },
      ]);
    });

    it('should handle blank lines gracefully', () => {
      const decklist = `
        1x Island

        2x Mountain
      `;
      const result = parseDeckToInfos(decklist);
      expect(result.length).toBe(2);
    });

    it('should return an empty array for an empty input string', () => {
      const decklist = '';
      const result = parseDeckToInfos(decklist);
      expect(result).toEqual([]);
    });

    it('should handle lines with no quantity specified', () => {
      const decklist = 'Lightning Bolt';
      const result = parseDeckToInfos(decklist);
      expect(result).toEqual([
        { name: 'Lightning Bolt', set: undefined, number: undefined, quantity: 1 },
      ]);
    });
  });

  describe('cardKey', () => {
    it('should create a key from name, set, and number', () => {
      const info = { name: 'Sol Ring', quantity: 1, set: 'CMM', number: '432' };
      expect(cardKey(info)).toBe('sol ring|cmm|432');
    });

    it('should handle missing set and number', () => {
      const info = { name: 'Brainstorm', quantity: 1, };
      expect(cardKey(info)).toBe('brainstorm||');
    });

    it('should handle missing number', () => {
      const info = { name: 'Counterspell', quantity: 1, set: 'A25' };
      expect(cardKey(info)).toBe('counterspell|a25|');
    });

  });

  it('should be case-insensitive', () => {
    const info1 = { name: 'Sol Ring', quantity: 1, set: 'CMM', number: '432' };
    const info2 = { name: 'sol ring', quantity: 1, set: 'cmm', number: '432' };
    expect(cardKey(info1)).toBe(cardKey(info2));
  });


});