/**
 * DarkenFilter - PixiJS custom filter for edge darkening modes
 * 
 * Ports the darkening shader from CardCanvas/shaders.ts to PixiJS filter format.
 */

import { Filter, GlProgram } from 'pixi.js';
import type { DarkenMode } from '../../../store/settings';
import { DARKEN_UNIFORMS_GLSL, DARKEN_FUNCTIONS_GLSL } from '../../../shaders/darkenEffects';

// Standard vertex shader that passes texture coordinates correctly
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

const FRAGMENT = `
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
// Note: Shared logic expects u_resolution (snake_case)
${DARKEN_UNIFORMS_GLSL}
uniform vec2 u_resolution;
uniform vec4 uOutputFrame;          // x, y = offset, z, w = size
uniform vec4 uInputSize;            // x, y = texture size, z, w = 1/texture size

${DARKEN_FUNCTIONS_GLSL}

void main() {
    vec4 color = texture(uTexture, vTextureCoord);
    vec3 rgb = color.rgb;
    
    // vTextureCoord is mapped to the input texture dimensions
    // We need normalized coordinates (0-1) relative to the sprite frame to handle scaling
    // Ratio = OutputSize / InputSize
    vec2 ratio = uOutputFrame.zw * uInputSize.zw;
    vec2 normalizedCoord = vTextureCoord / ratio;
    
    // Pixel coordinates in the scaled sprite space (matching u_resolution)
    vec2 pixelCoord = normalizedCoord * u_resolution;
    
    if (u_darkenMode == 1) {
        rgb = applyDarkenAll(rgb);
    } else if (u_darkenMode == 2) {
        rgb = applyEdgeContrast(rgb, pixelCoord);
    } else if (u_darkenMode == 3) {
        rgb = applyFullContrast(rgb);
    }
    
    finalColor = vec4(rgb, color.a);
}
`;

/**
 * Convert DarkenMode string to shader int
 */
function darkenModeToInt(mode: DarkenMode): number {
    switch (mode) {
        case 'none': return 0;
        case 'darken-all': return 1;
        case 'contrast-edges': return 2;
        case 'contrast-full': return 3;
        default: return 0;
    }
}

export class DarkenFilter extends Filter {
    constructor() {
        const glProgram = GlProgram.from({
            vertex: VERTEX,
            fragment: FRAGMENT,
            name: 'darken-filter',
        });

        super({
            glProgram,
            resources: {
                darkenUniforms: {
                    u_darknessFactor: { value: 1.0, type: 'f32' },
                    u_darkenMode: { value: 0, type: 'i32' },
                    u_darkenThreshold: { value: 0, type: 'f32' },
                    u_darkenContrast: { value: 1.0, type: 'f32' },
                    u_darkenEdgeWidth: { value: 0.1, type: 'f32' },
                    u_darkenAmount: { value: 0.0, type: 'f32' },
                    u_darkenBrightness: { value: 0.0, type: 'f32' },
                    u_resolution: { value: [100, 100], type: 'vec2<f32>' },
                },
            },
        });
    }

    // Setters map to snake_case uniforms

    get darknessFactor(): number { return this.resources.darkenUniforms.uniforms.u_darknessFactor; }
    set darknessFactor(value: number) { this.resources.darkenUniforms.uniforms.u_darknessFactor = value; }

    get darkenMode(): DarkenMode { return 'none'; }
    set darkenMode(value: DarkenMode) {
        this.resources.darkenUniforms.uniforms.u_darkenMode = darkenModeToInt(value);
    }

    get darkenThreshold(): number { return this.resources.darkenUniforms.uniforms.u_darkenThreshold; }
    set darkenThreshold(value: number) { this.resources.darkenUniforms.uniforms.u_darkenThreshold = value; }

    get darkenContrast(): number { return this.resources.darkenUniforms.uniforms.u_darkenContrast; }
    set darkenContrast(value: number) { this.resources.darkenUniforms.uniforms.u_darkenContrast = value; }

    get darkenEdgeWidth(): number { return this.resources.darkenUniforms.uniforms.u_darkenEdgeWidth; }
    set darkenEdgeWidth(value: number) { this.resources.darkenUniforms.uniforms.u_darkenEdgeWidth = value; }

    get darkenAmount(): number { return this.resources.darkenUniforms.uniforms.u_darkenAmount; }
    set darkenAmount(value: number) { this.resources.darkenUniforms.uniforms.u_darkenAmount = value; }

    get darkenBrightness(): number { return this.resources.darkenUniforms.uniforms.u_darkenBrightness; }
    set darkenBrightness(value: number) { this.resources.darkenUniforms.uniforms.u_darkenBrightness = value; }

    get textureResolution(): [number, number] { return this.resources.darkenUniforms.uniforms.u_resolution; }
    set textureResolution(value: [number, number]) { this.resources.darkenUniforms.uniforms.u_resolution = value; }
}
