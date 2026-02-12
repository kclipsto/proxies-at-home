import { describe, it, expect } from 'vitest';
import {
    getCardTargetBleed,
    computeCardLayouts,
    computeGridDimensions,
    chunkCards,
    type SourceTypeSettings,
    type CardLayoutInfo,
} from './layout';
import type { CardOption } from '../../../shared/types';
import { CONSTANTS } from '@/constants/commonConstants';

describe('getCardTargetBleed', () => {
    const globalBleedWidth = 5; // 5mm global default

    const defaultSourceSettings: SourceTypeSettings = {
        withBleedTargetMode: 'global',
        withBleedTargetAmount: 3,
        noBleedTargetMode: 'global',
        noBleedTargetAmount: 1,
    };

    const mockCard = (overrides: Partial<CardOption>): CardOption => ({
        uuid: 'test-uuid',
        name: 'Test Card',
        order: 0,
        isUserUpload: false,
        ...overrides,
    });

    describe('Card-Specific Overrides', () => {
        it('should return 0 when bleedMode is none', () => {
            const card = mockCard({ bleedMode: 'none' });
            expect(getCardTargetBleed(card, defaultSourceSettings, globalBleedWidth)).toBe(0);
        });

        it('should return generateBleedMm when bleedMode is generate', () => {
            const card = mockCard({ bleedMode: 'generate', generateBleedMm: 4.2 });
            expect(getCardTargetBleed(card, defaultSourceSettings, globalBleedWidth)).toBe(4.2);
        });

        it('should fallback to global when bleedMode is generate but amount is missing', () => {
            const card = mockCard({ bleedMode: 'generate', generateBleedMm: undefined });
            expect(getCardTargetBleed(card, defaultSourceSettings, globalBleedWidth)).toBe(globalBleedWidth);
        });

        it('should return existingBleedMm when bleedMode is existing (legacy)', () => {
            const card = mockCard({ bleedMode: 'existing', existingBleedMm: 2.5 });
            expect(getCardTargetBleed(card, defaultSourceSettings, globalBleedWidth)).toBe(2.5);
        });
    });

    describe('Global Settings - Built-in Bleed (e.g. MPC)', () => {
        const mpcCard = mockCard({ hasBuiltInBleed: true });

        it('should use global default when mode is global', () => {
            const settings = { ...defaultSourceSettings, withBleedTargetMode: 'global' as const };
            expect(getCardTargetBleed(mpcCard, settings, globalBleedWidth)).toBe(globalBleedWidth);
        });

        it('should use manual amount when mode is manual', () => {
            const settings = {
                ...defaultSourceSettings,
                withBleedTargetMode: 'manual' as const,
                withBleedTargetAmount: 7.5
            };
            expect(getCardTargetBleed(mpcCard, settings, globalBleedWidth)).toBe(7.5);
        });

        it('should return 0 when mode is none', () => {
            const settings = { ...defaultSourceSettings, withBleedTargetMode: 'none' as const };
            expect(getCardTargetBleed(mpcCard, settings, globalBleedWidth)).toBe(0);
        });
    });

    describe('Global Settings - Standard Cards (No Built-in Bleed)', () => {
        const standardCard = mockCard({ hasBuiltInBleed: false });

        it('should use global default when mode is global', () => {
            const settings = { ...defaultSourceSettings, noBleedTargetMode: 'global' as const };
            expect(getCardTargetBleed(standardCard, settings, globalBleedWidth)).toBe(globalBleedWidth);
        });

        it('should use manual amount when mode is manual', () => {
            const settings = {
                ...defaultSourceSettings,
                noBleedTargetMode: 'manual' as const,
                noBleedTargetAmount: 2.2
            };
            expect(getCardTargetBleed(standardCard, settings, globalBleedWidth)).toBe(2.2);
        });

        it('should return 0 when mode is none', () => {
            const settings = { ...defaultSourceSettings, noBleedTargetMode: 'none' as const };
            expect(getCardTargetBleed(standardCard, settings, globalBleedWidth)).toBe(0);
        });
    });
});

