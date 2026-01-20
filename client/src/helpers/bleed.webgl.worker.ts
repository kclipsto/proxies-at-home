import {
    fetchWithRetry,
    toProxied,
    calibratedBleedTrimPxForHeight,
} from "./imageProcessing";
import { IMAGE_PROCESSING } from "../constants/imageProcessing";
import { processCardImageWebGL, processExistingBleedWebGL } from "./webglImageProcessing";
import { db } from "../db";

export { };
declare const self: DedicatedWorkerGlobalScope;

let API_BASE = "";

// Cache TTL: 7 days
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// In-flight requests map to prevent duplicate fetches within a session
// Uses reference counting to clean up when all waiters are done
const inflightRequests = new Map<string, { promise: Promise<Blob>; waiters: number }>();

// Note: DarkenMode type removed - all modes are now pre-generated

/**
 * Extract a stable cache key from a URL.
 * - MPC URLs: use the Google Drive id parameter (e.g., "mpc:abc123")
 * - Scryfall URLs: use the path without query params (e.g., "scry:/front/a/b/12345.png")
 * - Other URLs: use as-is
 */
/**
 * Extract a stable cache key from a URL.
 * - MPC URLs: use the Google Drive id parameter (e.g., "mpc:abc123")
 * - Scryfall URLs: use the path without query params (e.g., "scry:/front/a/b/12345.png")
 * - Other URLs: use as-is
 */
function getCacheKey(url: string, dpi: number, bleedMm: number): string {
    let baseKey = url;
    try {
        const parsed = new URL(url);

        // MPC Google Drive URLs: /api/cards/images/mpc?id=...
        if (parsed.pathname.includes('/api/cards/images/mpc')) {
            const id = parsed.searchParams.get('id');
            if (id) baseKey = `mpc:${id}`;
        }
        // Scryfall URLs: use path (stable across hosts)
        else if (parsed.hostname.includes('scryfall.io') || parsed.hostname.includes('scryfall.com')) {
            baseKey = `scry:${parsed.pathname}`;
        }
        // Proxy URLs: extract the original URL from the query param
        else if (parsed.pathname.includes('/api/cards/images/proxy')) {
            const originalUrl = parsed.searchParams.get('url');
            if (originalUrl) return getCacheKey(originalUrl, dpi, bleedMm); // Recursive call
        }

        // Add DPI and bleed settings to key to invalidate cache when settings change
        return `${baseKey}:${dpi}:${bleedMm.toFixed(2)}`;
    } catch {
        // If URL parsing fails, use as-is but still append settings
        return `${url}:${dpi}:${bleedMm.toFixed(2)}`;
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
        displayDpi: msgDisplayDpi, // Optional display DPI from message
        darkenMode, // 0=none, 1=darken-all, 2=contrast-edges, 3=contrast-full
    } = e.data;
    API_BASE = apiBase;

    const effectiveDisplayDpi = msgDisplayDpi ?? 300; // Default to 300 if not provided

    if (typeof OffscreenCanvas === "undefined") {
        self.postMessage({ uuid, error: "OffscreenCanvas is not supported in this environment." });
        return;
    }

    try {
        const proxiedUrl = url.startsWith("http") ? toProxied(url, API_BASE) : url;
        // Use stable cache key for better hit rate across sessions and environments
        // Only use sophisticated cache key for http URLs, otherwise use url as base
        const cacheKey = getCacheKey(url.startsWith("http") ? url : proxiedUrl, dpi, bleedEdgeWidth);

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
            const existingRequest = inflightRequests.get(proxiedUrl);
            if (existingRequest) {
                // Join existing request
                existingRequest.waiters++;
                try {
                    blob = await existingRequest.promise;
                } finally {
                    existingRequest.waiters--;
                    if (existingRequest.waiters === 0) {
                        inflightRequests.delete(proxiedUrl);
                    }
                }
            } else {
                // Start new request
                const loadPromise = (async () => {
                    const response = await fetchWithRetry(proxiedUrl, 3, 250);
                    return await response.blob();
                })();
                const entry = { promise: loadPromise, waiters: 1 };
                inflightRequests.set(proxiedUrl, entry);
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
                    // Clean up when all waiters are done
                    entry.waiters--;
                    if (entry.waiters === 0) {
                        inflightRequests.delete(proxiedUrl);
                    }
                }
            }
        }

        // Helper function to trim bleed with user-specified amount (in mm)
        async function createTrimmedBitmapWithExistingBleed(inputBlob: Blob, existingMm: number): Promise<ImageBitmap> {
            const tempBitmap = await createImageBitmap(inputBlob);
            // Standard MTG card is ~63x88mm, calculate pixel ratio
            const pxPerMm = tempBitmap.height / (IMAGE_PROCESSING.CARD_HEIGHT_MM + existingMm * 2);
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
                    if (trimAmount > IMAGE_PROCESSING.BLEED_TRIM_EPSILON_MM) { // Only trim if meaningful difference
                        imageBitmap = await createTrimmedBitmapWithExistingBleed(blob!, trimAmount);
                    } else {
                        // Existing bleed matches target exactly
                        imageBitmap = await createImageBitmap(blob!);
                    }
                    // Use 'existing' mode for rendering since we're using the built in bleed (trimmed or not)
                    // The result will have exactly targetBleedMm of bleed
                    const result = await processExistingBleedWebGL(imageBitmap, targetBleedMm, {
                        unit: 'mm',
                        exportDpi: dpi,
                        displayDpi: effectiveDisplayDpi,
                        darkenMode,
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
            const existingBleed = existingBleedMm ?? IMAGE_PROCESSING.DEFAULT_MPC_BLEED_MM; // Default to 1/8 inch if not specified
            result = await processExistingBleedWebGL(imageBitmap, existingBleed, {
                unit: 'mm', // existingBleedMm is always in mm
                exportDpi: dpi,
                displayDpi: effectiveDisplayDpi,
                darkenMode,
            });
        } else if (bleedMode === 'none') {
            // For 'none' mode, resize to card size without any bleed
            result = await processExistingBleedWebGL(imageBitmap, 0, {
                unit: 'mm',
                exportDpi: dpi,
                displayDpi: effectiveDisplayDpi,
                darkenMode,
            });
        } else {
            // For generate mode (and legacy), run WebGL bleed processing
            // If the image has built in bleed, tell the processor so it only generates additional bleed
            result = await processCardImageWebGL(imageBitmap, bleedEdgeWidth, {
                unit,
                exportDpi: dpi,
                displayDpi: effectiveDisplayDpi,
                inputHasBleedMm: (hasBuiltInBleed && existingBleedMm) ? existingBleedMm : undefined,
                darkenMode,
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
