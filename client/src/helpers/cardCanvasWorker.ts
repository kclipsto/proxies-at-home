/**
 * CardCanvas utilities for WebGL rendering with adjustable parameters.
 * Includes worker-compatible version using OffscreenCanvas.
 */

import type { RenderParams } from '../components/CardCanvas/types';
import { DEFAULT_RENDER_PARAMS } from '../components/CardCanvas/types';
import type { CardOverrides } from '../../../shared/types';
import { ADJUSTMENT_FRAGMENT, getWorkerAdjustmentShader } from '../shaders/adjustmentShader';
import { hasActiveAdjustments } from './adjustmentUtils';
import { debugLog } from './debug';

// WebGL Debug Logging
const WEBGL_DEBUG = import.meta.env.DEV && import.meta.env.MODE !== 'test';
let webglContextCount = 0;
let webglContextsCreated = 0;

function webglLog(message: string, ...args: unknown[]) {
    if (WEBGL_DEBUG) {
        debugLog(`[WebGL-CardCanvas] ${message}`, ...args);
    }
}

function trackContextCreation(source: string): number {
    webglContextCount++;
    webglContextsCreated++;
    const id = webglContextsCreated;
    webglLog(`Context CREATED #${id} by ${source} (active: ${webglContextCount})`);
    return id;
}

function trackContextRelease(id: number, source: string) {
    webglContextCount--;
    webglLog(`Context RELEASED #${id} by ${source} (active: ${webglContextCount})`);
}

/**
 * Persistent WebGL context manager for effect rendering.
 * Maintains a single context that is reused across renders.
 * Only creates a new context on first use or if the previous one was lost.
 */
class WebGLContextManager {
    private canvas: OffscreenCanvas | null = null;
    private gl: WebGL2RenderingContext | null = null;
    private isContextLost = false;
    private contextId = 0;
    private readonly purpose: string;

    constructor(purpose: string) {
        this.purpose = purpose;
    }

    /**
     * Get or create a WebGL context at the specified size.
     * Reuses existing context if available and not lost.
     */
    getContext(width: number, height: number): { canvas: OffscreenCanvas; gl: WebGL2RenderingContext; isNew: boolean } {
        // Check if existing context is still valid (not lost by browser)
        if (this.canvas && this.gl && !this.isContextLost) {
            // Additional check: verify context wasn't silently lost by the browser
            if (this.gl.isContextLost()) {
                webglLog(`Context for ${this.purpose} was silently lost, recreating...`);
                this.isContextLost = true;
            } else {
                // Context is valid, resize if needed
                if (this.canvas.width !== width || this.canvas.height !== height) {
                    this.canvas.width = width;
                    this.canvas.height = height;
                    this.gl.viewport(0, 0, width, height);
                }
                return { canvas: this.canvas, gl: this.gl, isNew: false };
            }
        }

        // Need to create new context
        this.canvas = new OffscreenCanvas(width, height);
        this.gl = this.canvas.getContext("webgl2", {
            premultipliedAlpha: false,
            preserveDrawingBuffer: true,
            antialias: false,
        });

        if (!this.gl) {
            throw new Error("WebGL2 not supported");
        }

        // Set up context loss handler
        this.canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            webglLog(`Context lost event for ${this.purpose}`);
            this.isContextLost = true;
        });

        this.isContextLost = false;
        this.contextId = trackContextCreation(this.purpose);
        webglLog(`Context manager created new context for ${this.purpose}: ${width}x${height}`);

        return { canvas: this.canvas, gl: this.gl, isNew: true };
    }

    /**
     * Mark the context as lost. Next getContext() will create a new one.
     */
    handleContextLost() {
        if (this.contextId > 0) {
            trackContextRelease(this.contextId, this.purpose);
        }
        this.isContextLost = true;
        this.gl = null;
        this.canvas = null;
        webglLog(`Context lost for ${this.purpose}`);
    }

    /**
     * Explicitly release the context. Use only when done with all processing.
     */
    release() {
        if (this.gl && !this.isContextLost) {
            this.gl.getExtension("WEBGL_lose_context")?.loseContext();
            trackContextRelease(this.contextId, this.purpose);
        }
        this.gl = null;
        this.canvas = null;
        this.isContextLost = false;
        this.contextId = 0;
    }

    /**
     * Reset the context manager state (for testing).
     * Forces the next getContext call to create a new context.
     */
    reset() {
        this.gl = null;
        this.canvas = null;
        this.isContextLost = false;
        this.contextId = 0;
    }
}

