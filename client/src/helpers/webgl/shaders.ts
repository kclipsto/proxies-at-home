
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
uniform vec2 u_imageSize;
uniform vec2 u_offset;

in vec2 v_uv;
out vec4 outColor;

void main() {
    // Calculate pixel coordinate in the output buffer
    vec2 pixelCoord = v_uv * u_resolution;

    // Calculate coordinate relative to the image
    vec2 imageCoord = pixelCoord - u_offset;

    // Check if we are inside the image bounds
    if (imageCoord.x >= 0.0 && imageCoord.x < u_imageSize.x &&
        imageCoord.y >= 0.0 && imageCoord.y < u_imageSize.y) {
        
        // Sample the image
        // Normalize image coord to 0..1 for texture sampling
        // Flip Y because ImageBitmap has (0,0) at top-left but WebGL UVs expect bottom-left
        vec2 imageUV = vec2(imageCoord.x / u_imageSize.x, 1.0 - imageCoord.y / u_imageSize.y);
        
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
uniform vec2 u_imageSize;
uniform vec2 u_offset;
uniform bool u_darken;

in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 seedData = texture(u_seeds, v_uv);
    
    if (seedData.r < 0.0) {
        // No seed found (shouldn't happen if JFA worked, but possible for empty images)
        outColor = vec4(0.0);
        return;
    }

    vec2 seedCoord = seedData.rg;
    
    // Convert seed coord (in output space) back to image UV
    vec2 imageCoord = seedCoord - u_offset;
    // Flip Y because ImageBitmap has (0,0) at top-left but WebGL UVs expect bottom-left
    vec2 imageUV = vec2(imageCoord.x / u_imageSize.x, 1.0 - imageCoord.y / u_imageSize.y);

    // Sample original image
    vec4 color = texture(u_image, imageUV);

    // Darken Near Black Logic
    if (u_darken) {
        float threshold = 30.0 / 255.0; // 30 in 0..255
        if (color.r < threshold && color.g < threshold && color.b < threshold) {
            color.rgb = vec3(0.0);
        }
    }

    // Force full alpha for the bleed area (we want the color)
    // The original image might have transparency, but for bleed we usually want opaque?
    // Actually, JFA propagates the color of the nearest opaque pixel.
    // So the sampled color should be opaque (from the seed).
    // However, if the seed itself was semi-transparent (alpha > 0.01 but < 1.0), we might get that.
    // For bleed, we typically want full opacity.
    outColor = vec4(color.rgb, 1.0);
}
`;
