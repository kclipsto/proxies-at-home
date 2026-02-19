/**
 * AdjustmentFilter - PixiJS custom filter for brightness, contrast, saturation, sharpness
 * 
 * Ports the adjustment shader from CardCanvas/shaders.ts to PixiJS filter format.
 */

import { Filter, GlProgram } from 'pixi.js';

const VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

import { ADJUSTMENT_FRAGMENT } from '../../../shaders/adjustmentShader';

const FRAGMENT = `
#define IS_PIXI 1
${ADJUSTMENT_FRAGMENT}
`;

export class AdjustmentFilter extends Filter {
    constructor() {
        const glProgram = GlProgram.from({
            vertex: VERTEX,
            fragment: FRAGMENT,
            name: 'adjustment-filter',
        });

        super({
            glProgram,
            resources: {
                adjustUniforms: {
                    uResolution: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
                    uBrightness: { value: 0, type: 'f32' },
                    uContrast: { value: 1, type: 'f32' },
                    uSaturation: { value: 1, type: 'f32' },
                    uSharpness: { value: 0, type: 'f32' },
                    uPop: { value: 0, type: 'f32' },
                    uHueShift: { value: 0, type: 'f32' },
                    uSepia: { value: 0, type: 'f32' },
                    uVignetteAmount: { value: 0, type: 'f32' },
                    uVignetteSize: { value: 0.8, type: 'f32' },
                    uVignetteFeather: { value: 0.5, type: 'f32' },
                    // Color tint
                    uTintColor: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
                    uTintAmount: { value: 0, type: 'f32' },
                    // RGB balance
                    uRedBalance: { value: 0, type: 'f32' },
                    uGreenBalance: { value: 0, type: 'f32' },
                    uBlueBalance: { value: 0, type: 'f32' },
                    // CMYK balance
                    uCyanBalance: { value: 0, type: 'f32' },
                    uMagentaBalance: { value: 0, type: 'f32' },
                    uYellowBalance: { value: 0, type: 'f32' },
                    uBlackBalance: { value: 0, type: 'f32' },
                    // Color Balance (Shadows/Midtones/Highlights)
                    uShadowsIntensity: { value: 0, type: 'f32' },
                    uMidtonesIntensity: { value: 0, type: 'f32' },
                    uHighlightsIntensity: { value: 0, type: 'f32' },
                    // Noise Reduction
                    uNoiseReduction: { value: 0, type: 'f32' },
                    // Preview Modes
                    uCmykPreview: { value: 0, type: 'f32' },
                    // Holographic Effect
                    uHoloEffect: { value: 0, type: 'f32' },
                    uHoloStrength: { value: 50, type: 'f32' },
                    uHoloAreaMode: { value: 0, type: 'f32' },
                    uHoloAreaThreshold: { value: 50, type: 'f32' },
                    uHoloAngle: { value: 0, type: 'f32' },
                    uHoloSweepWidth: { value: 33, type: 'f32' },
                    uHoloStarSize: { value: 50, type: 'f32' },
                    uHoloStarVariety: { value: 50, type: 'f32' },
                    uHoloBlur: { value: 10, type: 'f32' },
                    uHoloProbability: { value: 20, type: 'f32' },
                    // Holo UV correction (for when filter runs on clipped visible area)
                    uHoloUvOffset: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
                    uHoloUvScale: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
                    // Color Replace
                    uColorReplaceEnabled: { value: 0, type: 'f32' },
                    uColorReplaceSource: { value: new Float32Array([1, 0, 0]), type: 'vec3<f32>' },
                    uColorReplaceTarget: { value: new Float32Array([0, 1, 0]), type: 'vec3<f32>' },
                    uColorReplaceThreshold: { value: 30, type: 'f32' },
                    // Gamma
                    uGamma: { value: 1.0, type: 'f32' },
                },
            },
        });
    }

