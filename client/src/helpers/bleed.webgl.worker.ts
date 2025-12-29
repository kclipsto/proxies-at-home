import { fetchWithRetry, toProxied, calibratedBleedTrimPxForHeight } from "./imageProcessing";
import { processCardImageWebGL } from "./webglImageProcessing";
import { db } from "../db";

export { };
declare const self: DedicatedWorkerGlobalScope;

let API_BASE = "";

// Cache TTL: 7 days
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// In-flight requests map to prevent duplicate fetches within a session
const inflightRequests = new Map<string, Promise<Blob>>();

// Helper: Convert mm to pixels at given DPI
const MM_TO_PX = (mm: number, dpi: number) => Math.round((mm / 25.4) * dpi);

// Helper: Convert bleed width to pixels
function getBleedInPixels(bleedMm: number, unit: 'mm' | 'in', dpi: number): number {
    if (unit === 'in') {
        return bleedMm * dpi;
    }
    return (bleedMm / 25.4) * dpi;
}

/**
 * Compute the darknessFactor from pixel data by building a luminance histogram.
 * Same algorithm as in webglImageProcessing.ts but works with raw pixel data.
 */
function computeDarknessFactorFromImageData(imageData: ImageData): number {
    const d = imageData.data;

    // Build luminance histogram (sample every 4th pixel for speed)
    const hist = new Uint32Array(256);
    const sampleStep = 4 * 4; // every 4th pixel (4 bytes per pixel)

    for (let i = 0; i < d.length; i += sampleStep) {
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
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

    return Math.min(1, Math.max(0, (90 - p10) / 70));
}

/**
 * Apply adaptive edge contrast to an ImageData object.
 * Same algorithm as the GLSL shader version.
 */
function applyEdgeContrastCPU(imageData: ImageData, darknessFactor: number): void {
    const d = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    // DPI-aware edge zone (assuming ~300dpi baseline for standard card)
    const dpiScale = height / 1039; // ~1039px at 300dpi for 88mm card + bleed
    const EDGE_PX = Math.round(64 * dpiScale);

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
 */
function applyContrastFullCPU(imageData: ImageData, darknessFactor: number): void {
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
 */
function applyDarkenAllCPU(imageData: ImageData): void {
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

// Note: DarkenMode type removed - all modes are now pre-generated

/**
 * Resize an image WITHOUT generating new bleed.
 * Used for 'existing' mode where the image already has bleed built in.
 * We resize to match the expected dimensions (card + specified bleed width)
 * and report the correct bleed width for cut guide placement.
 */
async function resizeWithoutBleed(
    img: ImageBitmap,
    bleedWidthMm: number,
    opts?: { unit?: 'mm' | 'in'; exportDpi?: number; displayDpi?: number }
): Promise<{
    exportBlob: Blob;
    exportDpi: number;
    exportBleedWidth: number;
    displayBlob: Blob;
    displayDpi: number;
    displayBleedWidth: number;
    // Per-mode darkened blobs
    exportBlobDarkenAll: Blob;
    displayBlobDarkenAll: Blob;
    exportBlobContrastEdges: Blob;
    displayBlobContrastEdges: Blob;
    exportBlobContrastFull: Blob;
    displayBlobContrastFull: Blob;
    // Legacy
    exportBlobDarkened: Blob;
    displayBlobDarkened: Blob;
    // For Card Editor live preview
    baseDisplayBlob: Blob;
    baseExportBlob: Blob;
}> {
    const exportDpi = opts?.exportDpi ?? 300;
    const displayDpi = opts?.displayDpi ?? 300;
    const unit = opts?.unit ?? 'mm';

    // Standard MTG card dimensions: 63x88mm
    const cardWidthMm = 63;
    const cardHeightMm = 88;

    // Calculate bleed in pixels at each DPI
    const exportBleedPx = Math.round(getBleedInPixels(bleedWidthMm, unit, exportDpi));
    const displayBleedPx = Math.round(getBleedInPixels(bleedWidthMm, unit, displayDpi));

    // Calculate total dimensions including bleed
    const exportWidth = MM_TO_PX(cardWidthMm, exportDpi) + exportBleedPx * 2;
    const exportHeight = MM_TO_PX(cardHeightMm, exportDpi) + exportBleedPx * 2;
    const displayWidth = MM_TO_PX(cardWidthMm, displayDpi) + displayBleedPx * 2;
    const displayHeight = MM_TO_PX(cardHeightMm, displayDpi) + displayBleedPx * 2;

    // Create export canvas and resize image to fit
    const exportCanvas = new OffscreenCanvas(exportWidth, exportHeight);
    const exportCtx = exportCanvas.getContext('2d', { willReadFrequently: true })!;
    exportCtx.imageSmoothingQuality = 'high';
    exportCtx.drawImage(img, 0, 0, exportWidth, exportHeight);

    // Create display canvas
    const displayCanvas = new OffscreenCanvas(displayWidth, displayHeight);
    const displayCtx = displayCanvas.getContext('2d', { willReadFrequently: true })!;
    displayCtx.imageSmoothingQuality = 'high';
    displayCtx.drawImage(img, 0, 0, displayWidth, displayHeight);

    // Get image data for all darkening modes
    const exportImageData = exportCtx.getImageData(0, 0, exportWidth, exportHeight);
    const displayImageData = displayCtx.getImageData(0, 0, displayWidth, displayHeight);
    const darknessFactor = computeDarknessFactorFromImageData(exportImageData);

    // Convert to blobs (normal versions - mode 0)
    const exportBlob = await exportCanvas.convertToBlob({ type: 'image/png' });
    const displayBlob = await displayCanvas.convertToBlob({ type: 'image/png' });

    // --- Mode 1: Darken All ---
    const exportDataMode1 = new ImageData(new Uint8ClampedArray(exportImageData.data), exportWidth, exportHeight);
    const displayDataMode1 = new ImageData(new Uint8ClampedArray(displayImageData.data), displayWidth, displayHeight);
    applyDarkenAllCPU(exportDataMode1);
    applyDarkenAllCPU(displayDataMode1);
    exportCtx.putImageData(exportDataMode1, 0, 0);
    displayCtx.putImageData(displayDataMode1, 0, 0);
    const exportBlobDarkenAll = await exportCanvas.convertToBlob({ type: 'image/png' });
    const displayBlobDarkenAll = await displayCanvas.convertToBlob({ type: 'image/png' });

    // --- Mode 2: Contrast Edges ---
    const exportDataMode2 = new ImageData(new Uint8ClampedArray(exportImageData.data), exportWidth, exportHeight);
    const displayDataMode2 = new ImageData(new Uint8ClampedArray(displayImageData.data), displayWidth, displayHeight);
    applyEdgeContrastCPU(exportDataMode2, darknessFactor);
    applyEdgeContrastCPU(displayDataMode2, darknessFactor);
    exportCtx.putImageData(exportDataMode2, 0, 0);
    displayCtx.putImageData(displayDataMode2, 0, 0);
    const exportBlobContrastEdges = await exportCanvas.convertToBlob({ type: 'image/png' });
    const displayBlobContrastEdges = await displayCanvas.convertToBlob({ type: 'image/png' });

    // --- Mode 3: Contrast Full ---
    const exportDataMode3 = new ImageData(new Uint8ClampedArray(exportImageData.data), exportWidth, exportHeight);
    const displayDataMode3 = new ImageData(new Uint8ClampedArray(displayImageData.data), displayWidth, displayHeight);
    applyContrastFullCPU(exportDataMode3, darknessFactor);
    applyContrastFullCPU(displayDataMode3, darknessFactor);
    exportCtx.putImageData(exportDataMode3, 0, 0);
    displayCtx.putImageData(displayDataMode3, 0, 0);
    const exportBlobContrastFull = await exportCanvas.convertToBlob({ type: 'image/png' });
    const displayBlobContrastFull = await displayCanvas.convertToBlob({ type: 'image/png' });

    return {
        exportBlob,
        exportDpi,
        exportBleedWidth: bleedWidthMm,
        displayBlob,
        displayDpi,
        displayBleedWidth: bleedWidthMm,
        // Per-mode blobs
        exportBlobDarkenAll,
        displayBlobDarkenAll,
        exportBlobContrastEdges,
        displayBlobContrastEdges,
        exportBlobContrastFull,
        displayBlobContrastFull,
        // Legacy (maps to contrast-edges)
        exportBlobDarkened: exportBlobContrastEdges,
        displayBlobDarkened: displayBlobContrastEdges,
        // For Card Editor live preview
        baseDisplayBlob: displayBlob,
        baseExportBlob: exportBlob,
    };
}

/**
 * Extract a stable cache key from a URL.
 * - MPC URLs: use the Google Drive id parameter (e.g., "mpc:abc123")
 * - Scryfall URLs: use the path without query params (e.g., "scry:/front/a/b/12345.png")
 * - Other URLs: use as-is
 */
function getCacheKey(url: string): string {
    try {
        const parsed = new URL(url);

        // MPC Google Drive URLs: /api/cards/images/mpc?id=...
        if (parsed.pathname.includes('/api/cards/images/mpc')) {
            const id = parsed.searchParams.get('id');
            if (id) return `mpc:${id}`;
        }

        // Scryfall URLs: use path (stable across hosts)
        if (parsed.hostname.includes('scryfall.io') || parsed.hostname.includes('scryfall.com')) {
            return `scry:${parsed.pathname}`;
        }

        // Proxy URLs: extract the original URL from the query param
        if (parsed.pathname.includes('/api/cards/images/proxy')) {
            const originalUrl = parsed.searchParams.get('url');
            if (originalUrl) return getCacheKey(originalUrl); // Recursive call to normalize
        }

        // Default: use the full URL
        return url;
    } catch {
        // If URL parsing fails, use as-is
        return url;
    }
}


self.onmessage = async (e: MessageEvent) => {
    const {
        uuid,
        url,
        bleedEdgeWidth,
        unit,
        apiBase,
        hasBuiltInBleed,
        bleedMode,
        existingBleedMm,
        dpi,
    } = e.data;
    API_BASE = apiBase;

    if (typeof OffscreenCanvas === "undefined") {
        self.postMessage({ uuid, error: "OffscreenCanvas is not supported in this environment." });
        return;
    }

    try {
        const proxiedUrl = url.startsWith("http") ? toProxied(url, API_BASE) : url;
        // Use stable cache key for better hit rate across sessions and environments
        const cacheKey = getCacheKey(url.startsWith("http") ? url : proxiedUrl);

        let blob: Blob | undefined;
        let cacheHit = false;

        // 1. Check persistent IndexedDB cache first (for http URLs including MPC)
        if (url.startsWith("http") || url.includes("/api/cards/images/")) {
            try {
                const cached = await db.imageCache.get(cacheKey);
                if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
                    blob = cached.blob;
                    cacheHit = true;
                    // LRU: touch the timestamp
                    db.imageCache.update(cacheKey, { cachedAt: Date.now() }).catch(() => { });
                }
            } catch {
                // IndexedDB error - proceed without cache
            }
        }

        // 2. If not cached, check in-flight requests or fetch
        if (!cacheHit) {
            if (inflightRequests.has(proxiedUrl)) {
                blob = await inflightRequests.get(proxiedUrl)!;
            } else {
                const loadPromise = (async () => {
                    const response = await fetchWithRetry(proxiedUrl, 3, 250);
                    return await response.blob();
                })();
                inflightRequests.set(proxiedUrl, loadPromise);
                try {
                    blob = await loadPromise;

                    // 3. Store in persistent cache (for http URLs including MPC)
                    if (url.startsWith("http") || url.includes("/api/cards/images/")) {
                        try {
                            await db.imageCache.put({
                                url: cacheKey,
                                blob,
                                cachedAt: Date.now(),
                                size: blob.size,
                            });
                        } catch {
                            // IndexedDB error - proceed without caching
                        }
                    }
                } catch (fetchError) {
                    inflightRequests.delete(proxiedUrl);
                    throw fetchError;
                } finally {
                    // Clean up in-flight after a delay to handle concurrent requests
                    setTimeout(() => inflightRequests.delete(proxiedUrl), 1000);
                }
            }
        }

        // Helper function to trim bleed with user-specified amount (in mm)
        async function createTrimmedBitmapWithExistingBleed(inputBlob: Blob, existingMm: number): Promise<ImageBitmap> {
            const tempBitmap = await createImageBitmap(inputBlob);
            // Standard MTG card is ~63x88mm, calculate pixel ratio
            const cardHeightMm = 88;
            const pxPerMm = tempBitmap.height / (cardHeightMm + existingMm * 2);
            const trim = Math.round(existingMm * pxPerMm);
            const w = tempBitmap.width - trim * 2;
            const h = tempBitmap.height - trim * 2;
            tempBitmap.close();

            return w > 0 && h > 0
                ? await createImageBitmap(inputBlob, trim, trim, w, h)
                : await createImageBitmap(inputBlob);
        }

        // Helper function to trim MPC bleed from Blob (calibrated for MPC images)
        async function createTrimmedBitmap(inputBlob: Blob): Promise<ImageBitmap> {
            // Get dimensions to calculate trim amount
            const tempBitmap = await createImageBitmap(inputBlob);
            const trim = calibratedBleedTrimPxForHeight(tempBitmap.height);
            const w = tempBitmap.width - trim * 2;
            const h = tempBitmap.height - trim * 2;
            tempBitmap.close();

            // Create cropped bitmap from Blob for Firefox compatibility
            // (Firefox handles createImageBitmap(Blob, ...) correctly but not createImageBitmap(ImageBitmap, ...))
            return w > 0 && h > 0
                ? await createImageBitmap(inputBlob, trim, trim, w, h)
                : await createImageBitmap(inputBlob);
        }

        // blob is guaranteed to be set at this point by the control flow above


        // Determine how to handle the image based on bleed mode
        let imageBitmap: ImageBitmap;

        if (bleedMode === 'existing') {
            // Use existing bleed as-is - no trimming needed
            // The image already has bleed, so just decode it directly
            imageBitmap = await createImageBitmap(blob!);
        } else if (bleedMode === 'none') {
            // No bleed processing - use image as-is (for cards without bleed)
            imageBitmap = await createImageBitmap(blob!);
        } else if (bleedMode === 'generate') {
            // Smart bleed handling for images with existing bleed
            if (hasBuiltInBleed && existingBleedMm !== undefined && existingBleedMm > 0) {
                // Convert target bleed to mm for comparison
                const targetBleedMm = unit === 'in' ? bleedEdgeWidth * 25.4 : bleedEdgeWidth;

                if (targetBleedMm <= existingBleedMm) {
                    // Target is less than or equal to existing - just trim to target, no generation needed
                    // Trim from existingBleedMm down to targetBleedMm
                    const trimAmount = existingBleedMm - targetBleedMm;
                    if (trimAmount > 0.01) { // Only trim if meaningful difference
                        imageBitmap = await createTrimmedBitmapWithExistingBleed(blob!, trimAmount);
                    } else {
                        // Existing bleed matches target exactly
                        imageBitmap = await createImageBitmap(blob!);
                    }
                    // Use 'existing' mode for rendering since we're using the built in bleed (trimmed or not)
                    // The result will have exactly targetBleedMm of bleed
                    const result = await resizeWithoutBleed(imageBitmap, targetBleedMm, {
                        unit: 'mm',
                        exportDpi: dpi,
                        displayDpi: 300,
                    });
                    imageBitmap.close();
                    self.postMessage({ uuid, imageCacheHit: cacheHit, ...result });
                    return; // Early return - no generation needed
                } else {
                    // Target is more than existing - keep existing bleed and generate only the additional amount
                    // Don't trim - the processCardImageWebGL will handle extending the bleed
                    imageBitmap = await createImageBitmap(blob!);
                }
            } else if (hasBuiltInBleed) {
                // hasBuiltInBleed but no existingBleedMm specified - use calibrated MPC bleed trim
                imageBitmap = await createTrimmedBitmap(blob!);
            } else {
                // No existing bleed to work with
                imageBitmap = await createImageBitmap(blob!);
            }
        } else if (hasBuiltInBleed) {
            // Legacy fallback for undefined bleedMode with built in bleed - use calibrated trim
            imageBitmap = await createTrimmedBitmap(blob!);
        } else {
            // Default: no trimming, will generate bleed
            imageBitmap = await createImageBitmap(blob!);
        }

        let result;

        if (bleedMode === 'existing') {
            // For existing mode, use existingBleedMm (the bleed already in the image)
            // This determines the card+bleed dimensions and cut guide placement
            const existingBleed = existingBleedMm ?? 3.175; // Default to 1/8 inch if not specified
            result = await resizeWithoutBleed(imageBitmap, existingBleed, {
                unit: 'mm', // existingBleedMm is always in mm
                exportDpi: dpi,
                displayDpi: 300,
            });
        } else if (bleedMode === 'none') {
            // For 'none' mode, resize to card size without any bleed
            result = await resizeWithoutBleed(imageBitmap, 0, {
                unit: 'mm',
                exportDpi: dpi,
                displayDpi: 300,
            });
        } else {
            // For generate mode (and legacy), run WebGL bleed processing
            // If the image has built in bleed, tell the processor so it only generates additional bleed
            result = await processCardImageWebGL(imageBitmap, bleedEdgeWidth, {
                unit,
                exportDpi: dpi,
                displayDpi: 300,
                inputHasBleedMm: (hasBuiltInBleed && existingBleedMm) ? existingBleedMm : undefined,
            });
        }

        imageBitmap.close();

        self.postMessage({ uuid, imageCacheHit: cacheHit, ...result });
    } catch (error: unknown) {
        if (error instanceof Error) {
            self.postMessage({ uuid, error: error.message });
        } else {
            self.postMessage({
                uuid,
                error: "An unknown error occurred in the bleed worker.",
            });
        }
    }
};
