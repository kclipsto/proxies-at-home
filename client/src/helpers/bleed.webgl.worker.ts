import {
    fetchWithRetry,
    toProxied,
    shouldTrimBleed,
    trimBleedByMm,
} from "./imageProcessing";
import { STANDARD_ASPECT_RATIO, detectBleed } from "./cardDimensions";
import { IMAGE_PROCESSING } from "../constants/imageProcessing";
import { processCardImageWebGL, processExistingBleedWebGL } from "./webglImageProcessing";
import { db } from "../db";
import { debugLog } from "./debug";

export { };
declare const self: DedicatedWorkerGlobalScope;

let API_BASE = "";

// Cache TTL: 7 days
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// In-flight requests map to prevent duplicate fetches within a session
// Uses reference counting to clean up when all waiters are done
const inflightRequests = new Map<string, { promise: Promise<Blob>; waiters: number }>();

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
            if (id) baseKey = `mpc:${id} `;
        }
        // Scryfall URLs: use path (stable across hosts)
        else if (parsed.hostname.includes('scryfall.io') || parsed.hostname.includes('scryfall.com')) {
            baseKey = `scry:${parsed.pathname} `;
        }
        // Proxy URLs: extract the original URL from the query param
        else if (parsed.pathname.includes('/api/cards/images/proxy')) {
            const originalUrl = parsed.searchParams.get('url');
            if (originalUrl) return getCacheKey(originalUrl, dpi, bleedMm); // Recursive call
        }

        // Add DPI and bleed settings to key to invalidate cache when settings change
        return `${baseKey}:${dpi}:${bleedMm.toFixed(2)} `;
    } catch {
        // If URL parsing fails, use as-is but still append settings
        return `${url}:${dpi}:${bleedMm.toFixed(2)} `;
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
            return trimBleedByMm(inputBlob, existingMm, existingMm);
        }

        // Determine how to handle the image based on bleed mode
        // 1. Create initial bitmap to check dimensions/process
        let imageBitmap = await createImageBitmap(blob!);

        // 2. Auto-Detect Built-in Bleed if unknown
        let effectiveHasBleed = hasBuiltInBleed;
        if (effectiveHasBleed === undefined) {
            const hasBleed = detectBleed(imageBitmap.width, imageBitmap.height, 0.015);
            const aspect = imageBitmap.width / imageBitmap.height;
            debugLog(`[Worker] Auto-Detect: ${imageBitmap.width}x${imageBitmap.height} Aspect=${aspect.toFixed(4)} Diff=${Math.abs(aspect - STANDARD_ASPECT_RATIO).toFixed(4)} Tol=0.015 hasBleed=${hasBleed}`);
            effectiveHasBleed = hasBleed;
        }
        let result;

        // 3. Handle Bleed Modes
        if (bleedMode === 'existing') {
            // Use existing bleed as-is
            const existingBleed = existingBleedMm ?? IMAGE_PROCESSING.DEFAULT_MPC_BLEED_MM;
            result = await processExistingBleedWebGL(imageBitmap, existingBleed, {
                unit: 'mm',
                exportDpi: dpi,
                displayDpi: effectiveDisplayDpi,
                darkenMode,
            });

        } else if (bleedMode === 'none') {
            // Strip any bleed (render at 0 bleed)
            result = await processExistingBleedWebGL(imageBitmap, 0, {
                unit: 'mm',
                exportDpi: dpi,
                displayDpi: effectiveDisplayDpi,
                darkenMode,
            });

        } else {
            // 'generate' mode (Default)
            // If image has bleed (known or detected), try to use it (Fast Path)
            // Otherwise, generate new bleed (JFA)
            if (effectiveHasBleed) {
                const assumedExistingBleedMm = (existingBleedMm && existingBleedMm > 0)
                    ? existingBleedMm
                    : IMAGE_PROCESSING.DEFAULT_MPC_BLEED_MM;

                const targetBleedMm = unit === 'in' ? bleedEdgeWidth * 25.4 : bleedEdgeWidth;
                debugLog(`[Worker] Routing: Target=${targetBleedMm.toFixed(3)}mm Existing=${assumedExistingBleedMm.toFixed(3)}mm ShouldTrim=${shouldTrimBleed(targetBleedMm, assumedExistingBleedMm)}`);

                if (shouldTrimBleed(targetBleedMm, assumedExistingBleedMm)) {
                    const trimAmount = assumedExistingBleedMm - targetBleedMm;
                    imageBitmap.close();

                    if (trimAmount > IMAGE_PROCESSING.BLEED_TRIM_EPSILON_MM) {
                        imageBitmap = await createTrimmedBitmapWithExistingBleed(blob!, trimAmount);
                    } else {
                        imageBitmap = await createImageBitmap(blob!);
                    }

                    result = await processExistingBleedWebGL(imageBitmap, targetBleedMm, {
                        unit: 'mm',
                        exportDpi: dpi,
                        displayDpi: effectiveDisplayDpi,
                        darkenMode,
                    });

                    // Tag result with detection status
                    if (hasBuiltInBleed === undefined) {
                        result.detectedHasBuiltInBleed = true;
                    }

                } else {
                    // Target > Existing: Extend bleed using JFA
                    result = await processCardImageWebGL(imageBitmap, bleedEdgeWidth, {
                        unit,
                        exportDpi: dpi,
                        displayDpi: effectiveDisplayDpi,
                        inputHasBleedMm: assumedExistingBleedMm,
                        darkenMode,
                    });

                    if (hasBuiltInBleed === undefined) {
                        result.detectedHasBuiltInBleed = true;
                    }
                }
            } else {
                // No Bleed: Generate from scratch using JFA
                result = await processCardImageWebGL(imageBitmap, bleedEdgeWidth, {
                    unit,
                    exportDpi: dpi,
                    displayDpi: effectiveDisplayDpi,
                    inputHasBleedMm: undefined,
                    darkenMode,
                });

                if (hasBuiltInBleed === undefined) {
                    result.detectedHasBuiltInBleed = false;
                }
            }
        }

        imageBitmap.close();
        // Explicitly include darknessFactor in the response (it's in the result object due to spread, but good to be aware)
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