    get textureResolution(): [number, number] {
        const val = this.resources.adjustUniforms.uniforms.uResolution;
        return [val[0], val[1]];
    }
    set textureResolution(value: [number, number]) {
        this.resources.adjustUniforms.uniforms.uResolution[0] = value[0];
        this.resources.adjustUniforms.uniforms.uResolution[1] = value[1];
    }

    get brightness(): number {
        return this.resources.adjustUniforms.uniforms.uBrightness;
    }
    set brightness(value: number) {
        this.resources.adjustUniforms.uniforms.uBrightness = value;
    }

    get contrast(): number {
        return this.resources.adjustUniforms.uniforms.uContrast;
    }
    set contrast(value: number) {
        this.resources.adjustUniforms.uniforms.uContrast = value;
    }

    get saturation(): number {
        return this.resources.adjustUniforms.uniforms.uSaturation;
    }
    set saturation(value: number) {
        this.resources.adjustUniforms.uniforms.uSaturation = value;
    }

    get sharpness(): number {
        return this.resources.adjustUniforms.uniforms.uSharpness;
    }
    set sharpness(value: number) {
        this.resources.adjustUniforms.uniforms.uSharpness = value;
    }

    get pop(): number {
        return this.resources.adjustUniforms.uniforms.uPop;
    }
    set pop(value: number) {
        this.resources.adjustUniforms.uniforms.uPop = value / 100.0;
    }

    get hueShift(): number {
        return this.resources.adjustUniforms.uniforms.uHueShift;
    }
    set hueShift(value: number) {
        this.resources.adjustUniforms.uniforms.uHueShift = value;
    }

    get sepia(): number {
        return this.resources.adjustUniforms.uniforms.uSepia;
    }
    set sepia(value: number) {
        this.resources.adjustUniforms.uniforms.uSepia = value;
    }

    get vignetteAmount(): number {
        return this.resources.adjustUniforms.uniforms.uVignetteAmount;
    }
    set vignetteAmount(value: number) {
        this.resources.adjustUniforms.uniforms.uVignetteAmount = value;
    }

    get vignetteSize(): number {
        return this.resources.adjustUniforms.uniforms.uVignetteSize;
    }
    set vignetteSize(value: number) {
        this.resources.adjustUniforms.uniforms.uVignetteSize = value;
    }

    get vignetteFeather(): number {
        return this.resources.adjustUniforms.uniforms.uVignetteFeather;
    }
    set vignetteFeather(value: number) {
        this.resources.adjustUniforms.uniforms.uVignetteFeather = value;
    }

