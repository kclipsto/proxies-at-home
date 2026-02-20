/**
 * CardCanvas Types
 * 
 * Types for the CardCanvas component and its rendering parameters.
 */

import type { DarkenMode } from '../../store/settings';

/**
 * Render parameters for CardCanvas.
 * These control all visual adjustments applied via shader uniforms.
 */
export interface RenderParams {
    // === Darkening ===
    /** Darkening mode: none, darken-all, contrast-edges, contrast-full */
    darkenMode: DarkenMode;
    /** Threshold for darken-all mode (0-255, pixels below this get darkened) */
    darkenThreshold: number;
    /** Contrast multiplier for edge/full modes (0.5-2.0) */
    darkenContrast: number;
    /** Edge width as percentage of image dimension for edge mode (0-1.0, where 0.1 = 10%) */
    darkenEdgeWidth: number;
    /** How much to apply darkening (0.0-1.0, 0=none, 1=full) */
    darkenAmount: number;
    /** Brightness offset for darkening (-50 to +50) */
    darkenBrightness: number;
    /** Whether to use global default darken settings (true) or per-card overrides (false) */
    darkenUseGlobalSettings: boolean;
    /** Whether to auto-detect darkness from histogram (true) or use manual contrast/brightness (false) */
    darkenAutoDetect: boolean;

    // === Image Adjustments ===
    /** Global brightness adjustment (-100 to +100) */
    brightness: number;
    /** Global contrast multiplier (0.5-2.0) */
    contrast: number;
    /** Saturation (0-2.0, 0=grayscale, 1=normal, 2=vivid) */
    saturation: number;
    /** Sharpness (0-1.0) */
    sharpness: number;
    /** Pop effect - combines contrast boost in midtones (0-100) */
    pop: number;

    // === Color Effects ===
    /** Hue rotation in degrees (-180 to +180) */
    hueShift: number;
    /** Sepia tone intensity (0-1.0) */
    sepia: number;
    /** Color tint (hex color string like '#ff0000') */
    tintColor: string;
    /** Color tint intensity (0-1.0) */
    tintAmount: number;
    /** Red channel balance (-100 to +100) */
    redBalance: number;
    /** Green channel balance (-100 to +100) */
    greenBalance: number;
    /** Blue channel balance (-100 to +100) */
    blueBalance: number;
    /** Cyan channel balance (-100 to +100) */
    cyanBalance: number;
    /** Magenta channel balance (-100 to +100) */
    magentaBalance: number;
    /** Yellow channel balance (-100 to +100) */
    yellowBalance: number;
    /** Black (Key) channel balance (-100 to +100) */
    blackBalance: number;

    // === Color Balance (Shadows/Midtones/Highlights) ===
    /** Shadows intensity adjustment (-100 to +100) */
    shadowsIntensity: number;
    /** Midtones intensity adjustment (-100 to +100) */
    midtonesIntensity: number;
    /** Highlights intensity adjustment (-100 to +100) */
    highlightsIntensity: number;

    // === Noise Reduction ===
    /** Noise reduction strength (0-100) - blur amount to reduce noise */
    noiseReduction: number;

    // === Preview Modes ===
    /** CMYK Preview - simulate print colors by clipping out-of-gamut colors */
    cmykPreview: boolean;

    // === Holographic Effect ===
    /** Holographic effect type: 'none', 'rainbow', 'glitter', 'stars' */
    holoEffect: 'none' | 'rainbow' | 'glitter' | 'stars';
    /** Holographic effect strength (0-100) */
    holoStrength: number;
    /** Holographic area mode: 'full' = entire card, 'bright' = only bright/metallic areas */
    holoAreaMode: 'full' | 'bright';
    /** Holographic area threshold for bright mode (0-100, higher = only very bright areas) */
    holoAreaThreshold: number;
    /** Holographic animation: 'wave' = rotating, 'pulse' = pulsing, 'sweep' = linear sweep, 'twinkle' = random twinkling */
    holoAnimation: 'none' | 'wave' | 'pulse' | 'sweep' | 'twinkle';
    /** Holographic animation speed (1-10, higher = faster) */
    holoSpeed: number;
    /** Holographic sweep band width (10-100 percentage of card width) */
    holoSweepWidth: number;
    /** Holographic star size (10-100, only for stars effect) */
    holoStarSize: number;
    /** Holographic star variety/randomness (0-100, only for stars effect) */
    holoStarVariety: number;
    /** Holographic probability/density (0-100) */
    holoProbability: number;
    /** Holographic export mode: 'static' = use fixed angle, 'none' = disable for export */
    holoExportMode: 'static' | 'none';
    /** Current holographic angle (0-360, not persisted - used for animation) */
    holoAngle: number;
    holoBlur: number;

