import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { groupCardsForDecklist, formatDecklistLine, buildDecklist, downloadDecklist } from "./decklistHelper";
import type { CardOption } from '@/types';

// Note: groupCardsForDecklist uses ADJACENT grouping to preserve display order
// Only consecutive identical cards are grouped together
const MOCK_CARDS: CardOption[] = [
  { uuid: '1', name: 'Sol Ring', order: 1, isUserUpload: false, set: 'CMM', number: '432' },
  { uuid: '2', name: 'Sol Ring', order: 2, isUserUpload: false, set: 'CMM', number: '432' },
  { uuid: '3', name: 'Brainstorm', order: 3, isUserUpload: false },
  { uuid: '4', name: 'Counterspell', order: 4, isUserUpload: false, set: 'A25' },
  { uuid: '5', name: 'Card Back', order: 5, isUserUpload: false }, // Should be ignored
  { uuid: '6', name: '   Sol Ring ', order: 6, isUserUpload: false, set: 'cmm', number: '432' }, // Not adjacent to cards 1-2
];

describe('DecklistHelper', () => {
  describe('groupCardsForDecklist', () => {
    it('should group adjacent cards by name, set, and number, and count them', () => {
      const grouped = groupCardsForDecklist(MOCK_CARDS);
      // Cards 1-2 are adjacent Sol Rings = 1 group (count 2)
      // Card 3 = Brainstorm (count 1)
      // Card 4 = Counterspell (count 1)
      // Card 5 = Card Back (ignored)
      // Card 6 = Sol Ring but NOT adjacent to 1-2 = separate group (count 1)
      expect(grouped).toHaveLength(4);

      // First Sol Ring group (cards 1-2)
      const firstSolRing = grouped[0];
      expect(firstSolRing.name).toBe('Sol Ring');
      expect(firstSolRing.count).toBe(2);
      expect(firstSolRing.set).toBe('CMM');
      expect(firstSolRing.number).toBe('432');

      const brainstorm = grouped.find(c => c.name === 'Brainstorm');
      expect(brainstorm?.count).toBe(1);
      expect(brainstorm?.set).toBeUndefined();
      expect(brainstorm?.number).toBeUndefined();

      const counterspell = grouped.find(c => c.name === 'Counterspell');
      expect(counterspell?.count).toBe(1);
      expect(counterspell?.set).toBe('A25');

      // Second Sol Ring group (card 6, trimmed name)
      const secondSolRing = grouped[3];
      expect(secondSolRing.name).toBe('Sol Ring');
      expect(secondSolRing.count).toBe(1);
      expect(secondSolRing.set).toBe('cmm'); // Original case preserved
    });

    it('should ignore cards named "Card Back"', () => {
      const grouped = groupCardsForDecklist(MOCK_CARDS);
      const cardBack = grouped.find(c => c.name.toLowerCase().includes('card back'));
      expect(cardBack).toBeUndefined();
    });

    it('should ignore linked back cards (cards with linkedFrontId)', () => {
      const cardsWithLinkedBack: CardOption[] = [
        { uuid: '1', name: 'Lightning Bolt', order: 1, isUserUpload: false },
        { uuid: '2', name: 'Default Cardback', order: 2, isUserUpload: false, linkedFrontId: '1' }, // Linked back card
        { uuid: '3', name: 'Counterspell', order: 3, isUserUpload: false },
        { uuid: '4', name: 'Proxxied', order: 4, isUserUpload: false, linkedFrontId: '3' }, // Another linked back card
      ];

      const grouped = groupCardsForDecklist(cardsWithLinkedBack);

      // Should only have the front cards, not the linked backs
      expect(grouped).toHaveLength(2);
      expect(grouped.find(c => c.name === 'Lightning Bolt')).toBeDefined();
      expect(grouped.find(c => c.name === 'Counterspell')).toBeDefined();

      // Linked back cards should NOT appear
      expect(grouped.find(c => c.name === 'Default Cardback')).toBeUndefined();
      expect(grouped.find(c => c.name === 'Proxxied')).toBeUndefined();
    });
  });

  describe('formatDecklistLine', () => {
    const MOCK_ENTRY = { name: 'Test Card', set: 'TST', number: '123', isUpload: false, count: 2 };

    it('should format in "plain" style', () => {
      expect(formatDecklistLine(MOCK_ENTRY, 'plain')).toBe('2x Test Card');
    });

    it('should format in "withSetNum" style with all info', () => {
      expect(formatDecklistLine(MOCK_ENTRY, 'withSetNum')).toBe('2x Test Card (TST) 123');
    });

    it('should format in "withSetNum" style with only set', () => {
      const entry = { ...MOCK_ENTRY, number: undefined };
      expect(formatDecklistLine(entry, 'withSetNum')).toBe('2x Test Card (TST)');
    });

    it('should format in "withSetNum" style with no set or number', () => {
      const entry = { ...MOCK_ENTRY, set: undefined, number: undefined };
      expect(formatDecklistLine(entry, 'withSetNum')).toBe('2x Test Card');
    });

    it('should format in "scryfallish" style', () => {
      expect(formatDecklistLine(MOCK_ENTRY, 'scryfallish')).toBe('2x "Test Card" set:TST number=123');
    });

    it('should format in "withMpc" style with MPC identifier', () => {
      const entry = { ...MOCK_ENTRY, mpcIdentifier: 'abc123' };
      expect(formatDecklistLine(entry, 'withMpc')).toBe('2x Test Card [mpc:abc123]');
    });

    it('should format in "withMpc" style without MPC identifier (set and number)', () => {
      expect(formatDecklistLine(MOCK_ENTRY, 'withMpc')).toBe('2x Test Card (TST) 123');
    });

    it('should format in "withMpc" style without MPC identifier (set only)', () => {
      const entry = { ...MOCK_ENTRY, number: undefined };
      expect(formatDecklistLine(entry, 'withMpc')).toBe('2x Test Card (TST)');
    });

    it('should format in "withMpc" style without MPC identifier (no set or number)', () => {
      const entry = { ...MOCK_ENTRY, set: undefined, number: undefined };
      expect(formatDecklistLine(entry, 'withMpc')).toBe('2x Test Card');
    });
  });

  describe('buildDecklist', () => {
    it('should build a decklist string with adjacent grouping', () => {
      const decklist = buildDecklist(MOCK_CARDS);
      // Adjacent grouping: 2x Sol Ring + 1x Brainstorm + 1x Counterspell + 1x Sol Ring
      expect(decklist).toContain('2x Sol Ring');
      expect(decklist).toContain('1x Brainstorm');
      expect(decklist).toContain('1x Counterspell');
      // The second Sol Ring group (card 6) should appear at the end
      const lines = decklist.split('\n');
      expect(lines[lines.length - 1]).toBe('1x Sol Ring');
    });

    it('should sort the decklist alphabetically if specified', () => {
      const decklist = buildDecklist(MOCK_CARDS, { sort: 'alpha' });
      const lines = decklist.split('\n');
      expect(lines[0]).toContain('Brainstorm');
      expect(lines[1]).toContain('Counterspell');
      // Both Sol Ring entries come after alphabetically
      expect(lines[2]).toContain('Sol Ring');
      expect(lines[3]).toContain('Sol Ring');
    });

    it('should use the specified style', () => {
      const decklist = buildDecklist(MOCK_CARDS, { style: 'withSetNum' });
      expect(decklist).toContain('2x Sol Ring (CMM) 432');
      expect(decklist).toContain('1x Counterspell (A25)');
    });

    it('should group token cards separately', () => {
      const cardsWithToken: CardOption[] = [
        { uuid: '1', name: 'Sol Ring', order: 1, isUserUpload: false },
        { uuid: '2', name: 'Lightning Bolt', order: 2, isUserUpload: false },
        { uuid: '3', name: 'Treasure', order: 3, isUserUpload: false, type_line: 'Token Artifact — Treasure' },
      ];

      const decklist = buildDecklist(cardsWithToken);

      // Tokens should be in a separate section
      expect(decklist).toContain('// Tokens');
    });

    it('should prefix token lines with t:', () => {
      const cardsWithToken: CardOption[] = [
        { uuid: '1', name: 'Sol Ring', order: 1, isUserUpload: false },
        { uuid: '2', name: 'Treasure', order: 2, isUserUpload: false, type_line: 'Token Artifact — Treasure' },
      ];

      const decklist = buildDecklist(cardsWithToken);

      // Token should have t: prefix
      expect(decklist).toContain('1x t:Treasure');
    });

    it('should detect tokens from type_line containing Token', () => {
      const cardsWithTokens: CardOption[] = [
        { uuid: '1', name: 'Blood', order: 1, isUserUpload: false, type_line: 'Token Artifact — Blood' },
        { uuid: '2', name: 'Clue', order: 2, isUserUpload: false, type_line: 'Token Artifact — Clue' },
      ];

      const decklist = buildDecklist(cardsWithTokens);

      expect(decklist).toContain('1x t:Blood');
      expect(decklist).toContain('1x t:Clue');
    });

    it('should NOT detect tokens just from set codes starting with t', () => {
      const cardsWithTokens: CardOption[] = [
        { uuid: '1', name: 'Human Soldier', order: 1, isUserUpload: false, set: 'ths' },
      ];

      const decklist = buildDecklist(cardsWithTokens);

      expect(decklist).toContain('1x Human Soldier');
      expect(decklist).not.toContain('t:Human Soldier');
    });
  });

  describe('downloadDecklist', () => {
    let mockCreateObjectURL: ReturnType<typeof vi.fn>;
    let mockRevokeObjectURL: ReturnType<typeof vi.fn>;
    let mockClick: ReturnType<typeof vi.fn>;
    let mockAnchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
      mockRevokeObjectURL = vi.fn();
      mockClick = vi.fn();
      mockAnchor = { href: '', download: '', click: mockClick };

      vi.stubGlobal('URL', {
        createObjectURL: mockCreateObjectURL,
        revokeObjectURL: mockRevokeObjectURL,
      });

      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLAnchorElement);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('should create blob, anchor, and trigger download', () => {
      downloadDecklist('test.txt', 'decklist content');

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockAnchor.href).toBe('blob:mock-url');
      expect(mockAnchor.download).toBe('test.txt');
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });
  });
});