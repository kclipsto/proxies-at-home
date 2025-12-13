import { describe, it, expect } from 'vitest';
import { getCardTargetBleed, SourceTypeSettings } from './layout';
import { CardOption } from '../../../shared/types';

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
