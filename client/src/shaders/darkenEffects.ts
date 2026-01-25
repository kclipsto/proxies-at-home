/**
 * Shared GLSL shader logic for darken pixel effects.
 * Used by:
 * - CardCanvas (Editor)
 * - PixiVirtualCanvas (Page View)
 * - PDF Export (Worker)
 */

export const DARKEN_UNIFORMS_GLSL = `
// Darken parameters
uniform float u_darknessFactor;      // 0-1, pre-computed (0=dark image, 1=light)
uniform int u_darkenMode;            // 0=none, 1=darken-all, 2=contrast-edges, 3=contrast-full
uniform float u_darkenThreshold;     // 0-255 (for darken-all)
uniform float u_darkenContrast;      // 0.5-2.0
uniform float u_darkenEdgeWidth;     // 0-1.0 (percentage of min dimension, e.g. 0.1 = 10%)
uniform float u_darkenAmount;        // 0.0-1.0 (how much to apply)
uniform float u_darkenBrightness;    // -50 to +50
`;

export const DARKEN_FUNCTIONS_GLSL = `
// === Darkening Functions ===

// Legacy darken-all - threshold-based (adjustable)
vec3 applyDarkenAll(vec3 color) {
    float threshold = u_darkenThreshold / 255.0;
    if (color.r < threshold && color.g < threshold && color.b < threshold) {
        vec3 darkened = vec3(0.0);
        return mix(color, darkened, u_darkenAmount);
    }
    return color;
}

// Adaptive edge contrast - darkens near-black pixels near edges
vec3 applyEdgeContrast(vec3 color, vec2 pixelCoord) {
    // Edge width is a percentage of the minimum dimension (zoom-independent)
    // Depends on u_resolution which must be available in scope
    float EDGE_PX = u_darkenEdgeWidth * min(u_resolution.x, u_resolution.y);
    
    // Calculate distance from closest edge in pixels
    float edgeDist = min(
        min(pixelCoord.x, pixelCoord.y),
        min(u_resolution.x - pixelCoord.x, u_resolution.y - pixelCoord.y)
    );
    
    if (edgeDist >= EDGE_PX) return color;
    
    float edgeFactor = 1.0 - edgeDist / EDGE_PX;
    edgeFactor *= edgeFactor; // Quadratic falloff for smoothness
    
    // Use adjustable parameters with darknessFactor influence
    float MAX_CONTRAST = u_darkenContrast * u_darknessFactor;
    float MAX_BRIGHTNESS = (u_darkenBrightness / 255.0) * u_darknessFactor;
    float HIGHLIGHT_SOFT = 230.0 / 255.0;
    
    vec3 result = color;
    
    for (int c = 0; c < 3; c++) {
        float v = (c == 0) ? color.r : (c == 1) ? color.g : color.b;
        
        float toneThreshold = 140.0 / 255.0;
        if (v > toneThreshold) continue;
        
        float toneFactor = min(1.0, (toneThreshold - v) / (110.0 / 255.0));
        float strength = edgeFactor * toneFactor;
        
        if (strength <= 0.0) continue;
        
        float contrast = 1.0 + (MAX_CONTRAST - 1.0) * strength;
        float brightness = MAX_BRIGHTNESS * strength;
        
        float nv = (v - 0.5) * contrast + 0.5 + brightness;
        
        if (nv > HIGHLIGHT_SOFT) {
            nv = HIGHLIGHT_SOFT + (nv - HIGHLIGHT_SOFT) * 0.35;
        }
        
        nv = clamp(nv, 0.0, 1.0);
        
        if (c == 0) result.r = nv;
        else if (c == 1) result.g = nv;
        else result.b = nv;
    }
    
    return mix(color, result, u_darkenAmount);
}

// Full-card contrast - same as edge but applies everywhere
vec3 applyFullContrast(vec3 color) {
    float MAX_CONTRAST = u_darkenContrast * u_darknessFactor;
    float MAX_BRIGHTNESS = (u_darkenBrightness / 255.0) * u_darknessFactor;
    float HIGHLIGHT_SOFT = 230.0 / 255.0;
    
    vec3 result = color;
    
    for (int c = 0; c < 3; c++) {
        float v = (c == 0) ? color.r : (c == 1) ? color.g : color.b;
        
        float toneThreshold = 140.0 / 255.0;
        if (v > toneThreshold) continue;
        
        float toneFactor = min(1.0, (toneThreshold - v) / (110.0 / 255.0));
        if (toneFactor <= 0.0) continue;
        
        float contrast = 1.0 + (MAX_CONTRAST - 1.0) * toneFactor;
        float brightness = MAX_BRIGHTNESS * toneFactor;
        
        float nv = (v - 0.5) * contrast + 0.5 + brightness;
        
        if (nv > HIGHLIGHT_SOFT) {
            nv = HIGHLIGHT_SOFT + (nv - HIGHLIGHT_SOFT) * 0.35;
        }
        
        nv = clamp(nv, 0.0, 1.0);
        
        if (c == 0) result.r = nv;
        else if (c == 1) result.g = nv;
        else result.b = nv;
    }
    
    return mix(color, result, u_darkenAmount);
}
`;
