/**
 * Shared adjustment utilities for card overrides
 * 
 * This file contains utilities that need to be shared between:
 * - Main thread PixiJS components (PixiVirtualCanvas, PixiPageCanvas)
 * - Web Workers (cardCanvasWorker)
 */

import type { CardOverrides } from '../../../shared/types';

// Default values for adjustment settings - used to detect non-default values
const ADJUSTMENT_DEFAULTS = {
    // Basic adjustments
    brightness: 0,
    contrast: 1,
    saturation: 1,
    sharpness: 0,
    pop: 0,
    // Color effects
    hueShift: 0,
    sepia: 0,
    tintAmount: 0,
    redBalance: 0,
    greenBalance: 0,
    blueBalance: 0,
    cyanBalance: 0,
    magentaBalance: 0,
    yellowBalance: 0,
    blackBalance: 0,
    // Color balance
    shadowsIntensity: 0,
    midtonesIntensity: 0,
    highlightsIntensity: 0,
    // Noise reduction
    noiseReduction: 0,
    // Gamma
    gamma: 1.0,
    // Border effects
    vignetteAmount: 0,
} as const;

/**
 * Check if any adjustment filters are active (non-default values)
 * This includes both adjustment filter settings AND darken-related overrides.
 * 
 * Used by:
 * - PixiVirtualCanvas/PixiPageCanvas to decide whether to apply adjustment filter
 * - cardCanvasWorker to decide whether WebGL re-rendering is needed
 * 
 * @param overrides - Card overrides to check
 * @param includeDarkenSettings - If true, also check darken-related settings (for worker use)
 */
export function hasActiveAdjustments(
    overrides?: CardOverrides,
    includeDarkenSettings: boolean = false
): boolean {
    if (!overrides) return false;

    // Check numeric defaults
    for (const [key, defaultVal] of Object.entries(ADJUSTMENT_DEFAULTS)) {
        const val = overrides[key as keyof CardOverrides];
        if (val !== undefined && val !== defaultVal) {
            return true;
        }
    }

    // Check boolean/enum settings
    if (overrides.cmykPreview) return true;
    if (overrides.colorReplaceEnabled) return true;
    if (overrides.holoEffect && overrides.holoEffect !== 'none') return true;

    // Darken-related checks (used by worker to detect any per-card override)
    if (includeDarkenSettings) {
        if (overrides.darkenThreshold !== undefined) return true;
        if (overrides.darkenContrast !== undefined) return true;
        if (overrides.darkenEdgeWidth !== undefined) return true;
        if (overrides.darkenAmount !== undefined) return true;
        if (overrides.darkenBrightness !== undefined) return true;
        if (overrides.darkenAutoDetect !== undefined) return true;
    }

    return false;
}
