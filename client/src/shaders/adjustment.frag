precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uBrightness;   // -100 to +100
uniform float uContrast;     // 0.5-2.0
uniform float uSaturation;   // 0-2.0
uniform float uSharpness;    // 0-1.0
uniform float uPop;          // 0-1.0 (pop/punch effect)
uniform float uHueShift;     // -180 to +180 degrees
uniform float uSepia;        // 0-1.0
uniform float uVignetteAmount; // 0-1.0
uniform float uVignetteSize;   // 0-1.0 (higher = more center visible)
uniform float uVignetteFeather; // 0-1.0 (higher = softer edge)
// Color tint
uniform vec3 uTintColor;       // RGB color (0-1 per component)
uniform float uTintAmount;     // 0-1.0
// RGB balance
uniform float uRedBalance;     // -100 to +100
uniform float uGreenBalance;   // -100 to +100
uniform float uBlueBalance;    // -100 to +100
// CMYK balance
uniform float uCyanBalance;    // -100 to +100
uniform float uMagentaBalance; // -100 to +100
uniform float uYellowBalance;  // -100 to +100
uniform float uBlackBalance;   // -100 to +100
// Color Balance (Shadows/Midtones/Highlights)
uniform float uShadowsIntensity;   // -100 to +100
uniform float uMidtonesIntensity;  // -100 to +100
uniform float uHighlightsIntensity;// -100 to +100
// Noise Reduction
uniform float uNoiseReduction;     // 0-100
// Preview Modes
uniform float uCmykPreview;        // 0 or 1 (boolean)
// Holographic Effect
uniform float uHoloEffect;         // 0 = none, 1 = rainbow, 2 = prism
uniform float uHoloStrength;       // 0-100
uniform float uHoloAreaMode;       // 0 = full, 1 = bright areas only
uniform float uHoloAreaThreshold;  // 0-100 (brightness threshold for bright mode)
uniform float uHoloAngle;          // 0-360 (animated angle)
uniform float uHoloSweepWidth;     // 10-100 (sweep band width percentage)
uniform float uHoloStarSize;       // 10-100 (star size for stars effect)
uniform float uHoloStarVariety;    // 0-100 (position randomness)
uniform float uHoloBlur;           // 0-100 (softness/blur for glitter)
uniform float uHoloProbability;    // 0-100 (density/amount)
uniform vec2 uHoloUvOffset;        // UV offset for when filter operates on clipped sprite
uniform vec2 uHoloUvScale;         // UV scale for when filter operates on clipped sprite
// Color Replace
uniform float uColorReplaceEnabled; // 0 or 1
uniform vec3 uColorReplaceSource;   // RGB (0-1)
uniform vec3 uColorReplaceTarget;   // RGB (0-1)
uniform float uColorReplaceThreshold; // 0-100
// Gamma
uniform float uGamma;               // 0.1-3.0

#ifdef IS_PIXI
uniform vec4 uOutputFrame;          // x, y = offset, z, w = size
uniform vec4 uInputSize;            // x, y = texture size, z, w = 1/texture size
#endif

// Helper to calculate texel stride (1 pixel divided by total resolution)
vec2 getTexelSize() {
#ifdef IS_PIXI
    // vTextureCoord ranges across the sprite bounds mapped by uOutputFrame/uInputSize
    vec2 ratio = uOutputFrame.zw * uInputSize.zw;
    return ratio / uResolution;
#else
    // For WebGL full quad drawing (pdf.worker.ts), coordinates naturally span 0-1
    return 1.0 / uResolution;
#endif
}

// Helper to normalize the current UV onto a pristine 0-1 coordinate space across the image
vec2 getNormalizedUv(vec2 uv) {
#ifdef IS_PIXI
    vec2 ratio = uOutputFrame.zw * uInputSize.zw;
    return uv / ratio;
#else
    return uv;
#endif
}


float luminance(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
}

vec3 applyBrightnessContrast(vec3 color) {
    float brightness = uBrightness / 255.0;
    vec3 result = (color - 0.5) * uContrast + 0.5 + brightness;
    return clamp(result, 0.0, 1.0);
}

vec3 applySaturation(vec3 color) {
    float luma = luminance(color);
    vec3 gray = vec3(luma);
    return mix(gray, color, uSaturation);
}

