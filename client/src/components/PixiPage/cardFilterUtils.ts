/**
 * Card Filter Utilities for PixiVirtualCanvas
 * 
 * Helper functions for applying darken/adjustment filters to card sprites.
 */

import type { Texture, Sprite as PixiSprite } from 'pixi.js';
import type { DarkenFilter } from './filters';
import type { AdjustmentFilter } from './filters';
import type { DarkenMode } from '../../store/settings';

/**
 * Sprite data structure for card sprites
 */
export interface SpriteData {
    sprite: PixiSprite;
    darkenFilter: DarkenFilter;
    adjustFilter: AdjustmentFilter;
    frontTexture: Texture;
    backTexture?: Texture;
    frontBlobSize: number;
    backBlobSize?: number;
    frontImageId?: string;
    backImageId?: string;
    isPlaceholder?: boolean;
}

/**
 * Safely destroy all resources associated with a sprite
 */
export function destroySpriteData(data: SpriteData): void {
    try {
        data.sprite?.destroy();
        data.frontTexture?.destroy();
        data.backTexture?.destroy();
        data.darkenFilter?.destroy();
        data.adjustFilter?.destroy();
    } catch {
        // Ignore cleanup errors
    }
}

// Re-export from shared utility for backward compatibility
export { hasActiveAdjustments } from '../../helpers/adjustmentUtils';



export interface CardOverrides {
    // Darken settings
    darkenMode?: DarkenMode;
    darkenThreshold?: number;
    darkenContrast?: number;
    darkenEdgeWidth?: number;
    darkenAmount?: number;
    darkenBrightness?: number;
    darkenAutoDetect?: boolean;
    // Basic adjustments
    brightness?: number;
    contrast?: number;
    saturation?: number;
    sharpness?: number;
    pop?: number;
    // Color effects
    hueShift?: number;
    sepia?: number;
    tintColor?: string;
    tintAmount?: number;
    redBalance?: number;
    greenBalance?: number;
    blueBalance?: number;
    cyanBalance?: number;
    magentaBalance?: number;
    yellowBalance?: number;
    blackBalance?: number;
    // Color balance
    shadowsIntensity?: number;
    midtonesIntensity?: number;
    highlightsIntensity?: number;
    // Noise reduction
    noiseReduction?: number;
    // Preview modes
    cmykPreview?: boolean;
    // Holographic
    holoEffect?: 'none' | 'rainbow' | 'glitter' | 'stars';
    holoAnimation?: 'none' | 'wave' | 'pulse' | 'sweep' | 'twinkle';
    holoSpeed?: number;
    holoStrength?: number;
    holoSweepWidth?: number;
    holoStarSize?: number;
    holoStarVariety?: number;
    holoBlur?: number;
    holoProbability?: number;
    holoAreaMode?: 'full' | 'bright';
    holoAreaThreshold?: number;
    // Color replace
    colorReplaceEnabled?: boolean;
    colorReplaceSource?: string;
    colorReplaceTarget?: string;
    colorReplaceThreshold?: number;
    // Gamma
    gamma?: number;
    // Border effects
    vignetteAmount?: number;
    vignetteSize?: number;
    vignetteFeather?: number;
}

/**
 * Apply darken filter settings to a DarkenFilter instance
 */
export function applyDarkenFilter(
    filter: DarkenFilter,
    overrides: CardOverrides | undefined,
    globalSettings: {
        darkenMode: DarkenMode;
        darkenContrast: number;
        darkenEdgeWidth: number;
        darkenAmount: number;
        darkenBrightness: number;
        darkenAutoDetect: boolean;
    },
    darknessFactor: number,
    textureSize: [number, number]
): void {
    const effectiveMode = overrides?.darkenMode ?? globalSettings.darkenMode;
    const autoDetect = overrides?.darkenAutoDetect ?? globalSettings.darkenAutoDetect;

    // When Auto Detect is enabled for contrast modes, use base values with darknessFactor
    let effectiveContrast: number;
    let effectiveBrightness: number;

    if (autoDetect && (effectiveMode === 'contrast-edges' || effectiveMode === 'contrast-full')) {
        effectiveContrast = 2.0;
        effectiveBrightness = -50;
    } else {
        effectiveContrast = overrides?.darkenContrast ?? globalSettings.darkenContrast;
        effectiveBrightness = overrides?.darkenBrightness ?? globalSettings.darkenBrightness;
    }

    filter.darkenMode = effectiveMode;
    filter.darknessFactor = darknessFactor;
    filter.darkenThreshold = overrides?.darkenThreshold ?? 30;
    filter.darkenContrast = effectiveContrast;
    filter.darkenEdgeWidth = overrides?.darkenEdgeWidth ?? globalSettings.darkenEdgeWidth;
    filter.darkenAmount = overrides?.darkenAmount ?? globalSettings.darkenAmount;
    filter.darkenBrightness = effectiveBrightness;
    filter.textureResolution = textureSize;
}

/**
 * Apply adjustment filter settings to an AdjustmentFilter instance
 */