describe('computeCardLayouts', () => {
    const globalBleedWidth = 3;
    const sourceSettings: SourceTypeSettings = {
        withBleedTargetMode: 'global',
        withBleedTargetAmount: 2,
        noBleedTargetMode: 'global',
        noBleedTargetAmount: 1,
    };

    it('should compute layouts for multiple cards', () => {
        const cards: CardOption[] = [
            { uuid: '1', name: 'Card 1', order: 0, isUserUpload: false, hasBuiltInBleed: false },
            { uuid: '2', name: 'Card 2', order: 1, isUserUpload: false, hasBuiltInBleed: true },
        ];

        const layouts = computeCardLayouts(cards, sourceSettings, globalBleedWidth);

        expect(layouts).toHaveLength(2);
        expect(layouts[0].bleedMm).toBe(3); // noBleed uses global
        expect(layouts[0].cardWidthMm).toBe(CONSTANTS.CARD_WIDTH_MM + 3 * 2);
        expect(layouts[0].cardHeightMm).toBe(CONSTANTS.CARD_HEIGHT_MM + 3 * 2);
        expect(layouts[1].bleedMm).toBe(3); // withBleed uses global
    });
});

describe('computeGridDimensions', () => {
    it('should compute grid dimensions for a 3x3 grid', () => {
        const layouts: CardLayoutInfo[] = [
            { cardWidthMm: 65, cardHeightMm: 90, bleedMm: 1 },
            { cardWidthMm: 66, cardHeightMm: 89, bleedMm: 1.5 },
            { cardWidthMm: 64, cardHeightMm: 91, bleedMm: 0.5 },
            { cardWidthMm: 67, cardHeightMm: 92, bleedMm: 2 },
            { cardWidthMm: 63, cardHeightMm: 88, bleedMm: 0 },
            { cardWidthMm: 65, cardHeightMm: 90, bleedMm: 1 },
        ];

        const result = computeGridDimensions(layouts, 3, 2);

        // Column widths: max of each column
        expect(result.colWidthsMm[0]).toBe(Math.max(CONSTANTS.CARD_WIDTH_MM, 65, 67)); // Col 0: cards 0, 3
        expect(result.colWidthsMm[1]).toBe(Math.max(CONSTANTS.CARD_WIDTH_MM, 66, 63)); // Col 1: cards 1, 4
        expect(result.colWidthsMm[2]).toBe(Math.max(CONSTANTS.CARD_WIDTH_MM, 64, 65)); // Col 2: cards 2, 5

        // Row heights: max of each row
        expect(result.rowHeightsMm[0]).toBe(Math.max(CONSTANTS.CARD_HEIGHT_MM, 90, 89, 91)); // Row 0: cards 0, 1, 2
        expect(result.rowHeightsMm[1]).toBe(Math.max(CONSTANTS.CARD_HEIGHT_MM, 92, 88, 90)); // Row 1: cards 3, 4, 5
    });

    it('should handle card spacing', () => {
        const layouts: CardLayoutInfo[] = [
            { cardWidthMm: 63, cardHeightMm: 88, bleedMm: 0 },
            { cardWidthMm: 63, cardHeightMm: 88, bleedMm: 0 },
        ];

        const result = computeGridDimensions(layouts, 2, 1, 5);

        expect(result.totalGridWidthMm).toBe(63 * 2 + 5); // 2 columns + 1 gap
        expect(result.totalGridHeightMm).toBe(88); // 1 row, no gaps
    });

    it('should handle empty layouts', () => {
        const result = computeGridDimensions([], 3, 2);

        expect(result.colWidthsMm).toEqual([CONSTANTS.CARD_WIDTH_MM, CONSTANTS.CARD_WIDTH_MM, CONSTANTS.CARD_WIDTH_MM]);
        expect(result.rowHeightsMm).toEqual([CONSTANTS.CARD_HEIGHT_MM, CONSTANTS.CARD_HEIGHT_MM]);
    });
});

describe('chunkCards', () => {
    it('should chunk cards into groups of specified size', () => {
        const cards = [1, 2, 3, 4, 5, 6, 7, 8];
        const chunks = chunkCards(cards, 3);

        expect(chunks).toEqual([[1, 2, 3], [4, 5, 6], [7, 8]]);
    });

    it('should return empty array for empty input', () => {
        const chunks = chunkCards([], 3);
        expect(chunks).toEqual([]);
    });

    it('should handle single chunk', () => {
        const cards = [1, 2];
        const chunks = chunkCards(cards, 5);
        expect(chunks).toEqual([[1, 2]]);
    });
});