// Pop/punch effect - boosts contrast in midtones for a more vibrant look
vec3 applyPop(vec3 color) {
    if (uPop <= 0.0) return color;
    // S-curve contrast boost focused on midtones
    // Uses a smooth step that affects midtones more than shadows/highlights
    vec3 result = color;
    // Apply per-channel S-curve: smoothstep creates gentle midtone contrast boost
    result = mix(color, smoothstep(0.0, 1.0, color), uPop * 0.5);
    // Also boost saturation slightly for the "pop" feeling
    float luma = luminance(result);
    vec3 gray = vec3(luma);
    result = mix(result, mix(gray, result, 1.0 + uPop * 0.3), 1.0);
    return clamp(result, 0.0, 1.0);
}

vec3 applySharpness(vec3 color, vec2 uv) {
    if (uSharpness <= 0.0) return color;
    
    vec2 texelSize = getTexelSize();
    vec3 n = texture(uTexture, uv + vec2(0.0, -texelSize.y)).rgb;
    vec3 s = texture(uTexture, uv + vec2(0.0, texelSize.y)).rgb;
    vec3 e = texture(uTexture, uv + vec2(texelSize.x, 0.0)).rgb;
    vec3 w = texture(uTexture, uv + vec2(-texelSize.x, 0.0)).rgb;
    
    vec3 laplacian = 4.0 * color - (n + s + e + w);
    float strength = uSharpness * 0.5;
    
    return clamp(color + laplacian * strength, 0.0, 1.0);
}

vec3 applyNoiseReduction(vec3 color, vec2 uv) {
    if (uNoiseReduction <= 0.0) return color;
    
    vec2 texelSize = getTexelSize();
    vec3 c  = color;
    vec3 n  = texture(uTexture, uv + vec2(0.0, -texelSize.y)).rgb;
    vec3 s  = texture(uTexture, uv + vec2(0.0, texelSize.y)).rgb;
    vec3 e  = texture(uTexture, uv + vec2(texelSize.x, 0.0)).rgb;
    vec3 w  = texture(uTexture, uv + vec2(-texelSize.x, 0.0)).rgb;
    vec3 ne = texture(uTexture, uv + vec2(texelSize.x, -texelSize.y)).rgb;
    vec3 nw = texture(uTexture, uv + vec2(-texelSize.x, -texelSize.y)).rgb;
    vec3 se = texture(uTexture, uv + vec2(texelSize.x, texelSize.y)).rgb;
    vec3 sw = texture(uTexture, uv + vec2(-texelSize.x, texelSize.y)).rgb;
    
    vec3 blurred = (c + n + s + e + w + ne + nw + se + sw) / 9.0;
    float strength = uNoiseReduction / 100.0;
    
    return mix(color, blurred, strength);
}

vec3 rgb2hsl(vec3 c) {
    float maxC = max(max(c.r, c.g), c.b);
    float minC = min(min(c.r, c.g), c.b);
    float l = (maxC + minC) / 2.0;
    
    if (maxC == minC) {
        return vec3(0.0, 0.0, l);
    }
    
    float d = maxC - minC;
    float s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
    
    float h;
    if (maxC == c.r) {
        h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    } else if (maxC == c.g) {
        h = (c.b - c.r) / d + 2.0;
    } else {
        h = (c.r - c.g) / d + 4.0;
    }
    h /= 6.0;
    
    return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
    if (t < 0.0) t += 1.0;
    if (t > 1.0) t -= 1.0;
    if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
    if (t < 1.0/2.0) return q;
    if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
    return p;
}

vec3 hsl2rgb(vec3 hsl) {
    float h = hsl.x, s = hsl.y, l = hsl.z;
    
    if (s == 0.0) {
        return vec3(l);
    }
    
    float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
    float p = 2.0 * l - q;
    
    return vec3(
        hue2rgb(p, q, h + 1.0/3.0),
        hue2rgb(p, q, h),
        hue2rgb(p, q, h - 1.0/3.0)
    );
}

vec3 applyHueShift(vec3 color) {
    if (abs(uHueShift) < 0.001) return color;
    
    vec3 hsl = rgb2hsl(color);
    hsl.x += uHueShift / 360.0;
    hsl.x = fract(hsl.x);
    return hsl2rgb(hsl);
}

vec3 applySepia(vec3 color) {
    if (uSepia <= 0.0) return color;
    
    vec3 sepia = vec3(
        dot(color, vec3(0.393, 0.769, 0.189)),
        dot(color, vec3(0.349, 0.686, 0.168)),
        dot(color, vec3(0.272, 0.534, 0.131))
    );
    
    return mix(color, sepia, uSepia);
}