    // === Color Replace ===
    /** Enable color replacement */
    colorReplaceEnabled: boolean;
    /** Source color to replace (hex string, e.g. '#ff0000') */
    colorReplaceSource: string;
    /** Target color to replace with (hex string) */
    colorReplaceTarget: string;
    /** Color match threshold (0-100, higher = more tolerance) */
    colorReplaceThreshold: number;

    // === Gamma ===
    /** Gamma correction (0.1-3.0, 1.0 = no change) */
    gamma: number;

    // === Border Effects ===
    /** Vignette intensity (0-1.0) */
    vignetteAmount: number;
    /** Vignette size - radius where center is visible (0-1.0, higher = more center) */
    vignetteSize: number;
    /** Vignette feather - softness of edge (0-1.0, higher = softer) */
    vignetteFeather: number;

    /** Explicit DPI for resolution-aware scaling */
    dpi?: number;
}

/**
 * Default render parameters (no modifications).
 */
export const DEFAULT_RENDER_PARAMS: RenderParams = {
    darkenMode: 'none',
    darkenThreshold: 30,
    darkenContrast: 2.0,
    darkenEdgeWidth: 0.1,
    darkenAmount: 1.0,
    darkenBrightness: -50,
    darkenUseGlobalSettings: true,
    darkenAutoDetect: true,
    brightness: 0,
    contrast: 1.0,
    saturation: 1.0,
    sharpness: 0,
    pop: 0,
    // Color effects
    hueShift: 0,
    sepia: 0,
    tintColor: '#ffffff',
    tintAmount: 0,
    redBalance: 0,
    greenBalance: 0,
    blueBalance: 0,
    cyanBalance: 0,
    magentaBalance: 0,
    yellowBalance: 0,
    blackBalance: 0,
    // Color Balance (Shadows/Midtones/Highlights)
    shadowsIntensity: 0,
    midtonesIntensity: 0,
    highlightsIntensity: 0,
    // Noise Reduction
    noiseReduction: 0,
    // Preview Modes
    cmykPreview: false,
    // Holographic Effect
    holoEffect: 'none',
    holoStrength: 50,
    holoAreaMode: 'full',
    holoAreaThreshold: 50, // Default 50% brightness threshold
    holoAnimation: 'none',
    holoSpeed: 5,
    holoSweepWidth: 33, // Default 33% (1/3 of card width)
    holoStarSize: 50, // Default 50% star size
    holoStarVariety: 50, // Default 50% position randomness
    holoProbability: 20, // Default 20% density
    holoExportMode: 'static',
    holoAngle: 45, // Default angle for static effect
    holoBlur: 10, // Default blur amount for glitter
    // Color Replace
    colorReplaceEnabled: false,
    colorReplaceSource: '#ff0000',
    colorReplaceTarget: '#00ff00',
    colorReplaceThreshold: 30,
    // Gamma
    gamma: 1.0,
    // Border effects
    vignetteAmount: 0,
    vignetteSize: 0.8,
    vignetteFeather: 0.5,
    // Context
    dpi: undefined,
};

/**
 * Props for the CardCanvas component.
 */
export interface CardCanvasProps {
    /** Processed image with bleed, no effects applied */
    baseTexture: Blob;
    /** Edge distance texture from JFA (optional, for edge modes) */
    distanceField?: Blob;
    /** Pre-computed darkness factor from histogram (0-1) */
    darknessFactor: number;
    /** Canvas width in pixels */
    width: number;
    /** Canvas height in pixels */
    height: number;
    /** Render parameters controlling all visual adjustments */
    params: RenderParams;
    /** Callback after each render */
    onRender?: () => void;
    /** Callback when canvas is ready (textures loaded, first render complete) */
    onReady?: () => void;
    /** Additional CSS class */
    className?: string;
    /** Additional inline styles */
    style?: React.CSSProperties;
}

/**
 * Convert DarkenMode string to shader int.
 */
export function darkenModeToInt(mode: DarkenMode): number {
    switch (mode) {
        case 'none': return 0;
        case 'darken-all': return 1;
        case 'contrast-edges': return 2;
        case 'contrast-full': return 3;
        default: return 0;
    }
}