// Module-level context manager - reused across all PDF/effect renders in this worker
const effectContextManager = new WebGLContextManager('effect-render');

/**
 * Reset the effect context manager (for testing purposes).
 * Forces the next render to create a new WebGL context.
 */
export function resetEffectContextManager() {
    effectContextManager.reset();
}

// Shader sources - exported for reuse by effect.worker.ts
export const VS_CARD_CANVAS = `#version 300 es
in vec2 a_position;
out vec2 v_texCoord;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    // Convert from clip space (-1 to 1) to texture space (0 to 1)
    // Flip Y because WebGL origin is bottom-left but textures expect top-left
    v_texCoord = vec2((a_position.x + 1.0) / 2.0, (1.0 - a_position.y) / 2.0);
}`;

// Get the full adjustment shader adapted for WebGL2 worker usage
// This includes all effects: gamma, colorReplace, holo, vignette, etc.
export const FS_CARD_CANVAS = getWorkerAdjustmentShader(ADJUSTMENT_FRAGMENT);

/**
 * Uniform locations for CardCanvas shader (full adjustment shader)
 */
export interface UniformLocations {
    u_baseTexture: WebGLUniformLocation | null;
    u_resolution: WebGLUniformLocation | null;
    // Basic adjustments
    u_brightness: WebGLUniformLocation | null;
    u_contrast: WebGLUniformLocation | null;
    u_saturation: WebGLUniformLocation | null;
    u_sharpness: WebGLUniformLocation | null;
    u_pop: WebGLUniformLocation | null;
    // Color effects
    u_hueShift: WebGLUniformLocation | null;
    u_sepia: WebGLUniformLocation | null;
    u_tintColor: WebGLUniformLocation | null;
    u_tintAmount: WebGLUniformLocation | null;
    // RGB Balance
    u_redBalance: WebGLUniformLocation | null;
    u_greenBalance: WebGLUniformLocation | null;
    u_blueBalance: WebGLUniformLocation | null;
    // CMYK Balance
    u_cyanBalance: WebGLUniformLocation | null;
    u_magentaBalance: WebGLUniformLocation | null;
    u_yellowBalance: WebGLUniformLocation | null;
    u_blackBalance: WebGLUniformLocation | null;
    // Color Balance (Shadows/Midtones/Highlights)
    u_shadowsIntensity: WebGLUniformLocation | null;
    u_midtonesIntensity: WebGLUniformLocation | null;
    u_highlightsIntensity: WebGLUniformLocation | null;
    // Noise Reduction & Preview
    u_noiseReduction: WebGLUniformLocation | null;
    u_cmykPreview: WebGLUniformLocation | null;
    // Holographic Effect
    u_holoEffect: WebGLUniformLocation | null;
    u_holoStrength: WebGLUniformLocation | null;
    u_holoAreaMode: WebGLUniformLocation | null;
    u_holoAreaThreshold: WebGLUniformLocation | null;
    u_holoAngle: WebGLUniformLocation | null;
    u_holoSweepWidth: WebGLUniformLocation | null;
    u_holoStarSize: WebGLUniformLocation | null;
    u_holoStarVariety: WebGLUniformLocation | null;
    u_holoBlur: WebGLUniformLocation | null;
    u_holoProbability: WebGLUniformLocation | null;
    u_holoUvOffset: WebGLUniformLocation | null;
    u_holoUvScale: WebGLUniformLocation | null;
    // Color Replace
    u_colorReplaceEnabled: WebGLUniformLocation | null;
    u_colorReplaceSource: WebGLUniformLocation | null;
    u_colorReplaceTarget: WebGLUniformLocation | null;
    u_colorReplaceThreshold: WebGLUniformLocation | null;
    // Gamma & Vignette
    u_gamma: WebGLUniformLocation | null;
    u_vignetteAmount: WebGLUniformLocation | null;
    u_vignetteSize: WebGLUniformLocation | null;
    u_vignetteFeather: WebGLUniformLocation | null;
}

