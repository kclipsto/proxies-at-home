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
    const startTime = performance.now();
    const {
        uuid,
        url,
        bleedEdgeWidth,
        unit,
        apiBase,
        isUserUpload,
        hasBakedBleed,
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
        const fetchStart = performance.now();
        if (url.startsWith("http") || url.includes("/api/cards/images/")) {
            try {
                const cached = await db.imageCache.get(cacheKey);
                if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
                    blob = cached.blob;
                    cacheHit = true;
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
        const fetchTime = performance.now();

        // Helper function to trim MPC bleed from Blob
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
        const decodeStart = performance.now();
        const imageBitmap = isUserUpload && hasBakedBleed
            ? await createTrimmedBitmap(blob!)
            : await createImageBitmap(blob!);
        const decodeTime = performance.now();

        const processStart = performance.now();
        const result = await processCardImageWebGL(imageBitmap, bleedEdgeWidth, {
            unit,
            exportDpi: dpi,
            displayDpi: 300,
        });
        const processTime = performance.now();

        imageBitmap.close();

        const totalTime = performance.now();
        console.log(`[Worker] Image processing: fetch=${(fetchTime - fetchStart).toFixed(1)}ms, decode=${(decodeTime - decodeStart).toFixed(1)}ms, process=${(processTime - processStart).toFixed(1)}ms, total=${(totalTime - startTime).toFixed(1)}ms`);

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