vec3 applyVignette(vec3 color, vec2 uv) {
    if (uVignetteAmount <= 0.0) return color;
    
    vec2 normalizedPos = getNormalizedUv(uv);
    vec2 center = normalizedPos - 0.5;
    float dist = length(center * 2.0);
    float innerRadius = 1.0 - uVignetteSize;
    float outerRadius = innerRadius + uVignetteFeather;
    float vignette = smoothstep(innerRadius, outerRadius, dist);
    
    return color * (1.0 - vignette * uVignetteAmount);
}

vec3 applyColorTint(vec3 color) {
    if (uTintAmount <= 0.0) return color;
    return mix(color, uTintColor * luminance(color), uTintAmount);
}

vec3 applyRGBBalance(vec3 color) {
    if (uRedBalance == 0.0 && uGreenBalance == 0.0 && uBlueBalance == 0.0) return color;
    vec3 balance = vec3(uRedBalance, uGreenBalance, uBlueBalance) / 200.0;
    return clamp(color + balance, 0.0, 1.0);
}

vec3 applyCMYKBalance(vec3 color) {
    if (uCyanBalance == 0.0 && uMagentaBalance == 0.0 && uYellowBalance == 0.0 && uBlackBalance == 0.0) {
        return color;
    }
    float cyan = uCyanBalance / 200.0;
    float magenta = uMagentaBalance / 200.0;
    float yellow = uYellowBalance / 200.0;
    float black = uBlackBalance / 200.0;
    vec3 result = color;
    result.r -= cyan + black;
    result.g -= magenta + black;
    result.b -= yellow + black;
    return clamp(result, 0.0, 1.0);
}

vec3 applyColorBalance(vec3 color) {
    if (uShadowsIntensity == 0.0 && uMidtonesIntensity == 0.0 && uHighlightsIntensity == 0.0) {
        return color;
    }
    float lum = luminance(color);
    float shadowWeight = 1.0 - smoothstep(0.0, 0.33, lum);
    float highlightWeight = smoothstep(0.67, 1.0, lum);
    float midtoneWeight = 1.0 - shadowWeight - highlightWeight;
    midtoneWeight = max(midtoneWeight, 0.0);
    float shadowAdj = uShadowsIntensity / 200.0;
    float midtoneAdj = uMidtonesIntensity / 200.0;
    float highlightAdj = uHighlightsIntensity / 200.0;
    float adjustment = shadowAdj * shadowWeight + midtoneAdj * midtoneWeight + highlightAdj * highlightWeight;
    return clamp(color + adjustment, 0.0, 1.0);
}

vec3 applyCmykPreview(vec3 color) {
    if (uCmykPreview <= 0.0) return color;
    float k = 1.0 - max(max(color.r, color.g), color.b);
    float c = (1.0 - color.r - k) / max(1.0 - k, 0.0001);
    float m = (1.0 - color.g - k) / max(1.0 - k, 0.0001);
    float y = (1.0 - color.b - k) / max(1.0 - k, 0.0001);
    c = clamp(c, 0.0, 1.0);
    m = clamp(m, 0.0, 1.0);
    y = clamp(y, 0.0, 1.0);
    k = clamp(k, 0.0, 1.0);
    float r = (1.0 - c) * (1.0 - k);
    float g = (1.0 - m) * (1.0 - k);
    float b = (1.0 - y) * (1.0 - k);
    vec3 cmykRgb = vec3(r, g, b);
    float lumC = luminance(cmykRgb);
    cmykRgb = mix(cmykRgb, vec3(lumC), 0.08);
    return cmykRgb;
}