/**
 * Convert DarkenMode string to shader int
 */
export function darkenModeToInt(mode: RenderParams['darkenMode']): number {
    switch (mode) {
        case 'none': return 0;
        case 'darken-all': return 1;
        case 'contrast-edges': return 2;
        case 'contrast-full': return 3;
        default: return 0;
    }
}

/**
 * Compile a shader
 */
export function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to create shader');

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error('Shader compile error: ' + info);
    }

    return shader;
}

/**
 * Create a program from shaders
 */
export function createProgram(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create program');

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error('Program link error: ' + info);
    }

    return program;
}

/**
 * Create texture from ImageBitmap
 */
export function createTextureFromBitmap(gl: WebGL2RenderingContext, bitmap: ImageBitmap): WebGLTexture {
    const texture = gl.createTexture();
    if (!texture) throw new Error('Failed to create texture');

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);

    return texture;
}

/**
 * Helper to parse hex color to RGB floats
 */
export function hexToRgb(hex: string): [number, number, number] {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return [r, g, b];
}

/**
 * Helper to convert holo effect type to shader int
 */
export function holoEffectToInt(effect: RenderParams['holoEffect']): number {
    switch (effect) {
        case 'none': return 0;
        case 'rainbow': return 1;
        case 'glitter': return 2;
        case 'stars': return 3;
        default: return 0;
    }
}

/**
 * Helper to convert holo area mode to shader int
 */
export function holoAreaModeToInt(mode: RenderParams['holoAreaMode']): number {
    switch (mode) {
        case 'full': return 0;
        case 'bright': return 1;
        default: return 0;
    }
}

/**
 * Update uniforms with current render parameters.
 */