export function applyAdjustmentFilter(
    filter: AdjustmentFilter,
    overrides: CardOverrides | undefined,
    textureSize: [number, number],
    holoAnimation: { angle: number; strength: number }
): void {
    filter.textureResolution = textureSize;

    // Basic adjustments
    filter.brightness = overrides?.brightness ?? 0;
    filter.contrast = overrides?.contrast ?? 1;
    filter.saturation = overrides?.saturation ?? 1;
    filter.sharpness = overrides?.sharpness ?? 0;
    filter.pop = overrides?.pop ?? 0;

    // Color effects
    filter.hueShift = overrides?.hueShift ?? 0;
    filter.sepia = overrides?.sepia ?? 0;
    filter.tintColor = overrides?.tintColor ?? '#ffffff';
    filter.tintAmount = overrides?.tintAmount ?? 0;
    filter.redBalance = overrides?.redBalance ?? 0;
    filter.greenBalance = overrides?.greenBalance ?? 0;
    filter.blueBalance = overrides?.blueBalance ?? 0;

    // CMYK balance
    filter.cyanBalance = overrides?.cyanBalance ?? 0;
    filter.magentaBalance = overrides?.magentaBalance ?? 0;
    filter.yellowBalance = overrides?.yellowBalance ?? 0;
    filter.blackBalance = overrides?.blackBalance ?? 0;

    // Color Balance (Shadows/Midtones/Highlights)
    filter.shadowsIntensity = overrides?.shadowsIntensity ?? 0;
    filter.midtonesIntensity = overrides?.midtonesIntensity ?? 0;
    filter.highlightsIntensity = overrides?.highlightsIntensity ?? 0;

    // Noise Reduction
    filter.noiseReduction = overrides?.noiseReduction ?? 0;

    // Preview Modes
    filter.cmykPreview = overrides?.cmykPreview ?? false;

    // Holographic Effect
    filter.holoEffect = overrides?.holoEffect ?? 'none';
    filter.holoAreaMode = overrides?.holoAreaMode ?? 'full';
    filter.holoAngle = holoAnimation.angle;
    filter.holoStrength = holoAnimation.strength;
    filter.holoSweepWidth = overrides?.holoSweepWidth ?? 33;
    filter.holoStarSize = overrides?.holoStarSize ?? 50;
    filter.holoStarVariety = overrides?.holoStarVariety ?? 50;
    filter.holoBlur = overrides?.holoBlur ?? 10;
    filter.holoProbability = overrides?.holoProbability ?? 50;
    filter.holoAreaThreshold = overrides?.holoAreaThreshold ?? 50;

    // Color Replace
    filter.colorReplaceEnabled = overrides?.colorReplaceEnabled ?? false;
    filter.colorReplaceSource = overrides?.colorReplaceSource ?? '#ff0000';
    filter.colorReplaceTarget = overrides?.colorReplaceTarget ?? '#00ff00';
    filter.colorReplaceThreshold = overrides?.colorReplaceThreshold ?? 30;

    // Gamma
    filter.gamma = overrides?.gamma ?? 1.0;

    // Border effects
    filter.vignetteAmount = overrides?.vignetteAmount ?? 0;
    filter.vignetteSize = overrides?.vignetteSize ?? 0.8;
    filter.vignetteFeather = overrides?.vignetteFeather ?? 0.5;
}

/**
 * Calculate per-card holographic animation angle and strength
 * Uses the shared calculateHoloAnimation for consistent behavior
 */
export function calculateCardHoloAnimation(
    overrides: CardOverrides | undefined
): { angle: number; strength: number } {
    const holoEffect = overrides?.holoEffect ?? 'none';
    const holoAnimation = overrides?.holoAnimation ?? 'none';
    const holoSpeed = overrides?.holoSpeed ?? 5;
    const holoStrength = overrides?.holoStrength ?? 50;
    const defaultAngle = 45;

    if (!holoEffect || holoEffect === 'none') {
        return { angle: defaultAngle, strength: holoStrength };
    }

    if (holoAnimation === 'none') {
        // Static mode: use fixed angle
        return { angle: defaultAngle, strength: holoStrength };
    }

    const now = performance.now();
    const time = now / 1000;
    let animatedAngle = defaultAngle;
    let animatedStrength = holoStrength;

    // Mirror the logic from holoAnimation.ts calculateHoloAnimation
    // but with simplified interface (no delta/currentAngle tracking needed per-card)
    switch (holoAnimation) {
        case 'wave':
            animatedAngle = (time * holoSpeed * 30) % 360;
            break;
        case 'pulse': {
            const pulse = (Math.sin(time * holoSpeed * 2) + 1) / 2;
            animatedStrength = holoStrength * (0.2 + pulse * 0.8);
            break;
        }
        case 'sweep': {
            const cycle = Math.sin(time * holoSpeed * 0.5) * 0.5 + 0.5;
            const sweepPos = cycle * 180;
            animatedAngle = 1000 + sweepPos;
            break;
        }
        case 'twinkle':
            // No modulo 360 for twinkle to ensure continuous wave phase for all particles
            // (shader uses sin(angle * speedVar), so wrapping angle breaks continuity when speedVar varies)
            animatedAngle = 2000 + (time * holoSpeed * 6);
            break;
        default:
            // Legacy or unknown: treat as wave
            animatedAngle = (time * holoSpeed * 30) % 360;
    }

    return { angle: animatedAngle, strength: animatedStrength };
}