vec3 applyHolographic(vec3 color, vec2 uv) {
    if (uHoloEffect <= 0.0) return color;
    
    // Normalize to 0-1 and correct UV to account for clipped sprite rendering
    // When a sprite is partially off-screen, PixiJS filters may operate on a smaller area
    // with remapped UVs. Use offset/scale to recover true card-space coordinates.
    vec2 normUv = getNormalizedUv(uv);
    vec2 correctedUv = uHoloUvOffset + normUv * uHoloUvScale;
    
    bool isSweepMode = uHoloAngle >= 1000.0 && uHoloAngle < 2000.0;
    bool isTwinkleMode = uHoloAngle >= 2000.0;
    float effectiveAngle = isSweepMode ? (uHoloAngle - 1000.0) : (isTwinkleMode ? (uHoloAngle - 2000.0) : uHoloAngle);
    
    float hueOffset;
    float bandT = isSweepMode ? clamp(effectiveAngle / 180.0, 0.0, 1.0) : 0.0;
    if (isSweepMode) {
        float diagonalPos = (correctedUv.x + correctedUv.y) * 0.707;
        hueOffset = diagonalPos + bandT * 0.25;
    } else {
        float angleRad = effectiveAngle * 3.14159 / 180.0;
        hueOffset = correctedUv.x * cos(angleRad) + correctedUv.y * sin(angleRad);
    }
    
    float sweepIntensity = 1.0;
    if (isSweepMode) {
        float bandWidth = clamp(uHoloSweepWidth / 100.0, 0.1, 1.0);
        float halfBand = bandWidth / 2.0;
        float t = clamp(effectiveAngle / 180.0, 0.0, 1.0);
        float bandCenter = t;
        float distFromCenter = abs(correctedUv.x - bandCenter);
        if (distFromCenter > halfBand) {
            sweepIntensity = 0.0;
        } else {
            sweepIntensity = 1.0 - (distFromCenter / halfBand);
        }
    }
    
    float hue;
    float sparkleIntensity = 1.0;
    
    if (uHoloEffect >= 3.0) {
        // Stars mode - multi-scale star patterns
        float PI = 3.14159;
        float sizeScale = uHoloStarSize / 50.0;
        // 2x scale for variety to give user more range
        float varietyScale = (uHoloStarVariety / 100.0) * 2.0;
        float densityThreshold = 1.0 - (uHoloProbability / 100.0);
        
        // Large 4-pointed stars
        float largeGridSize = 10.0;
        vec2 largeCell = floor(correctedUv * largeGridSize);
        float largeId = largeCell.x * 127.1 + largeCell.y * 311.7;
        float largeRand = fract(sin(largeId) * 43758.5453);
        
        float largeStar = 0.0;
        if (largeRand > densityThreshold) {
            vec2 largeOffset = vec2(fract(sin(largeId * 1.3) * 21234.1), fract(sin(largeId * 2.7) * 43921.7)) * 0.7 * varietyScale - 0.35 * varietyScale;
            vec2 largeCellUv = fract(correctedUv * largeGridSize) - 0.5 + largeOffset;
            float largeDist = length(largeCellUv);
            float largeAngle = atan(largeCellUv.y, largeCellUv.x);
            float rayLength = 0.4 * sizeScale;
            float rayBaseWidth = 0.12 * sizeScale;
            float rayPeak = pow(abs(cos(largeAngle * 2.0)), 2.0);
            float rayReach = mix(0.08 * sizeScale, rayLength, rayPeak);
            float taperFactor = clamp(1.0 - largeDist / rayReach, 0.0, 1.0);
            float allowedWidth = rayBaseWidth * taperFactor * rayPeak;
            float perpDist = largeDist * sqrt(1.0 - rayPeak * rayPeak);
            float largeStarShape = smoothstep(allowedWidth, allowedWidth * 0.3, perpDist) * step(largeDist, rayReach);
            float largeCenter = smoothstep(0.1 * sizeScale, 0.0, largeDist);
            largeStar = max(largeStarShape, largeCenter);
        }
        
        // Medium 5-pointed stars
        float medGridSize = 18.0;
        vec2 medCell = floor(correctedUv * medGridSize);
        float medId = medCell.x * 173.3 + medCell.y * 259.1;
        float medRand = fract(sin(medId) * 34159.3);
        float medStar = 0.0;
        if (medRand > densityThreshold) {
            vec2 medOffset = vec2(fract(sin(medId * 1.7) * 31234.5), fract(sin(medId * 3.1) * 53921.2)) * 0.6 * varietyScale - 0.3 * varietyScale;
            vec2 medCellUv = fract(correctedUv * medGridSize) - 0.5 + medOffset;
            float medDist = length(medCellUv);
            float medAngle = atan(medCellUv.y, medCellUv.x);
            float starPoints = 5.0;
            float medStarAngle = mod(medAngle + PI / 2.0, 2.0 * PI / starPoints) - PI / starPoints;
            float outerRadius = 0.22 * sizeScale;
            float innerRadius = 0.08 * sizeScale;
            float medStarRadius = innerRadius / cos(abs(medStarAngle));
            medStarRadius = min(medStarRadius, outerRadius);
            float medStarBlend = smoothstep(medStarRadius * 1.1, medStarRadius * 0.5, medDist);
            medStar = medStarBlend * 0.85;
        }
        
        // Small sparkles
        float smallGridSize = 30.0;
        vec2 smallCell = floor(correctedUv * smallGridSize);
        float smallId = smallCell.x * 211.7 + smallCell.y * 199.3;
        float smallRand = fract(sin(smallId) * 54321.9);
        float smallStar = 0.0;
        if (smallRand > densityThreshold) {
            vec2 smallOffset = vec2(fract(sin(smallId * 2.1) * 11234.3), fract(sin(smallId * 4.3) * 63921.8)) * 0.5 * varietyScale - 0.25 * varietyScale;
            vec2 smallCellUv = fract(correctedUv * smallGridSize) - 0.5 + smallOffset;
            float smallDist = length(smallCellUv);
            float smallAngle = atan(smallCellUv.y, smallCellUv.x);
            float smallRayLength = 0.28 * sizeScale;
            float smallRayBaseWidth = 0.08 * sizeScale;
            float smallRayPeak = pow(abs(cos(smallAngle * 2.0)), 2.0);
            float smallRayReach = mix(0.05 * sizeScale, smallRayLength, smallRayPeak);
            float smallTaperFactor = clamp(1.0 - smallDist / smallRayReach, 0.0, 1.0);
            float smallAllowedWidth = smallRayBaseWidth * smallTaperFactor * smallRayPeak;
            float smallPerpDist = smallDist * sqrt(1.0 - smallRayPeak * smallRayPeak);
            float smallStarShape = smoothstep(smallAllowedWidth, smallAllowedWidth * 0.2, smallPerpDist) * step(smallDist, smallRayReach);
            float smallCenter = smoothstep(0.06 * sizeScale, 0.0, smallDist);
            smallStar = max(smallStarShape, smallCenter) * 0.7;
        }
        
        float combinedStar = max(largeStar, max(medStar, smallStar));
        float combinedRand = largeStar > medStar ? (largeStar > smallStar ? largeRand : smallRand) : (medStar > smallStar ? medRand : smallRand);
        
        if (combinedStar > 0.05) {
            float twinklePhase = combinedRand * 6.28318;
            float twinkleSpeed = isTwinkleMode ? 1.0 : 0.33;
            float speedVar = 0.8 + 0.4 * fract(combinedRand * 123.45);
            float twinkleWave = sin(effectiveAngle * 3.14159 / 30.0 * twinkleSpeed * speedVar + twinklePhase);
            float twinkleThreshold = isTwinkleMode ? (twinkleWave * 0.5 + 0.5) : (twinkleWave * 0.25 + 0.75);
            float twinkleVisible = smoothstep(0.3, 0.7, twinkleThreshold);
            sparkleIntensity = combinedStar * twinkleVisible;
            hue = fract(combinedRand * 6.0 + effectiveAngle / 360.0);
        } else {
             sparkleIntensity = 0.0;
             hue = 0.0;
        }
    } else if (uHoloEffect >= 2.0) {
        // Glitter mode
        float sizeScale = uHoloStarSize / 50.0;
        float gridSize = 22.0;
        vec2 gridPos = correctedUv * gridSize;
        vec2 baseCell = floor(gridPos);
        float densityThreshold = 1.0 - (uHoloProbability / 100.0);
        // 2x scale for variety to give user more range
        float positionRandomness = (uHoloStarVariety / 100.0) * 2.0;

        float totalIntensity = 0.0;
        float winningHue = 0.0;
        float maxIntensity = 0.0;
        
        for (float ox = -2.0; ox <= 2.0; ox += 1.0) {
            for (float oy = -2.0; oy <= 2.0; oy += 1.0) {
                vec2 cell = baseCell + vec2(ox, oy);
                float cellId = cell.x * 127.1 + cell.y * 311.7;
                float rand = fract(sin(cellId) * 43758.5453);
                if (rand > densityThreshold) {
                    vec2 randomOffset = vec2(fract(sin(cellId * 1.3) * 21234.1), fract(sin(cellId * 2.7) * 43921.7)) - 0.5;
                    vec2 cellOffset = randomOffset * 0.8 * positionRandomness;
                    vec2 sparklePos = (cell + 0.5 + cellOffset) / gridSize;
                    vec2 localUv = (correctedUv - sparklePos) * gridSize;
                    
                    float rectHalfSize = 0.25 * sizeScale;
                    rectHalfSize = min(rectHalfSize, 0.48);
                    // Blur controlled by user (0-100 slider -> 0.0-1.0)
                    float blurAmount = uHoloBlur / 100.0;
                    float cornerRadius = rectHalfSize * blurAmount;
                    float shadowExtent = 0.1 + 0.4 * blurAmount;
                    vec2 d = abs(localUv) - vec2(rectHalfSize - cornerRadius);
                    float sdf = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - cornerRadius;
                    
                    float intensity = 0.0;
                    if (sdf < 0.0) {
                        intensity = 1.0;
                    } else if (sdf < shadowExtent) {
                        float t = sdf / shadowExtent;
                        intensity = 1.0 - t * t;
                    }
                    
                    if (intensity > 0.01) {
                        float twinklePhase = rand * 6.28318;
                        float twinkleSpeed = isTwinkleMode ? 1.0 : 0.33;
                        float speedVar = 0.8 + 0.4 * fract(rand * 123.45);
                        float twinkleWave = sin(effectiveAngle * 3.14159 / 30.0 * twinkleSpeed * speedVar + twinklePhase);
                        float twinkleThreshold = isTwinkleMode ? (twinkleWave * 0.5 + 0.5) : (twinkleWave * 0.25 + 0.75);
                        float twinkleVisible = smoothstep(0.3, 0.7, twinkleThreshold);
                        float finalVal = intensity * twinkleVisible;
                        totalIntensity += finalVal;
                        if (finalVal > maxIntensity) {
                            maxIntensity = finalVal;
                            winningHue = fract(rand * 6.0 + effectiveAngle / 360.0);
                        }
                    }
                }
            }
        }
        sparkleIntensity = min(totalIntensity, 1.5);
        hue = winningHue;
    } else {
        // Rainbow mode
        hue = fract(hueOffset);
    }
    
    float r = abs(hue * 6.0 - 3.0) - 1.0;
    float g = 2.0 - abs(hue * 6.0 - 2.0);
    float b = 2.0 - abs(hue * 6.0 - 4.0);
    vec3 holoColor = clamp(vec3(r, g, b), 0.0, 1.0);
    
    float strength = uHoloStrength / 100.0 * sparkleIntensity * sweepIntensity;
    
    if (uHoloAreaMode >= 1.0) {
        float lum = luminance(color);
        float threshold = uHoloAreaThreshold / 100.0;
        float fadeWidth = 0.15;
        strength *= smoothstep(threshold - fadeWidth, threshold + fadeWidth, lum);
    }
    
    vec3 result = mix(color, color + holoColor * 0.5, strength);
    return clamp(result, 0.0, 1.0);
}

