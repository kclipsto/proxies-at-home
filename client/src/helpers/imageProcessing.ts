
import { IMAGE_PROCESSING } from '../constants/imageProcessing';

export const NEAR_BLACK = 16;
export const NEAR_WHITE = 239;
export const ALPHA_EMPTY = 10;

export const IN = (inches: number, dpi: number) => Math.round(inches * dpi);
const MM_TO_IN = (mm: number) => mm / 25.4;
export const MM_TO_PX = (mm: number, dpi: number) => IN(MM_TO_IN(mm), dpi);

export function toProxied(url: string, apiBase: string) {
    if (!url) return url;
    if (url.startsWith("data:")) return url;
    if (url.startsWith("blob:")) return url;
    // Prevent double-proxying of internal API URLs
    if (url.includes("/api/cards/images/")) {
        return url;
    }

    // Fix for MPC IDs that were incorrectly saved as sourceUrl (containing query params only)
    // unique identifier for MPC is the presence of "&size=" and absence of protocol/path
    if (url.includes("&size=") && !url.startsWith("http") && !url.startsWith("/")) {
        return `${apiBase}/api/cards/images/mpc?id=${url}`;
    }

    const prefix = `${apiBase}/api/cards/images/proxy?url=`;
    if (url.startsWith(prefix)) return url;

    return `${prefix}${encodeURIComponent(url)}`;
}

