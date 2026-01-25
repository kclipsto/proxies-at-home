import { DARKEN_UNIFORMS_GLSL, DARKEN_FUNCTIONS_GLSL } from '../../shaders/darkenEffects';
export const VS_QUAD = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    // Flip Y in position to invert the rendering on the framebuffer
    gl_Position = vec4(a_position.x, a_position.y, 0.0, 1.0);
}
`;

export const FS_INIT = `#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform vec2 u_imageSize;      // Content area size (targetCardWidth x targetCardHeight)
uniform vec2 u_offset;         // Content area position (bleed, bleed)
uniform vec2 u_srcImageSize;   // Source image dimensions
uniform vec2 u_srcOffset;      // Source crop offset (in source pixels)
uniform vec2 u_scale;          // Scale factor (drawWidth/srcWidth, drawHeight/srcHeight)

in vec2 v_uv;
out vec4 outColor;

void main() {
    // Calculate pixel coordinate in the output buffer
    vec2 pixelCoord = v_uv * u_resolution;

    // Calculate coordinate relative to the content area
    vec2 contentCoord = pixelCoord - u_offset;

    // Check if we are inside the content area bounds
    if (contentCoord.x >= 0.0 && contentCoord.x < u_imageSize.x &&
        contentCoord.y >= 0.0 && contentCoord.y < u_imageSize.y) {
        
        // Convert content coordinate to source image UV with scaling and cropping
        // contentCoord is in target pixels, we need to map to source pixels
        // First, convert to "scaled image" coords, then add crop offset
        vec2 scaledCoord = contentCoord;
        // Add the crop offset (in scaled pixels) and convert to source image pixels
        vec2 srcCoord = (scaledCoord / u_scale) + u_srcOffset;
        
        // Normalize to UV and flip Y for WebGL
        vec2 imageUV = vec2(srcCoord.x / u_srcImageSize.x, 1.0 - srcCoord.y / u_srcImageSize.y);
        
        vec4 color = texture(u_image, imageUV);

        // If opaque enough, output the seed (pixel coordinate)
        if (color.a > 0.01) { // Threshold for "seed"
            outColor = vec4(pixelCoord.x, pixelCoord.y, 0.0, 1.0);
            return;
        }
    }

    // No seed
    outColor = vec4(-1.0, -1.0, 0.0, 0.0);
}
`;

export const FS_STEP = `#version 300 es
precision highp float;

uniform sampler2D u_seeds;
uniform vec2 u_resolution;
uniform float u_step;

in vec2 v_uv;
out vec4 outColor;

void main() {
    vec2 pixelCoord = v_uv * u_resolution;
    
    float bestDist = 99999999.0;
    vec2 bestSeed = vec2(-1.0);

    // Check 3x3 neighbors
    for (float y = -1.0; y <= 1.0; y += 1.0) {
        for (float x = -1.0; x <= 1.0; x += 1.0) {
            vec2 neighborCoord = pixelCoord + vec2(x, y) * u_step;

            // Bounds check
            if (neighborCoord.x >= 0.0 && neighborCoord.x < u_resolution.x &&
                neighborCoord.y >= 0.0 && neighborCoord.y < u_resolution.y) {
                
                vec2 neighborUV = neighborCoord / u_resolution;
                vec4 seedData = texture(u_seeds, neighborUV);
                
                if (seedData.r >= 0.0) { // Valid seed
                    vec2 seed = seedData.rg;
                    float dist = distance(pixelCoord, seed);
                    
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestSeed = seed;
                    }
                }
            }
        }
    }

    if (bestSeed.x >= 0.0) {
        outColor = vec4(bestSeed, 0.0, 1.0);
    } else {
        outColor = vec4(-1.0, -1.0, 0.0, 0.0);
    }
}
`;

export const FS_FINAL = `#version 300 es
precision highp float;

uniform sampler2D u_seeds;
uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform vec2 u_imageSize;      // Content area size (targetCardWidth x targetCardHeight)
uniform vec2 u_offset;         // Content area position (bleed, bleed)
uniform vec2 u_srcImageSize;   // Source image dimensions
uniform vec2 u_srcOffset;      // Source crop offset (in source pixels)
uniform vec2 u_scale;          // Scale factor (drawWidth/srcWidth, drawHeight/srcHeight)

