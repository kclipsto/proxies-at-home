import { fetchWithRetry, toProxied, calibratedBleedTrimPxForHeight } from "./imageProcessing";
import { processCardImageWebGL } from "./webglImageProcessing";

export { };
declare const self: DedicatedWorkerGlobalScope;

let API_BASE = "";

const imageCache = new Map<string, Promise<Blob>>();

self.onmessage = async (e: MessageEvent) => {
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

        let blob: Blob;

        if (imageCache.has(proxiedUrl)) {
            blob = await imageCache.get(proxiedUrl)!;
        } else {
            const loadPromise = (async () => {
                const response = await fetchWithRetry(proxiedUrl, 3, 250);
                return await response.blob();
            })();
            imageCache.set(proxiedUrl, loadPromise);
            try {
                blob = await loadPromise;
            } catch (e) {
                imageCache.delete(proxiedUrl);
                throw e;
            }
        }

        // Helper function to trim MPC bleed from Blob
        async function createTrimmedBitmap(blob: Blob): Promise<ImageBitmap> {
            // Get dimensions to calculate trim amount
            const tempBitmap = await createImageBitmap(blob);
            const trim = calibratedBleedTrimPxForHeight(tempBitmap.height);
            const w = tempBitmap.width - trim * 2;
            const h = tempBitmap.height - trim * 2;
            tempBitmap.close();

            // Create cropped bitmap from Blob for Firefox compatibility
            // (Firefox handles createImageBitmap(Blob, ...) correctly but not createImageBitmap(ImageBitmap, ...))
            return w > 0 && h > 0
                ? await createImageBitmap(blob, trim, trim, w, h)
                : await createImageBitmap(blob);
        }

        const imageBitmap = isUserUpload && hasBakedBleed
            ? await createTrimmedBitmap(blob)
            : await createImageBitmap(blob);

        const result = await processCardImageWebGL(imageBitmap, bleedEdgeWidth, {
            unit,
            exportDpi: dpi,
            displayDpi: 300,
        });

        imageBitmap.close();
        self.postMessage({ uuid, ...result });
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
