import { DEFAULT_RENDER_PARAMS, type RenderParams } from '../CardCanvas';
import type { CardOverrides } from '../../../../shared/types';

/**
 * Convert RenderParams to CardOverrides (only changed values)
 */
export function paramsToOverrides(params: RenderParams): CardOverrides {
    const overrides: CardOverrides = {};
    if (params.brightness !== DEFAULT_RENDER_PARAMS.brightness) overrides.brightness = params.brightness;
    if (params.contrast !== DEFAULT_RENDER_PARAMS.contrast) overrides.contrast = params.contrast;
    if (params.saturation !== DEFAULT_RENDER_PARAMS.saturation) overrides.saturation = params.saturation;

    // Darken settings: only save as overrides if NOT using global default
    if (!params.darkenUseGlobalSettings) {
        // Save the flag so we know they explicitly chose per-card settings
        overrides.darkenUseGlobalSettings = false;
        // Save all darken values (even if they match defaults) when using per-card settings
        overrides.darkenMode = params.darkenMode;
        overrides.darkenThreshold = params.darkenThreshold;
        overrides.darkenContrast = params.darkenContrast;
        overrides.darkenEdgeWidth = params.darkenEdgeWidth;
        overrides.darkenAmount = params.darkenAmount;
        overrides.darkenBrightness = params.darkenBrightness;
        overrides.darkenAutoDetect = params.darkenAutoDetect;
    }
    // When darkenUseGlobalSettings is true, we don't save any darken overrides so they fall back to global

    if (params.sharpness !== DEFAULT_RENDER_PARAMS.sharpness) overrides.sharpness = params.sharpness;
    if (params.pop !== DEFAULT_RENDER_PARAMS.pop) overrides.pop = params.pop;
    // Color effects
    if (params.hueShift !== DEFAULT_RENDER_PARAMS.hueShift) overrides.hueShift = params.hueShift;
    if (params.sepia !== DEFAULT_RENDER_PARAMS.sepia) overrides.sepia = params.sepia;
    if (params.tintColor !== DEFAULT_RENDER_PARAMS.tintColor) overrides.tintColor = params.tintColor;
    if (params.tintAmount !== DEFAULT_RENDER_PARAMS.tintAmount) overrides.tintAmount = params.tintAmount;
    if (params.redBalance !== DEFAULT_RENDER_PARAMS.redBalance) overrides.redBalance = params.redBalance;
    if (params.greenBalance !== DEFAULT_RENDER_PARAMS.greenBalance) overrides.greenBalance = params.greenBalance;
    if (params.blueBalance !== DEFAULT_RENDER_PARAMS.blueBalance) overrides.blueBalance = params.blueBalance;
    if (params.cyanBalance !== DEFAULT_RENDER_PARAMS.cyanBalance) overrides.cyanBalance = params.cyanBalance;
    if (params.magentaBalance !== DEFAULT_RENDER_PARAMS.magentaBalance) overrides.magentaBalance = params.magentaBalance;
    if (params.yellowBalance !== DEFAULT_RENDER_PARAMS.yellowBalance) overrides.yellowBalance = params.yellowBalance;
    if (params.blackBalance !== DEFAULT_RENDER_PARAMS.blackBalance) overrides.blackBalance = params.blackBalance;
    // Color Balance (Shadows/Midtones/Highlights)
    if (params.shadowsIntensity !== DEFAULT_RENDER_PARAMS.shadowsIntensity) overrides.shadowsIntensity = params.shadowsIntensity;
    if (params.midtonesIntensity !== DEFAULT_RENDER_PARAMS.midtonesIntensity) overrides.midtonesIntensity = params.midtonesIntensity;
    if (params.highlightsIntensity !== DEFAULT_RENDER_PARAMS.highlightsIntensity) overrides.highlightsIntensity = params.highlightsIntensity;
    // Noise Reduction
    if (params.noiseReduction !== DEFAULT_RENDER_PARAMS.noiseReduction) overrides.noiseReduction = params.noiseReduction;
    // Preview Modes
    if (params.cmykPreview !== DEFAULT_RENDER_PARAMS.cmykPreview) overrides.cmykPreview = params.cmykPreview;
    // Holographic Effect
    if (params.holoEffect !== DEFAULT_RENDER_PARAMS.holoEffect) overrides.holoEffect = params.holoEffect;
    if (params.holoStrength !== DEFAULT_RENDER_PARAMS.holoStrength) overrides.holoStrength = params.holoStrength;
    if (params.holoAreaMode !== DEFAULT_RENDER_PARAMS.holoAreaMode) overrides.holoAreaMode = params.holoAreaMode;
    if (params.holoAreaThreshold !== DEFAULT_RENDER_PARAMS.holoAreaThreshold) overrides.holoAreaThreshold = params.holoAreaThreshold;
    if (params.holoAnimation !== DEFAULT_RENDER_PARAMS.holoAnimation) overrides.holoAnimation = params.holoAnimation;
    if (params.holoSpeed !== DEFAULT_RENDER_PARAMS.holoSpeed) overrides.holoSpeed = params.holoSpeed;
    if (params.holoExportMode !== DEFAULT_RENDER_PARAMS.holoExportMode) overrides.holoExportMode = params.holoExportMode;
    if (params.holoSweepWidth !== DEFAULT_RENDER_PARAMS.holoSweepWidth) overrides.holoSweepWidth = params.holoSweepWidth;
    if (params.holoStarSize !== DEFAULT_RENDER_PARAMS.holoStarSize) overrides.holoStarSize = params.holoStarSize;
    if (params.holoStarVariety !== DEFAULT_RENDER_PARAMS.holoStarVariety) overrides.holoStarVariety = params.holoStarVariety;
    if (params.holoProbability !== DEFAULT_RENDER_PARAMS.holoProbability) overrides.holoProbability = params.holoProbability;
    if (params.holoBlur !== DEFAULT_RENDER_PARAMS.holoBlur) overrides.holoBlur = params.holoBlur;
    // holoAngle is NOT persisted - it's runtime-only for animation
    // Color Replace
    if (params.colorReplaceEnabled !== DEFAULT_RENDER_PARAMS.colorReplaceEnabled) overrides.colorReplaceEnabled = params.colorReplaceEnabled;
    if (params.colorReplaceSource !== DEFAULT_RENDER_PARAMS.colorReplaceSource) overrides.colorReplaceSource = params.colorReplaceSource;
    if (params.colorReplaceTarget !== DEFAULT_RENDER_PARAMS.colorReplaceTarget) overrides.colorReplaceTarget = params.colorReplaceTarget;
    if (params.colorReplaceThreshold !== DEFAULT_RENDER_PARAMS.colorReplaceThreshold) overrides.colorReplaceThreshold = params.colorReplaceThreshold;
    // Gamma
    if (params.gamma !== DEFAULT_RENDER_PARAMS.gamma) overrides.gamma = params.gamma;
    // Border effects
    if (params.vignetteAmount !== DEFAULT_RENDER_PARAMS.vignetteAmount) overrides.vignetteAmount = params.vignetteAmount;
    if (params.vignetteSize !== DEFAULT_RENDER_PARAMS.vignetteSize) overrides.vignetteSize = params.vignetteSize;
    if (params.vignetteFeather !== DEFAULT_RENDER_PARAMS.vignetteFeather) overrides.vignetteFeather = params.vignetteFeather;
    return overrides;
}