export function updateUniforms(
    gl: WebGL2RenderingContext,
    uniforms: UniformLocations,
    params: RenderParams,
    width: number,
    height: number
): void {
    // Standardize 'Screen DPI' for parity calculations
    // PixiJS previews roughly reflect a 96 DPI screen
    const SCREEN_DPI = 96.0;

    let kernelScale = 1.0;
    if (params.dpi) {
        // Exact Calculation: Scale kernel to match the physical size on a 96 DPI screen
        kernelScale = Math.max(1.0, params.dpi / SCREEN_DPI);
    } else {
        // Fallback: Estimate DPI based on visual width (assuming ~750px is "standard" 300dpi look)
        kernelScale = Math.max(1.0, width / 750.0);
    }

    // Apply the scale to the RESOLUTION uniform (simulating a lower res)
    // This makes 1.0/uResolution larger, effectively scaling up the kernel size
    gl.uniform2f(uniforms.u_resolution, width / kernelScale, height / kernelScale);

    // Basic adjustments (note: shader expects uBrightness range -50 to +50 converted to /255)
    // Our params use normalized values, so we scale appropriately
    gl.uniform1f(uniforms.u_brightness, params.brightness); // Already in -100..+100 range
    gl.uniform1f(uniforms.u_contrast, params.contrast);
    gl.uniform1f(uniforms.u_saturation, params.saturation);
    gl.uniform1f(uniforms.u_sharpness, params.sharpness);
    gl.uniform1f(uniforms.u_pop, params.pop / 100.0); // Scale from 0-100 to 0-1

    // Color effects
    gl.uniform1f(uniforms.u_hueShift, params.hueShift);
    gl.uniform1f(uniforms.u_sepia, params.sepia);
    const tintRgb = hexToRgb(params.tintColor);
    gl.uniform3f(uniforms.u_tintColor, tintRgb[0], tintRgb[1], tintRgb[2]);
    gl.uniform1f(uniforms.u_tintAmount, params.tintAmount);

    // RGB Balance
    gl.uniform1f(uniforms.u_redBalance, params.redBalance);
    gl.uniform1f(uniforms.u_greenBalance, params.greenBalance);
    gl.uniform1f(uniforms.u_blueBalance, params.blueBalance);

    // CMYK Balance
    gl.uniform1f(uniforms.u_cyanBalance, params.cyanBalance);
    gl.uniform1f(uniforms.u_magentaBalance, params.magentaBalance);
    gl.uniform1f(uniforms.u_yellowBalance, params.yellowBalance);
    gl.uniform1f(uniforms.u_blackBalance, params.blackBalance);

    // Color Balance (Shadows/Midtones/Highlights)
    gl.uniform1f(uniforms.u_shadowsIntensity, params.shadowsIntensity);
    gl.uniform1f(uniforms.u_midtonesIntensity, params.midtonesIntensity);
    gl.uniform1f(uniforms.u_highlightsIntensity, params.highlightsIntensity);

    // Noise Reduction & Preview
    gl.uniform1f(uniforms.u_noiseReduction, params.noiseReduction);
    gl.uniform1f(uniforms.u_cmykPreview, params.cmykPreview ? 1.0 : 0.0);

    // Holographic Effect
    gl.uniform1f(uniforms.u_holoEffect, holoEffectToInt(params.holoEffect));
    gl.uniform1f(uniforms.u_holoStrength, params.holoStrength);
    gl.uniform1f(uniforms.u_holoAreaMode, holoAreaModeToInt(params.holoAreaMode));
    gl.uniform1f(uniforms.u_holoAreaThreshold, params.holoAreaThreshold);
    gl.uniform1f(uniforms.u_holoAngle, params.holoAngle);
    gl.uniform1f(uniforms.u_holoSweepWidth, params.holoSweepWidth);
    gl.uniform1f(uniforms.u_holoStarSize, params.holoStarSize);
    gl.uniform1f(uniforms.u_holoStarVariety, params.holoStarVariety);
    gl.uniform1f(uniforms.u_holoBlur, params.holoBlur);
    gl.uniform1f(uniforms.u_holoProbability, params.holoProbability);
    // UV correction for clipped sprites - full card in worker = no correction needed
    gl.uniform2f(uniforms.u_holoUvOffset, 0.0, 0.0);
    gl.uniform2f(uniforms.u_holoUvScale, 1.0, 1.0);

    // Color Replace
    gl.uniform1f(uniforms.u_colorReplaceEnabled, params.colorReplaceEnabled ? 1.0 : 0.0);
    const srcRgb = hexToRgb(params.colorReplaceSource);
    gl.uniform3f(uniforms.u_colorReplaceSource, srcRgb[0], srcRgb[1], srcRgb[2]);
    const tgtRgb = hexToRgb(params.colorReplaceTarget);
    gl.uniform3f(uniforms.u_colorReplaceTarget, tgtRgb[0], tgtRgb[1], tgtRgb[2]);
    gl.uniform1f(uniforms.u_colorReplaceThreshold, params.colorReplaceThreshold);

    // Gamma & Vignette
    gl.uniform1f(uniforms.u_gamma, params.gamma);
    gl.uniform1f(uniforms.u_vignetteAmount, params.vignetteAmount);
    gl.uniform1f(uniforms.u_vignetteSize, params.vignetteSize);
    gl.uniform1f(uniforms.u_vignetteFeather, params.vignetteFeather);
}

/**
 * Build RenderParams from CardOverrides, using defaults for unspecified values
 */
