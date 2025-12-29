import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    destroySpriteData,
    applyDarkenFilter,
    applyAdjustmentFilter,
    calculateCardHoloAnimation,
    type SpriteData,
    type CardOverrides,
} from './cardFilterUtils';

// Mock performance.now
vi.stubGlobal('performance', { now: () => 5000 });

describe('cardFilterUtils', () => {
    describe('destroySpriteData', () => {
        it('should call destroy on all resources', () => {
            const mockSpriteData = {
                sprite: { destroy: vi.fn() },
                darkenFilter: { destroy: vi.fn() },
                adjustFilter: { destroy: vi.fn() },
                frontTexture: { destroy: vi.fn() },
                backTexture: { destroy: vi.fn() },
                frontBlobSize: 1000,
            } as unknown as SpriteData;

            destroySpriteData(mockSpriteData);

            expect(mockSpriteData.sprite.destroy).toHaveBeenCalled();
            expect(mockSpriteData.frontTexture.destroy).toHaveBeenCalled();
            expect(mockSpriteData.backTexture?.destroy).toHaveBeenCalled();
            expect(mockSpriteData.darkenFilter.destroy).toHaveBeenCalled();
            expect(mockSpriteData.adjustFilter.destroy).toHaveBeenCalled();
        });

        it('should not throw if resources are undefined', () => {
            const mockSpriteData = {
                sprite: undefined,
                darkenFilter: undefined,
                adjustFilter: undefined,
                frontTexture: undefined,
                backTexture: undefined,
                frontBlobSize: 0,
            } as unknown as SpriteData;

            expect(() => destroySpriteData(mockSpriteData)).not.toThrow();
        });

        it('should catch and ignore errors during cleanup', () => {
            const mockSpriteData = {
                sprite: { destroy: vi.fn(() => { throw new Error('test error'); }) },
                darkenFilter: { destroy: vi.fn() },
                adjustFilter: { destroy: vi.fn() },
                frontTexture: { destroy: vi.fn() },
                frontBlobSize: 0,
            } as unknown as SpriteData;

            expect(() => destroySpriteData(mockSpriteData)).not.toThrow();
        });
    });

    describe('applyDarkenFilter', () => {
        let mockFilter: Record<string, unknown>;
        const globalSettings = {
            darkenMode: 'none' as const,
            darkenContrast: 2.0,
            darkenEdgeWidth: 0.15,
            darkenAmount: 1.0,
            darkenBrightness: -50,
            darkenAutoDetect: true,
        };
        const textureSize: [number, number] = [744, 1039];

        beforeEach(() => {
            mockFilter = {};
        });

        it('should apply global settings when no overrides', () => {
            applyDarkenFilter(mockFilter as never, undefined, globalSettings, 0.5, textureSize);

            expect(mockFilter.darkenMode).toBe('none');
            expect(mockFilter.darkenAmount).toBe(1.0);
            expect(mockFilter.textureResolution).toEqual(textureSize);
        });

        it('should apply card overrides over global settings', () => {
            const overrides: CardOverrides = {
                darkenMode: 'darken-all',
                darkenAmount: 0.5,
            };

            applyDarkenFilter(mockFilter as never, overrides, globalSettings, 0.5, textureSize);

            expect(mockFilter.darkenMode).toBe('darken-all');
            expect(mockFilter.darkenAmount).toBe(0.5);
        });

        it('should use auto-detect base values for contrast modes', () => {
            const settings = { ...globalSettings, darkenMode: 'contrast-edges' as const };
            applyDarkenFilter(mockFilter as never, undefined, settings, 0.5, textureSize);

            expect(mockFilter.darkenContrast).toBe(2.0);
            expect(mockFilter.darkenBrightness).toBe(-50);
        });

        it('should use manual values when autoDetect is false', () => {
            const settings = { ...globalSettings, darkenAutoDetect: false, darkenContrast: 3.0 };
            applyDarkenFilter(mockFilter as never, undefined, settings, 0.5, textureSize);

            expect(mockFilter.darkenContrast).toBe(3.0);
        });
    });

    describe('applyAdjustmentFilter', () => {
        let mockFilter: Record<string, unknown>;
        const textureSize: [number, number] = [744, 1039];
        const holoAnimation = { angle: 45, strength: 50 };

        beforeEach(() => {
            mockFilter = {};
        });

        it('should apply default values when no overrides', () => {
            applyAdjustmentFilter(mockFilter as never, undefined, textureSize, holoAnimation);

            expect(mockFilter.brightness).toBe(0);
            expect(mockFilter.contrast).toBe(1);
            expect(mockFilter.saturation).toBe(1);
            expect(mockFilter.holoEffect).toBe('none');
            expect(mockFilter.textureResolution).toEqual(textureSize);
        });

        it('should apply card overrides', () => {
            const overrides: CardOverrides = {
                brightness: 10,
                contrast: 1.2,
                saturation: 1.5,
                holoEffect: 'rainbow',
                holoStrength: 75,
            };

            applyAdjustmentFilter(mockFilter as never, overrides, textureSize, holoAnimation);

            expect(mockFilter.brightness).toBe(10);
            expect(mockFilter.contrast).toBe(1.2);
            expect(mockFilter.saturation).toBe(1.5);
            expect(mockFilter.holoEffect).toBe('rainbow');
        });

        it('should set holo animation values', () => {
            applyAdjustmentFilter(mockFilter as never, undefined, textureSize, { angle: 90, strength: 80 });

            expect(mockFilter.holoAngle).toBe(90);
            expect(mockFilter.holoStrength).toBe(80);
        });

        it('should apply color balance settings', () => {
            const overrides: CardOverrides = {
                redBalance: 10,
                greenBalance: -5,
                blueBalance: 15,
                cyanBalance: 5,
            };

            applyAdjustmentFilter(mockFilter as never, overrides, textureSize, holoAnimation);

            expect(mockFilter.redBalance).toBe(10);
            expect(mockFilter.greenBalance).toBe(-5);
            expect(mockFilter.blueBalance).toBe(15);
            expect(mockFilter.cyanBalance).toBe(5);
        });
    });

    describe('calculateCardHoloAnimation', () => {
        it('should return default values when no holo effect', () => {
            const result = calculateCardHoloAnimation(undefined);
            expect(result.angle).toBe(45);
            expect(result.strength).toBe(50);
        });

        it('should return static angle when animation is none', () => {
            const overrides: CardOverrides = {
                holoEffect: 'rainbow',
                holoAnimation: 'none',
                holoStrength: 75,
            };
            const result = calculateCardHoloAnimation(overrides);
            expect(result.angle).toBe(45);
            expect(result.strength).toBe(75);
        });

        it('should calculate wave animation', () => {
            const overrides: CardOverrides = {
                holoEffect: 'rainbow',
                holoAnimation: 'wave',
                holoSpeed: 5,
            };
            const result = calculateCardHoloAnimation(overrides);
            // time = 5 (5000ms / 1000), speed = 5, 5 * 5 * 30 = 750, % 360 = 30
            expect(result.angle).toBe(30);
        });

        it('should calculate pulse animation', () => {
            const overrides: CardOverrides = {
                holoEffect: 'rainbow',
                holoAnimation: 'pulse',
                holoSpeed: 5,
                holoStrength: 100,
            };
            const result = calculateCardHoloAnimation(overrides);
            // Strength should vary between 20% and 100% of holoStrength
            expect(result.strength).toBeGreaterThanOrEqual(20);
            expect(result.strength).toBeLessThanOrEqual(100);
        });

        it('should calculate sweep animation with 1000+ angle', () => {
            const overrides: CardOverrides = {
                holoEffect: 'rainbow',
                holoAnimation: 'sweep',
                holoSpeed: 5,
            };
            const result = calculateCardHoloAnimation(overrides);
            expect(result.angle).toBeGreaterThanOrEqual(1000);
            expect(result.angle).toBeLessThanOrEqual(1180);
        });

        it('should calculate twinkle animation with 2000+ angle', () => {
            const overrides: CardOverrides = {
                holoEffect: 'rainbow',
                holoAnimation: 'twinkle',
                holoSpeed: 5,
            };
            const result = calculateCardHoloAnimation(overrides);
            expect(result.angle).toBeGreaterThanOrEqual(2000);
        });
    });
});
