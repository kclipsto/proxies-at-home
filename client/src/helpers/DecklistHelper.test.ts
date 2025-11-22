import { describe, it, expect } from 'vitest';
import { groupCardsForDecklist, formatDecklistLine, buildDecklist } from './DecklistHelper';
import type { CardOption } from '@/types';

const MOCK_CARDS: CardOption[] = [
  { uuid: '1', name: 'Sol Ring', order: 1, isUserUpload: false, set: 'CMM', number: '432' },
  { uuid: '2', name: 'Sol Ring', order: 2, isUserUpload: false, set: 'CMM', number: '432' },
  { uuid: '3', name: 'Brainstorm', order: 3, isUserUpload: false },
  { uuid: '4', name: 'Counterspell', order: 4, isUserUpload: false, set: 'A25' },
  { uuid: '5', name: 'Card Back', order: 5, isUserUpload: false }, // Should be ignored
  { uuid: '6', name: '   Sol Ring ', order: 6, isUserUpload: false, set: 'cmm', number: '432' }, // Test trimming and case
];

describe('DecklistHelper', () => {
  describe('groupCardsForDecklist', () => {
    it('should group cards by name, set, and number, and count them', () => {
      const grouped = groupCardsForDecklist(MOCK_CARDS);
      expect(grouped).toHaveLength(3);

      const solRing = grouped.find(c => c.name === 'Sol Ring');
      expect(solRing?.count).toBe(3);
      expect(solRing?.set).toBe('CMM');
      expect(solRing?.number).toBe('432');

      const brainstorm = grouped.find(c => c.name === 'Brainstorm');
      expect(brainstorm?.count).toBe(1);
      expect(brainstorm?.set).toBeUndefined();
      expect(brainstorm?.number).toBeUndefined();

      const counterspell = grouped.find(c => c.name === 'Counterspell');
      expect(counterspell?.count).toBe(1);
      expect(counterspell?.set).toBe('A25');
    });

    it('should ignore cards named "Card Back"', () => {
      const grouped = groupCardsForDecklist(MOCK_CARDS);
      const cardBack = grouped.find(c => c.name.toLowerCase().includes('card back'));
      expect(cardBack).toBeUndefined();
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
  });

  describe('buildDecklist', () => {
    it('should build a decklist string', () => {
      const decklist = buildDecklist(MOCK_CARDS);
      // Order is not guaranteed, so check for presence of lines
      expect(decklist).toContain('3x Sol Ring');
      expect(decklist).toContain('1x Brainstorm');
      expect(decklist).toContain('1x Counterspell');
    });

    it('should sort the decklist alphabetically if specified', () => {
      const decklist = buildDecklist(MOCK_CARDS, { sort: 'alpha' });
      const lines = decklist.split('\n');
      expect(lines[0]).toContain('Brainstorm');
      expect(lines[1]).toContain('Counterspell');
      expect(lines[2]).toContain('Sol Ring');
    });

    it('should use the specified style', () => {
      const decklist = buildDecklist(MOCK_CARDS, { style: 'withSetNum' });
      expect(decklist).toContain('3x Sol Ring (CMM) 432');
      expect(decklist).toContain('1x Counterspell (A25)');
    });
  });
});