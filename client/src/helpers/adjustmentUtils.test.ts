import { describe, it, expect } from 'vitest';
import { hasActiveAdjustments } from './adjustmentUtils';
import type { CardOverrides } from '../../../shared/types';

describe('hasActiveAdjustments', () => {
    describe('with undefined or empty overrides', () => {
        it('returns false for undefined overrides', () => {
            expect(hasActiveAdjustments(undefined)).toBe(false);
        });

        it('returns false for empty overrides object', () => {
            expect(hasActiveAdjustments({})).toBe(false);
        });
    });

    describe('with basic numeric adjustments', () => {
        it('returns true for non-zero brightness', () => {
            expect(hasActiveAdjustments({ brightness: 10 })).toBe(true);
        });

        it('returns true for non-default contrast (default is 1)', () => {
            expect(hasActiveAdjustments({ contrast: 1.5 })).toBe(true);
        });

        it('returns false for default contrast value of 1', () => {
            expect(hasActiveAdjustments({ contrast: 1 })).toBe(false);
        });

        it('returns true for non-default saturation (default is 1)', () => {
            expect(hasActiveAdjustments({ saturation: 0.5 })).toBe(true);
        });

        it('returns false for default saturation value of 1', () => {
            expect(hasActiveAdjustments({ saturation: 1 })).toBe(false);
        });

        it('returns true for non-zero sharpness', () => {
            expect(hasActiveAdjustments({ sharpness: 5 })).toBe(true);
        });

        it('returns false for zero sharpness', () => {
            expect(hasActiveAdjustments({ sharpness: 0 })).toBe(false);
        });
    });

    describe('with color adjustments', () => {
        it('returns true for non-zero hue shift', () => {
            expect(hasActiveAdjustments({ hueShift: 180 })).toBe(true);
        });

        it('returns true for non-zero sepia', () => {
            expect(hasActiveAdjustments({ sepia: 0.5 })).toBe(true);
        });

        it('returns true for non-zero tint amount', () => {
            expect(hasActiveAdjustments({ tintAmount: 0.3 })).toBe(true);
        });

        it('returns true for non-zero color balance', () => {
            expect(hasActiveAdjustments({ redBalance: 10 })).toBe(true);
            expect(hasActiveAdjustments({ greenBalance: -10 })).toBe(true);
            expect(hasActiveAdjustments({ blueBalance: 5 })).toBe(true);
        });
    });

    describe('with boolean/enum settings', () => {
        it('returns true for CMYK preview enabled', () => {
            expect(hasActiveAdjustments({ cmykPreview: true })).toBe(true);
        });

        it('returns false for CMYK preview disabled', () => {
            expect(hasActiveAdjustments({ cmykPreview: false })).toBe(false);
        });

        it('returns true for color replace enabled', () => {
            expect(hasActiveAdjustments({ colorReplaceEnabled: true })).toBe(true);
        });

        it('returns true for active holo effect', () => {
            expect(hasActiveAdjustments({ holoEffect: 'rainbow' })).toBe(true);
            expect(hasActiveAdjustments({ holoEffect: 'glitter' })).toBe(true);
            expect(hasActiveAdjustments({ holoEffect: 'stars' })).toBe(true);
        });

        it('returns false for none holo effect', () => {
            expect(hasActiveAdjustments({ holoEffect: 'none' })).toBe(false);
        });
    });

    describe('with darken settings', () => {
        it('ignores darken settings by default', () => {
            expect(hasActiveAdjustments({ darkenThreshold: 50 })).toBe(false);
            expect(hasActiveAdjustments({ darkenContrast: 1.5 })).toBe(false);
            expect(hasActiveAdjustments({ darkenEdgeWidth: 10 })).toBe(false);
        });

        it('includes darken settings when includeDarkenSettings is true', () => {
            expect(hasActiveAdjustments({ darkenThreshold: 50 }, true)).toBe(true);
            expect(hasActiveAdjustments({ darkenContrast: 1.5 }, true)).toBe(true);
            expect(hasActiveAdjustments({ darkenEdgeWidth: 10 }, true)).toBe(true);
            expect(hasActiveAdjustments({ darkenAmount: 0.5 }, true)).toBe(true);
            expect(hasActiveAdjustments({ darkenBrightness: 0.8 }, true)).toBe(true);
            expect(hasActiveAdjustments({ darkenAutoDetect: true }, true)).toBe(true);
        });
    });

    describe('with multiple adjustments', () => {
        it('returns true when any adjustment is active', () => {
            const overrides: CardOverrides = {
                brightness: 0,    // default
                contrast: 1,      // default
                saturation: 1.2,  // non-default!
            };
            expect(hasActiveAdjustments(overrides)).toBe(true);
        });

        it('returns false when all adjustments are at default values', () => {
            const overrides: CardOverrides = {
                brightness: 0,
                contrast: 1,
                saturation: 1,
                sharpness: 0,
                hueShift: 0,
            };
            expect(hasActiveAdjustments(overrides)).toBe(false);
        });
    });

    describe('with complex overrides', () => {
        it('handles typical card editor overrides', () => {
            const overrides: CardOverrides = {
                brightness: 5,
                contrast: 1.1,
                holoEffect: 'rainbow',
                holoAnimation: 'wave',
            };
            expect(hasActiveAdjustments(overrides)).toBe(true);
        });

        it('handles vignette effect', () => {
            expect(hasActiveAdjustments({ vignetteAmount: 0.3 })).toBe(true);
            expect(hasActiveAdjustments({ vignetteAmount: 0 })).toBe(false);
        });

        it('handles gamma adjustment', () => {
            expect(hasActiveAdjustments({ gamma: 1.2 })).toBe(true);
            expect(hasActiveAdjustments({ gamma: 1.0 })).toBe(false);
        });

        it('handles noise reduction', () => {
            expect(hasActiveAdjustments({ noiseReduction: 50 })).toBe(true);
            expect(hasActiveAdjustments({ noiseReduction: 0 })).toBe(false);
        });
    });
});
