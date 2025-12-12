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
    exportBlobDarkened: Blob;
    displayBlobDarkened: Blob;
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
    const exportCtx = exportCanvas.getContext('2d')!;
    exportCtx.imageSmoothingQuality = 'high';
    exportCtx.drawImage(img, 0, 0, exportWidth, exportHeight);

    // Create display canvas
    const displayCanvas = new OffscreenCanvas(displayWidth, displayHeight);
    const displayCtx = displayCanvas.getContext('2d')!;
    displayCtx.imageSmoothingQuality = 'high';
    displayCtx.drawImage(img, 0, 0, displayWidth, displayHeight);

    // Convert to blobs
    const exportBlob = await exportCanvas.convertToBlob({ type: 'image/png' });
    const displayBlob = await displayCanvas.convertToBlob({ type: 'image/png' });

    // For existing bleed, we don't darken - use the same blobs
    return {
        exportBlob,
        exportDpi,
        exportBleedWidth: bleedWidthMm, // Report the correct bleed width for cut guides
        displayBlob,
        displayDpi,
        displayBleedWidth: bleedWidthMm,
        exportBlobDarkened: exportBlob,
        displayBlobDarkened: displayBlob,
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