// Retry with exponential backoff: 1s → 2s → 4s (gentler on servers)
export async function fetchWithRetry(url: string, retries = 3, baseDelay = 1000, init?: RequestInit): Promise<Response> {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, init);
            if (response.ok) {
                return response;
            }
            if (response.status >= 400 && response.status < 500) {
                throw new Error(`Client error: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            if (i === retries - 1) throw error;
        }

        const exponentialDelay = baseDelay * (2 ** i);
        const jitter = Math.random() * (baseDelay / 4); // Reduced jitter to 25% of base
        const totalDelay = exponentialDelay + jitter;

        await new Promise(res => setTimeout(res, totalDelay));
    }
    throw new Error(`Fetch failed for ${url} after ${retries} attempts.`);
}

export async function loadImage(src: string, init?: RequestInit): Promise<ImageBitmap> {
    const response = await fetchWithRetry(src, 3, 1000, init);
    const blob = await response.blob();
    return await createImageBitmap(blob);
}

export function getBleedInPixels(
    bleedEdgeWidth: number,
    unit: string,
    dpi: number
): number {
    return unit === "mm"
        ? IN(bleedEdgeWidth / 25.4, dpi)
        : IN(bleedEdgeWidth, dpi);
}

export function bucketDpiFromHeight(h: number) {
    if (h >= 4440) return 1200;
    if (h >= 2960) return 800;
    if (h >= 2220) return 600;
    return 300;
}

export function calibratedBleedTrimPxForHeight(h: number) {
    const dpi = bucketDpiFromHeight(h);
    if (dpi === 300) return 72;
    if (dpi === 600) return 78;
    if (dpi === 800) return 104;
    return 156;
}

export async function trimBleedFromBitmap(img: ImageBitmap, bleedTrimPx?: number): Promise<ImageBitmap> {
    const trim = bleedTrimPx ?? calibratedBleedTrimPxForHeight(img.height);
    const w = img.width - trim * 2;
    const h = img.height - trim * 2;
    if (w <= 0 || h <= 0) return img;
    return await createImageBitmap(img, trim, trim, w, h);
}

/**
 * Trim bleed from an image by a specified amount in mm.
 * Used by bleed workers when trimming from existing bleed to target bleed.
 *
 * @param input - ImageBitmap or Blob to trim
 * @param trimAmountMm - Amount of bleed to remove from each edge (in mm)
 * @param existingBleedMm - The total existing bleed the image has (in mm), used to calculate pixel ratio
 * @returns A new ImageBitmap with the specified bleed amount removed
 */
export async function trimBleedByMm(
    input: ImageBitmap | Blob,
    trimAmountMm: number,
    existingBleedMm: number
): Promise<ImageBitmap> {
    const tempBitmap = input instanceof Blob ? await createImageBitmap(input) : input;

    // Standard MTG card is 63x88mm, calculate pixel ratio based on existing bleed dimensions
    const pxPerMm = tempBitmap.height / (IMAGE_PROCESSING.CARD_HEIGHT_MM + existingBleedMm * 2);
    const trimPx = Math.round(trimAmountMm * pxPerMm);
    const w = tempBitmap.width - trimPx * 2;
    const h = tempBitmap.height - trimPx * 2;

    // Close temp bitmap if we created it from blob
    if (input instanceof Blob) {
        tempBitmap.close();
    }

    if (w <= 0 || h <= 0) {
        // Can't trim that much, return original
        return input instanceof Blob ? await createImageBitmap(input) : input;
    }

    // Create trimmed bitmap from original input
    return input instanceof Blob
        ? await createImageBitmap(input, trimPx, trimPx, w, h)
        : await createImageBitmap(input, trimPx, trimPx, w, h);
}

export async function trimExistingBleedIfAny(src: string, bleedTrimPx?: number, init?: RequestInit): Promise<ImageBitmap> {
    const img = await loadImage(src, init);
    const newImg = await trimBleedFromBitmap(img, bleedTrimPx);
    if (newImg !== img) img.close();
    return newImg;
}

export function blackenAllNearBlackPixels(
    imgData: ImageData,
) {
    const d = imgData.data;
    const width = imgData.width;
    const height = imgData.height;

    const dpi = bucketDpiFromHeight(height);
    const dpiScale = dpi / 300;
    const EDGE_PX = Math.round(IMAGE_PROCESSING.EDGE_ZONE_BASE_PX * dpiScale);

    // Use shared utility for histogram-based darkness calculation
    const darknessFactor = computeDarknessFactorFromPixels(d);

    const MAX_CONTRAST = 1 + 0.22 * darknessFactor;
    const MAX_BRIGHTNESS = -8 * darknessFactor;
    const HIGHLIGHT_SOFT = 230;

    // --- 4. Apply adaptive edge contrast ---
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;

            const edgeDist = Math.min(x, y, width - x - 1, height - y - 1);

            if (edgeDist >= EDGE_PX) continue;

            let edgeFactor = 1 - edgeDist / EDGE_PX;
            edgeFactor *= edgeFactor; // smooth falloff

            for (let c = 0; c < 3; c++) {
                const v = d[i + c];

                // Adaptive tone gating
                if (v > 140) continue;

                const toneFactor = Math.min(1, (140 - v) / 110);
                const strength = edgeFactor * toneFactor;

                if (strength <= 0) continue;

                const contrast = 1 + (MAX_CONTRAST - 1) * strength;
                const brightness = MAX_BRIGHTNESS * strength;

                let nv = (v - 128) * contrast + 128 + brightness;

                if (nv > HIGHLIGHT_SOFT) {
                    nv = HIGHLIGHT_SOFT + (nv - HIGHLIGHT_SOFT) * 0.35;
                }

                d[i + c] = nv < 0 ? 0 : nv > 255 ? 255 : nv;
            }
        }
    }
}

export function getPatchNearCorner(
    ctx: OffscreenCanvasRenderingContext2D,
    seedX: number,
    seedY: number,
    patchSize: number
) {
    const sampleSize = patchSize * 2;
    let bestPatch = { x: seedX, y: seedY, score: -1 };

    for (let y = 0; y <= sampleSize - patchSize; y += 4) {
        for (let x = 0; x <= sampleSize - patchSize; x += 4) {
            let score = 0;
            let blackPixels = 0;
            const patch = ctx.getImageData(
                seedX + x,
                seedY + y,
                patchSize,
                patchSize
            ).data;

            for (let i = 0; i < patch.length; i += 4) {
                const r = patch[i];
                const g = patch[i + 1];
                const b = patch[i + 2];
                if (r < NEAR_BLACK && g < NEAR_BLACK && b < NEAR_BLACK) {
                    blackPixels++;
                }
                score += Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);
            }

            if (blackPixels / (patchSize * patchSize) < 0.75) {
                if (bestPatch.score === -1 || score < bestPatch.score) {
                    bestPatch = { x: seedX + x, y: seedY + y, score };
                }
            }
        }
    }

    return { sx: bestPatch.x, sy: bestPatch.y };
}

// ============================================================
// Shared CPU image processing utilities
// Used by both webglImageProcessing.ts and bleed.webgl.worker.ts
// ============================================================

/**
 * Compute the darknessFactor from raw pixel data by building a luminance histogram.
 * Returns a value 0-1 where:
 * - 0 = very dark image (10th percentile luminance near 90)
 * - 1 = light image (10th percentile luminance near 20 or below)
 * 
 * This is used for adaptive edge contrast - darker images get less aggressive
 * darkening to avoid crushing details.
 * 
 * @param pixelData - Raw RGBA pixel data (Uint8ClampedArray from ImageData.data)
 * @param sampleStep - Number of bytes to skip between samples (default: 16 = every 4th pixel)
 */
export function computeDarknessFactorFromPixels(
    pixelData: Uint8ClampedArray,
    sampleStep: number = 16
): number {
    // Build luminance histogram
    const hist = new Uint32Array(256);

    for (let i = 0; i < pixelData.length; i += sampleStep) {
        const l = 0.2126 * pixelData[i] + 0.7152 * pixelData[i + 1] + 0.0722 * pixelData[i + 2];
        hist[Math.max(0, Math.min(255, l | 0))]++;
    }

    // Find 10th percentile luminance
    const total = hist.reduce((a, b) => a + b, 0);
    let acc = 0;
    let p10 = 0;

    for (let i = 0; i < 256; i++) {
        acc += hist[i];
        if (acc >= total * 0.1) {
            p10 = i;
            break;
        }
    }

    // Convert to darknessFactor: (90 - p10) / 70, clamped to 0-1
    return Math.min(1, Math.max(0, (90 - p10) / 70));
}

/**
 * Compute the darknessFactor from an ImageData object.
 */
export function computeDarknessFactorFromImageData(imageData: ImageData): number {
    return computeDarknessFactorFromPixels(imageData.data);
}

/**
 * Apply adaptive edge contrast to an ImageData object.
 * Same algorithm as the GLSL shader version.
 * Only affects dark pixels (< 140) within the edge zone.
 * 
 * @param imageData - The ImageData object to modify in place
 * @param darknessFactor - Adjustment factor (0-1) computed from histogram
 */
export function applyEdgeContrastCPU(imageData: ImageData, darknessFactor: number): void {
    const d = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    // DPI-aware edge zone (assuming ~300dpi baseline for standard card)
    // Standard MtG card is 63mm × 88mm. At 300dpi, 88mm = 88/25.4 * 300 ≈ 1039px
    // This allows the edge detection to scale properly for different resolution images
    const STANDARD_CARD_HEIGHT_300DPI = 1039;
    const dpiScale = height / STANDARD_CARD_HEIGHT_300DPI;
    // Base edge zone is 64px at 300dpi (~5.5mm), scaled proportionally
    const EDGE_PX = Math.round(IMAGE_PROCESSING.EDGE_ZONE_BASE_PX * dpiScale);

    const MAX_CONTRAST = 1 + 0.22 * darknessFactor;
    const MAX_BRIGHTNESS = -8 * darknessFactor;
    const HIGHLIGHT_SOFT = 230;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;

            const edgeDist = Math.min(x, y, width - x - 1, height - y - 1);
            if (edgeDist >= EDGE_PX) continue;

            let edgeFactor = 1 - edgeDist / EDGE_PX;
            edgeFactor *= edgeFactor; // smooth falloff

            for (let c = 0; c < 3; c++) {
                const v = d[i + c];

                // Adaptive tone gating - only affect dark pixels
                if (v > 140) continue;

                const toneFactor = Math.min(1, (140 - v) / 110);
                const strength = edgeFactor * toneFactor;
                if (strength <= 0) continue;

                const contrast = 1 + (MAX_CONTRAST - 1) * strength;
                const brightness = MAX_BRIGHTNESS * strength;

                let nv = (v - 128) * contrast + 128 + brightness;

                if (nv > HIGHLIGHT_SOFT) {
                    nv = HIGHLIGHT_SOFT + (nv - HIGHLIGHT_SOFT) * 0.35;
                }

                d[i + c] = nv < 0 ? 0 : nv > 255 ? 255 : nv;
            }
        }
    }
}

/**
 * Apply full-card contrast to an ImageData object.
 * Same as edge contrast but applies to entire card (no edge distance check).
 * 
 * @param imageData - The ImageData object to modify in place
 * @param darknessFactor - Adjustment factor (0-1) computed from histogram
 */
export function applyContrastFullCPU(imageData: ImageData, darknessFactor: number): void {
    const d = imageData.data;

    const MAX_CONTRAST = 1 + 0.22 * darknessFactor;
    const MAX_BRIGHTNESS = -8 * darknessFactor;
    const HIGHLIGHT_SOFT = 230;

    for (let i = 0; i < d.length; i += 4) {
        for (let c = 0; c < 3; c++) {
            const v = d[i + c];

            // Only affect dark pixels (< 140)
            if (v > 140) continue;

            const toneFactor = Math.min(1, (140 - v) / 110);
            if (toneFactor <= 0) continue;

            const contrast = 1 + (MAX_CONTRAST - 1) * toneFactor;
            const brightness = MAX_BRIGHTNESS * toneFactor;

            let nv = (v - 128) * contrast + 128 + brightness;

            if (nv > HIGHLIGHT_SOFT) {
                nv = HIGHLIGHT_SOFT + (nv - HIGHLIGHT_SOFT) * 0.35;
            }

            d[i + c] = nv < 0 ? 0 : nv > 255 ? 255 : nv;
        }
    }
}

/**
 * Apply legacy darken-all to an ImageData object.
 * Simple threshold: pixels with all RGB < 30 become pure black.
 * 
 * @param imageData - The ImageData object to modify in place
 */
export function applyDarkenAllCPU(imageData: ImageData): void {
    const d = imageData.data;
    const threshold = 30;

    for (let i = 0; i < d.length; i += 4) {
        if (d[i] < threshold && d[i + 1] < threshold && d[i + 2] < threshold) {
            d[i] = 0;
            d[i + 1] = 0;
            d[i + 2] = 0;
        }
    }
}

/**
 * Determines whether to use the "Fast Path" (trimming) for bleed processing.
 * 
 * @param targetBleedMm - The desired bleed width in mm
 * @param existingBleedMm - The existing built-in bleed in mm (default 3.175)
 * @returns true if we should trim existing bleed instead of generating new bleed
 */
export function shouldTrimBleed(targetBleedMm: number, existingBleedMm: number = IMAGE_PROCESSING.DEFAULT_MPC_BLEED_MM): boolean {
    return targetBleedMm <= existingBleedMm;
}