export function overridesToRenderParams(overrides: CardOverrides, globalDarkenMode?: RenderParams['darkenMode']): RenderParams {
    return {
        darkenMode: overrides.darkenMode ?? globalDarkenMode ?? DEFAULT_RENDER_PARAMS.darkenMode,
        darkenThreshold: overrides.darkenThreshold ?? DEFAULT_RENDER_PARAMS.darkenThreshold,
        darkenContrast: overrides.darkenContrast ?? DEFAULT_RENDER_PARAMS.darkenContrast,
        darkenEdgeWidth: overrides.darkenEdgeWidth ?? DEFAULT_RENDER_PARAMS.darkenEdgeWidth,
        darkenAmount: overrides.darkenAmount ?? DEFAULT_RENDER_PARAMS.darkenAmount,
        darkenBrightness: overrides.darkenBrightness ?? DEFAULT_RENDER_PARAMS.darkenBrightness,
        darkenUseGlobalSettings: overrides.darkenUseGlobalSettings ?? DEFAULT_RENDER_PARAMS.darkenUseGlobalSettings,
        darkenAutoDetect: overrides.darkenAutoDetect ?? DEFAULT_RENDER_PARAMS.darkenAutoDetect,
        brightness: overrides.brightness ?? DEFAULT_RENDER_PARAMS.brightness,
        contrast: overrides.contrast ?? DEFAULT_RENDER_PARAMS.contrast,
        saturation: overrides.saturation ?? DEFAULT_RENDER_PARAMS.saturation,
        sharpness: overrides.sharpness ?? DEFAULT_RENDER_PARAMS.sharpness,
        pop: overrides.pop ?? DEFAULT_RENDER_PARAMS.pop,
        // Color effects
        hueShift: overrides.hueShift ?? DEFAULT_RENDER_PARAMS.hueShift,
        sepia: overrides.sepia ?? DEFAULT_RENDER_PARAMS.sepia,
        tintColor: overrides.tintColor ?? DEFAULT_RENDER_PARAMS.tintColor,
        tintAmount: overrides.tintAmount ?? DEFAULT_RENDER_PARAMS.tintAmount,
        redBalance: overrides.redBalance ?? DEFAULT_RENDER_PARAMS.redBalance,
        greenBalance: overrides.greenBalance ?? DEFAULT_RENDER_PARAMS.greenBalance,
        blueBalance: overrides.blueBalance ?? DEFAULT_RENDER_PARAMS.blueBalance,
        cyanBalance: overrides.cyanBalance ?? DEFAULT_RENDER_PARAMS.cyanBalance,
        magentaBalance: overrides.magentaBalance ?? DEFAULT_RENDER_PARAMS.magentaBalance,
        yellowBalance: overrides.yellowBalance ?? DEFAULT_RENDER_PARAMS.yellowBalance,
        blackBalance: overrides.blackBalance ?? DEFAULT_RENDER_PARAMS.blackBalance,
        // Color Balance (Shadows/Midtones/Highlights)
        shadowsIntensity: overrides.shadowsIntensity ?? DEFAULT_RENDER_PARAMS.shadowsIntensity,
        midtonesIntensity: overrides.midtonesIntensity ?? DEFAULT_RENDER_PARAMS.midtonesIntensity,
        highlightsIntensity: overrides.highlightsIntensity ?? DEFAULT_RENDER_PARAMS.highlightsIntensity,
        // Noise Reduction
        noiseReduction: overrides.noiseReduction ?? DEFAULT_RENDER_PARAMS.noiseReduction,
        // Preview Modes
        cmykPreview: overrides.cmykPreview ?? DEFAULT_RENDER_PARAMS.cmykPreview,
        // Holographic Effect
        holoEffect: overrides.holoEffect ?? DEFAULT_RENDER_PARAMS.holoEffect,
        holoStrength: overrides.holoStrength ?? DEFAULT_RENDER_PARAMS.holoStrength,
        holoAreaMode: overrides.holoAreaMode ?? DEFAULT_RENDER_PARAMS.holoAreaMode,
        holoAreaThreshold: overrides.holoAreaThreshold ?? DEFAULT_RENDER_PARAMS.holoAreaThreshold,
        holoAnimation: overrides.holoAnimation ?? DEFAULT_RENDER_PARAMS.holoAnimation,
        holoSpeed: overrides.holoSpeed ?? DEFAULT_RENDER_PARAMS.holoSpeed,
        holoExportMode: overrides.holoExportMode ?? DEFAULT_RENDER_PARAMS.holoExportMode,
        holoSweepWidth: overrides.holoSweepWidth ?? DEFAULT_RENDER_PARAMS.holoSweepWidth,
        holoStarSize: overrides?.holoStarSize ?? DEFAULT_RENDER_PARAMS.holoStarSize,
        holoStarVariety: overrides?.holoStarVariety ?? DEFAULT_RENDER_PARAMS.holoStarVariety,
        holoBlur: overrides?.holoBlur ?? DEFAULT_RENDER_PARAMS.holoBlur,
        holoProbability: overrides?.holoProbability ?? DEFAULT_RENDER_PARAMS.holoProbability,
        holoAngle: DEFAULT_RENDER_PARAMS.holoAngle, // Runtime only, use default for export
        // Color Replace
        colorReplaceEnabled: overrides.colorReplaceEnabled ?? DEFAULT_RENDER_PARAMS.colorReplaceEnabled,
        colorReplaceSource: overrides.colorReplaceSource ?? DEFAULT_RENDER_PARAMS.colorReplaceSource,
        colorReplaceTarget: overrides.colorReplaceTarget ?? DEFAULT_RENDER_PARAMS.colorReplaceTarget,
        colorReplaceThreshold: overrides.colorReplaceThreshold ?? DEFAULT_RENDER_PARAMS.colorReplaceThreshold,
        // Gamma
        gamma: overrides.gamma ?? DEFAULT_RENDER_PARAMS.gamma,
        // Border effects
        vignetteAmount: overrides.vignetteAmount ?? DEFAULT_RENDER_PARAMS.vignetteAmount,
        vignetteSize: overrides.vignetteSize ?? DEFAULT_RENDER_PARAMS.vignetteSize,
        vignetteFeather: overrides.vignetteFeather ?? DEFAULT_RENDER_PARAMS.vignetteFeather,
    };
}