vec3 applyColorReplace(vec3 color) {
    if (uColorReplaceEnabled <= 0.0) return color;
    
    float dist = distance(color, uColorReplaceSource);
    float threshold = (uColorReplaceThreshold / 100.0) * 1.732;
    
    if (dist < threshold) {
        float blend = 1.0 - smoothstep(0.0, threshold, dist);
        return mix(color, uColorReplaceTarget, blend);
    }
    
    return color;
}

vec3 applyGamma(vec3 color) {
    if (abs(uGamma - 1.0) < 0.001) return color;
    return pow(color, vec3(1.0 / uGamma));
}

void main() {
    vec4 color = texture(uTexture, vTextureCoord);
    vec3 rgb = color.rgb;
    
    rgb = applyNoiseReduction(rgb, vTextureCoord);
    rgb = applySharpness(rgb, vTextureCoord);
    rgb = applyGamma(rgb);
    rgb = applyBrightnessContrast(rgb);
    rgb = applySaturation(rgb);
    rgb = applyPop(rgb);
    rgb = applyHueShift(rgb);
    rgb = applySepia(rgb);
    rgb = applyColorTint(rgb);
    rgb = applyRGBBalance(rgb);
    rgb = applyCMYKBalance(rgb);
    rgb = applyColorBalance(rgb);
    rgb = applyColorReplace(rgb);
    rgb = applyCmykPreview(rgb);
    rgb = applyHolographic(rgb, vTextureCoord);
    rgb = applyVignette(rgb, vTextureCoord);
    
    finalColor = vec4(rgb, color.a);
}
