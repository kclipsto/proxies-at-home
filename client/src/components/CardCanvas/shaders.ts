/**
 * CardCanvas Shaders
 * 
 * Shaders for real-time card rendering with adjustable parameters.
 * These are used by the CardCanvas component for live preview and editing.
 */

import { DARKEN_UNIFORMS_GLSL, DARKEN_FUNCTIONS_GLSL } from '../../shaders/darkenEffects';

export const VS_CARD_CANVAS = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const FS_CARD_CANVAS = `#version 300 es
precision highp float;

// Textures
uniform sampler2D u_baseTexture;     // Processed card with bleed, no effects
uniform sampler2D u_distanceField;   // Edge distance from JFA (optional)
uniform vec2 u_resolution;           // Canvas resolution

// Shared Darken Parameters
${DARKEN_UNIFORMS_GLSL}

// Image adjustments
uniform float u_brightness;          // -100 to +100
uniform float u_contrast;            // 0.5-2.0
uniform float u_saturation;          // 0-2.0
uniform float u_sharpness;           // 0-1.0 (future)

in vec2 v_uv;
out vec4 outColor;

// Convert sRGB to linear for proper blending
vec3 srgbToLinear(vec3 c) {
    return pow(c, vec3(2.2));
}

// Convert linear back to sRGB
vec3 linearToSrgb(vec3 c) {
    return pow(c, vec3(1.0/2.2));
}

// Luminance for saturation
float luminance(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
}

// === Darkening Functions (Shared) ===
${DARKEN_FUNCTIONS_GLSL}

// === Image Adjustment Functions ===

vec3 applyBrightnessContrast(vec3 color) {
    // Brightness: -50 to +50 maps to -0.196 to +0.196
    float brightness = u_brightness / 255.0;
    // Contrast: 0.5 to 2.0 directly
    float contrast = u_contrast;
    
    vec3 result = (color - 0.5) * contrast + 0.5 + brightness;
    return clamp(result, 0.0, 1.0);
}

vec3 applySaturation(vec3 color) {
    float luma = luminance(color);
    vec3 gray = vec3(luma);
    return mix(gray, color, u_saturation);
}

// Unsharp mask sharpening using 3x3 convolution
vec3 applySharpness(vec3 color, vec2 uv) {
    if (u_sharpness <= 0.0) return color;
    
    // Calculate pixel size in UV coordinates
    vec2 texelSize = 1.0 / u_resolution;
    
    // Sample neighboring pixels (3x3 kernel)
    vec3 n  = texture(u_baseTexture, uv + vec2( 0.0, -texelSize.y)).rgb;
    vec3 s  = texture(u_baseTexture, uv + vec2( 0.0,  texelSize.y)).rgb;
    vec3 e  = texture(u_baseTexture, uv + vec2( texelSize.x,  0.0)).rgb;
    vec3 w  = texture(u_baseTexture, uv + vec2(-texelSize.x,  0.0)).rgb;
    
    // Laplacian kernel for edge detection: center = 4, neighbors = -1
    vec3 laplacian = 4.0 * color - (n + s + e + w);
    
    // Apply sharpening by adding the edge signal
    // u_sharpness 0-5 (0-500%): linear scaling with 0.5 factor
    // 0% = 0 strength, 100% = 0.5, 200% = 1.0, 500% = 2.5
    float strength = u_sharpness * 0.5;
    vec3 sharpened = color + laplacian * strength;
    
    return clamp(sharpened, 0.0, 1.0);
}

void main() {
    // Flip Y for proper orientation
    vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
    vec2 pixelCoord = uv * u_resolution;
    
    vec4 color = texture(u_baseTexture, uv);
    vec3 rgb = color.rgb;
    
    // Apply sharpening FIRST (before any darkening to avoid white edges)
    rgb = applySharpness(rgb, uv);
    
    // Apply darkening based on mode
    if (u_darkenMode == 1) {
        rgb = applyDarkenAll(rgb);
    } else if (u_darkenMode == 2) {
        rgb = applyEdgeContrast(rgb, pixelCoord);
    } else if (u_darkenMode == 3) {
        rgb = applyFullContrast(rgb);
    }
    
    // Apply image adjustments
    rgb = applyBrightnessContrast(rgb);
    rgb = applySaturation(rgb);
    
    outColor = vec4(rgb, color.a);
}
`;