    // Color tint - accepts hex color string like '#ff0000'
    get tintColor(): string {
        const rgb = this.resources.adjustUniforms.uniforms.uTintColor;
        const r = Math.round(rgb[0] * 255);
        const g = Math.round(rgb[1] * 255);
        const b = Math.round(rgb[2] * 255);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    set tintColor(value: string) {
        // Parse hex color string
        const hex = value.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;
        this.resources.adjustUniforms.uniforms.uTintColor[0] = r;
        this.resources.adjustUniforms.uniforms.uTintColor[1] = g;
        this.resources.adjustUniforms.uniforms.uTintColor[2] = b;
    }

    get tintAmount(): number {
        return this.resources.adjustUniforms.uniforms.uTintAmount;
    }
    set tintAmount(value: number) {
        this.resources.adjustUniforms.uniforms.uTintAmount = value;
    }

    // RGB balance
    get redBalance(): number {
        return this.resources.adjustUniforms.uniforms.uRedBalance;
    }
    set redBalance(value: number) {
        this.resources.adjustUniforms.uniforms.uRedBalance = value;
    }

    get greenBalance(): number {
        return this.resources.adjustUniforms.uniforms.uGreenBalance;
    }
    set greenBalance(value: number) {
        this.resources.adjustUniforms.uniforms.uGreenBalance = value;
    }

    get blueBalance(): number {
        return this.resources.adjustUniforms.uniforms.uBlueBalance;
    }
    set blueBalance(value: number) {
        this.resources.adjustUniforms.uniforms.uBlueBalance = value;
    }

    // CMYK balance
    get cyanBalance(): number {
        return this.resources.adjustUniforms.uniforms.uCyanBalance;
    }
    set cyanBalance(value: number) {
        this.resources.adjustUniforms.uniforms.uCyanBalance = value;
    }

    get magentaBalance(): number {
        return this.resources.adjustUniforms.uniforms.uMagentaBalance;
    }
    set magentaBalance(value: number) {
        this.resources.adjustUniforms.uniforms.uMagentaBalance = value;
    }

    get yellowBalance(): number {
        return this.resources.adjustUniforms.uniforms.uYellowBalance;
    }
    set yellowBalance(value: number) {
        this.resources.adjustUniforms.uniforms.uYellowBalance = value;
    }

    get blackBalance(): number {
        return this.resources.adjustUniforms.uniforms.uBlackBalance;
    }
    set blackBalance(value: number) {
        this.resources.adjustUniforms.uniforms.uBlackBalance = value;
    }

    // Color Balance (Shadows/Midtones/Highlights)
    get shadowsIntensity(): number {
        return this.resources.adjustUniforms.uniforms.uShadowsIntensity;
    }
    set shadowsIntensity(value: number) {
        this.resources.adjustUniforms.uniforms.uShadowsIntensity = value;
    }

    get midtonesIntensity(): number {
        return this.resources.adjustUniforms.uniforms.uMidtonesIntensity;
    }
    set midtonesIntensity(value: number) {
        this.resources.adjustUniforms.uniforms.uMidtonesIntensity = value;
    }

    get highlightsIntensity(): number {
        return this.resources.adjustUniforms.uniforms.uHighlightsIntensity;
    }
    set highlightsIntensity(value: number) {
        this.resources.adjustUniforms.uniforms.uHighlightsIntensity = value;
    }

    // Noise Reduction
    get noiseReduction(): number {
        return this.resources.adjustUniforms.uniforms.uNoiseReduction;
    }
    set noiseReduction(value: number) {
        this.resources.adjustUniforms.uniforms.uNoiseReduction = value;
    }

    // Preview Modes
    get cmykPreview(): boolean {
        return this.resources.adjustUniforms.uniforms.uCmykPreview > 0;
    }
    set cmykPreview(value: boolean) {
        this.resources.adjustUniforms.uniforms.uCmykPreview = value ? 1 : 0;
    }

    // Holographic Effect
    get holoEffect(): 'none' | 'rainbow' | 'glitter' | 'stars' {
        const v = this.resources.adjustUniforms.uniforms.uHoloEffect;
        if (v >= 3) return 'stars';
        if (v >= 2) return 'glitter';
        if (v >= 1) return 'rainbow';
        return 'none';
    }
    set holoEffect(value: 'none' | 'rainbow' | 'glitter' | 'stars') {
        this.resources.adjustUniforms.uniforms.uHoloEffect = value === 'stars' ? 3 : value === 'glitter' ? 2 : value === 'rainbow' ? 1 : 0;
    }

    get holoStrength(): number {
        return this.resources.adjustUniforms.uniforms.uHoloStrength;
    }
    set holoStrength(value: number) {
        this.resources.adjustUniforms.uniforms.uHoloStrength = value;
    }

    get holoAreaMode(): 'full' | 'bright' {
        return this.resources.adjustUniforms.uniforms.uHoloAreaMode >= 1 ? 'bright' : 'full';
    }
    set holoAreaMode(value: 'full' | 'bright') {
        this.resources.adjustUniforms.uniforms.uHoloAreaMode = value === 'bright' ? 1 : 0;
    }

    get holoAreaThreshold(): number {
        return this.resources.adjustUniforms.uniforms.uHoloAreaThreshold;
    }
    set holoAreaThreshold(value: number) {
        this.resources.adjustUniforms.uniforms.uHoloAreaThreshold = value;
    }

    get holoAngle(): number {
        return this.resources.adjustUniforms.uniforms.uHoloAngle;
    }
    set holoAngle(value: number) {
        this.resources.adjustUniforms.uniforms.uHoloAngle = value;
    }

    get holoSweepWidth(): number {
        return this.resources.adjustUniforms.uniforms.uHoloSweepWidth;
    }
    set holoSweepWidth(value: number) {
        this.resources.adjustUniforms.uniforms.uHoloSweepWidth = value;
    }

    get holoStarSize(): number {
        return this.resources.adjustUniforms.uniforms.uHoloStarSize;
    }
    set holoStarSize(value: number) {
        this.resources.adjustUniforms.uniforms.uHoloStarSize = value;
    }

    get holoStarVariety(): number {
        return this.resources.adjustUniforms.uniforms.uHoloStarVariety;
    }
    set holoStarVariety(value: number) {
        this.resources.adjustUniforms.uniforms.uHoloStarVariety = value;
    }
    get holoBlur(): number {
        return this.resources.adjustUniforms.uniforms.uHoloBlur;
    }
    set holoBlur(value: number) {
        this.resources.adjustUniforms.uniforms.uHoloBlur = value;
    }
    get holoProbability(): number {
        return this.resources.adjustUniforms.uniforms.uHoloProbability;
    }
    set holoProbability(value: number) {
        this.resources.adjustUniforms.uniforms.uHoloProbability = value;
    }

    // Holo UV correction - for compensating when filter operates on clipped sprite
    get holoUvOffset(): [number, number] {
        const val = this.resources.adjustUniforms.uniforms.uHoloUvOffset;
        return [val[0], val[1]];
    }
    set holoUvOffset(value: [number, number]) {
        this.resources.adjustUniforms.uniforms.uHoloUvOffset[0] = value[0];
        this.resources.adjustUniforms.uniforms.uHoloUvOffset[1] = value[1];
    }

    get holoUvScale(): [number, number] {
        const val = this.resources.adjustUniforms.uniforms.uHoloUvScale;
        return [val[0], val[1]];
    }
    set holoUvScale(value: [number, number]) {
        this.resources.adjustUniforms.uniforms.uHoloUvScale[0] = value[0];
        this.resources.adjustUniforms.uniforms.uHoloUvScale[1] = value[1];
    }

    // Color Replace
    get colorReplaceEnabled(): boolean {
        return this.resources.adjustUniforms.uniforms.uColorReplaceEnabled > 0;
    }
    set colorReplaceEnabled(value: boolean) {
        this.resources.adjustUniforms.uniforms.uColorReplaceEnabled = value ? 1 : 0;
    }

    get colorReplaceSource(): string {
        const rgb = this.resources.adjustUniforms.uniforms.uColorReplaceSource;
        return '#' + [rgb[0], rgb[1], rgb[2]].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
    }
    set colorReplaceSource(value: string) {
        const hex = value.replace('#', '');
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        this.resources.adjustUniforms.uniforms.uColorReplaceSource[0] = r;
        this.resources.adjustUniforms.uniforms.uColorReplaceSource[1] = g;
        this.resources.adjustUniforms.uniforms.uColorReplaceSource[2] = b;
    }

    get colorReplaceTarget(): string {
        const rgb = this.resources.adjustUniforms.uniforms.uColorReplaceTarget;
        return '#' + [rgb[0], rgb[1], rgb[2]].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
    }
    set colorReplaceTarget(value: string) {
        const hex = value.replace('#', '');
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        this.resources.adjustUniforms.uniforms.uColorReplaceTarget[0] = r;
        this.resources.adjustUniforms.uniforms.uColorReplaceTarget[1] = g;
        this.resources.adjustUniforms.uniforms.uColorReplaceTarget[2] = b;
    }

    get colorReplaceThreshold(): number {
        return this.resources.adjustUniforms.uniforms.uColorReplaceThreshold;
    }
    set colorReplaceThreshold(value: number) {
        this.resources.adjustUniforms.uniforms.uColorReplaceThreshold = value;
    }

    // Gamma
    get gamma(): number {
        return this.resources.adjustUniforms.uniforms.uGamma;
    }
    set gamma(value: number) {
        this.resources.adjustUniforms.uniforms.uGamma = value;
    }
}