// Shared Darken Parameters
${DARKEN_UNIFORMS_GLSL}


in vec2 v_uv;
out vec4 outColor;

// Helper function to convert content coordinate to source image UV
vec2 contentToSourceUV(vec2 contentCoord) {
    // Convert content coordinate to source image coords with scaling and cropping
    vec2 srcCoord = (contentCoord / u_scale) + u_srcOffset;
    // Normalize to UV and flip Y for WebGL
    return vec2(srcCoord.x / u_srcImageSize.x, 1.0 - srcCoord.y / u_srcImageSize.y);
}

// === Darkening Functions (Shared) ===
${DARKEN_FUNCTIONS_GLSL}

void main() {
    vec2 pixelCoord = v_uv * u_resolution;
    
    // Calculate coordinate relative to the content area
    vec2 contentCoord = pixelCoord - u_offset;
    
    // Check if we are inside the content area bounds
    bool insideContent = contentCoord.x >= 0.0 && contentCoord.x < u_imageSize.x &&
                         contentCoord.y >= 0.0 && contentCoord.y < u_imageSize.y;
    

    vec4 seedData = texture(u_seeds, v_uv);
    
    if (seedData.r < 0.0) {
        // No seed found (shouldn't happen if JFA worked, but possible for empty images)
        outColor = vec4(0.0);
        return;
    }

    vec2 seedCoord = seedData.rg;
    
    // Convert seed coord (in output space) back to content coordinate, then to source UV
    vec2 seedContentCoord = seedCoord - u_offset;
    vec2 imageUV = contentToSourceUV(seedContentCoord);

    // Sample original image
    vec4 color = texture(u_image, imageUV);

    // Apply darkening based on mode
    if (u_darkenMode == 1) {
        // Darken All (Legacy) - simple threshold
        color.rgb = applyDarkenAll(color.rgb);
    } else if (u_darkenMode == 2) {
        // Contrast Edges - adaptive edge-only contrast
        color.rgb = applyEdgeContrast(color.rgb, pixelCoord);
    } else if (u_darkenMode == 3) {
        // Contrast Full - adaptive contrast on entire card
        color.rgb = applyFullContrast(color.rgb);
    }
    // Mode 0 (None) - no processing

    // Force full alpha for the bleed area (we want the color)
    // The original image might have transparency, but for bleed we usually want opaque?
    // Actually, JFA propagates the color of the nearest opaque pixel.
    // So the sampled color should be opaque (from the seed).
    // However, if the seed itself was semi-transparent (alpha > 0.01 but < 1.0), we might get that.
    // For bleed, we typically want full opacity.
    outColor = vec4(color.rgb, 1.0);
}
`;

/**
 * FS_DIRECT - Direct image rendering with darkening effects (no JFA)
 * 
 * Used for images that already have bleed built-in. Simply resizes and
 * applies the same darkening effects as FS_FINAL without the expensive
 * Jump Flood Algorithm pass.
 */
export const FS_DIRECT = `#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform vec2 u_resolution;

// Shared Darken Parameters
${DARKEN_UNIFORMS_GLSL}

in vec2 v_uv;
out vec4 outColor;

// === Darkening Functions (Shared) ===
${DARKEN_FUNCTIONS_GLSL}

void main() {
    vec2 pixelCoord = v_uv * u_resolution;
    
    // Sample image directly (flip Y for WebGL)
    vec2 imageUV = vec2(v_uv.x, 1.0 - v_uv.y);
    vec4 color = texture(u_image, imageUV);
    
    // Apply darkening based on mode
    if (u_darkenMode == 1) {
        color.rgb = applyDarkenAll(color.rgb);
    } else if (u_darkenMode == 2) {
        color.rgb = applyEdgeContrast(color.rgb, pixelCoord);
    } else if (u_darkenMode == 3) {
        color.rgb = applyFullContrast(color.rgb);
    }
    
    outColor = vec4(color.rgb, 1.0);
}
`;