/**
 * Check if card overrides contain any advanced adjustments (beyond darkenMode)
 * that require WebGL re-rendering.
 * 
 * This is a wrapper around the shared hasActiveAdjustments that includes
 * darken-related settings for worker use.
 */
export function hasAdvancedOverrides(overrides?: CardOverrides): boolean {
    return hasActiveAdjustments(overrides, true);
}

/**
 * Worker-compatible function to render a card with overrides using OffscreenCanvas + WebGL2.
 * Used by PDF worker and ZIP export worker.
 * 
 * @param imageBitmap - The source card image (already processed with bleed)
 * @param params - RenderParams with all adjustments
 * @param darknessFactor - 0-1 factor computed from histogram
 * @returns Blob of the rendered image as PNG
 */
export async function renderCardWithOverridesWorker(
    imageBitmap: ImageBitmap,
    params: RenderParams
): Promise<Blob> {
    const width = imageBitmap.width;
    const height = imageBitmap.height;

    // Get or create context using context manager (reuses if available)
    const { canvas, gl, isNew } = effectContextManager.getContext(width, height);

    webglLog(`Rendering: ${width}x${height}, reused=${!isNew}`);

    // Create shaders and program
    const vs = createShader(gl, gl.VERTEX_SHADER, VS_CARD_CANVAS);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FS_CARD_CANVAS);
    const program = createProgram(gl, vs, fs);

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    // Get uniform locations for all effects
    const uniforms: UniformLocations = {
        u_baseTexture: gl.getUniformLocation(program, 'u_baseTexture'),
        u_resolution: gl.getUniformLocation(program, 'u_resolution'),
        // Basic adjustments
        u_brightness: gl.getUniformLocation(program, 'u_brightness'),
        u_contrast: gl.getUniformLocation(program, 'u_contrast'),
        u_saturation: gl.getUniformLocation(program, 'u_saturation'),
        u_sharpness: gl.getUniformLocation(program, 'u_sharpness'),
        u_pop: gl.getUniformLocation(program, 'u_pop'),
        // Color effects
        u_hueShift: gl.getUniformLocation(program, 'u_hueShift'),
        u_sepia: gl.getUniformLocation(program, 'u_sepia'),
        u_tintColor: gl.getUniformLocation(program, 'u_tintColor'),
        u_tintAmount: gl.getUniformLocation(program, 'u_tintAmount'),
        // RGB Balance
        u_redBalance: gl.getUniformLocation(program, 'u_redBalance'),
        u_greenBalance: gl.getUniformLocation(program, 'u_greenBalance'),
        u_blueBalance: gl.getUniformLocation(program, 'u_blueBalance'),
        // CMYK Balance
        u_cyanBalance: gl.getUniformLocation(program, 'u_cyanBalance'),
        u_magentaBalance: gl.getUniformLocation(program, 'u_magentaBalance'),
        u_yellowBalance: gl.getUniformLocation(program, 'u_yellowBalance'),
        u_blackBalance: gl.getUniformLocation(program, 'u_blackBalance'),
        // Color Balance (Shadows/Midtones/Highlights)
        u_shadowsIntensity: gl.getUniformLocation(program, 'u_shadowsIntensity'),
        u_midtonesIntensity: gl.getUniformLocation(program, 'u_midtonesIntensity'),
        u_highlightsIntensity: gl.getUniformLocation(program, 'u_highlightsIntensity'),
        // Noise Reduction & Preview
        u_noiseReduction: gl.getUniformLocation(program, 'u_noiseReduction'),
        u_cmykPreview: gl.getUniformLocation(program, 'u_cmykPreview'),
        // Holographic Effect
        u_holoEffect: gl.getUniformLocation(program, 'u_holoEffect'),
        u_holoStrength: gl.getUniformLocation(program, 'u_holoStrength'),
        u_holoAreaMode: gl.getUniformLocation(program, 'u_holoAreaMode'),
        u_holoAreaThreshold: gl.getUniformLocation(program, 'u_holoAreaThreshold'),
        u_holoAngle: gl.getUniformLocation(program, 'u_holoAngle'),
        u_holoSweepWidth: gl.getUniformLocation(program, 'u_holoSweepWidth'),
        u_holoStarSize: gl.getUniformLocation(program, 'u_holoStarSize'),
        u_holoStarVariety: gl.getUniformLocation(program, 'u_holoStarVariety'),
        u_holoBlur: gl.getUniformLocation(program, 'u_holoBlur'),
        u_holoProbability: gl.getUniformLocation(program, 'u_holoProbability'),
        u_holoUvOffset: gl.getUniformLocation(program, 'u_holoUvOffset'),
        u_holoUvScale: gl.getUniformLocation(program, 'u_holoUvScale'),
        // Color Replace
        u_colorReplaceEnabled: gl.getUniformLocation(program, 'u_colorReplaceEnabled'),
        u_colorReplaceSource: gl.getUniformLocation(program, 'u_colorReplaceSource'),
        u_colorReplaceTarget: gl.getUniformLocation(program, 'u_colorReplaceTarget'),
        u_colorReplaceThreshold: gl.getUniformLocation(program, 'u_colorReplaceThreshold'),
        // Gamma & Vignette
        u_gamma: gl.getUniformLocation(program, 'u_gamma'),
        u_vignetteAmount: gl.getUniformLocation(program, 'u_vignetteAmount'),
        u_vignetteSize: gl.getUniformLocation(program, 'u_vignetteSize'),
        u_vignetteFeather: gl.getUniformLocation(program, 'u_vignetteFeather'),
    };

    // Create quad VAO
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Failed to create VAO');

    gl.bindVertexArray(vao);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        1, 1,
    ]), gl.STATIC_DRAW);

    const positionLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);

    let baseTex: WebGLTexture | null = null;
    try {
        // Load texture from ImageBitmap
        baseTex = createTextureFromBitmap(gl, imageBitmap);

        // Render
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(program);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, baseTex);
        gl.uniform1i(uniforms.u_baseTexture, 0);

        updateUniforms(gl, uniforms, params, width, height);

        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);

        // Get blob from OffscreenCanvas
        const blob = await canvas.convertToBlob({ type: 'image/png' });

        // Cleanup per-render resources only - keep context alive for next render
        gl.deleteTexture(baseTex);
        gl.deleteBuffer(positionBuffer);
        gl.deleteVertexArray(vao);
        gl.deleteProgram(program);
        // Do NOT release context - it will be reused for the next render

        return blob;
    } catch (err) {
        // Cleanup on error - release per-render resources but keep context
        if (baseTex) gl.deleteTexture(baseTex);
        gl.deleteBuffer(positionBuffer);
        gl.deleteVertexArray(vao);
        gl.deleteProgram(program);
        // Do NOT release context on error - it can still be reused
        throw err;
    }
}
