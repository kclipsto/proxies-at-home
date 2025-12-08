import { fetchWithRetry, toProxied, calibratedBleedTrimPxForHeight } from "./imageProcessing";
import { processCardImageWebGL } from "./webglImageProcessing";

export { };
declare const self: DedicatedWorkerGlobalScope;

let API_BASE = "";

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

        // Fetch image blob directly (no caching - DB and server handle deduplication)
        const fetchStart = performance.now();
        const response = await fetchWithRetry(proxiedUrl, 3, 250);
        const blob = await response.blob();
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

        const decodeStart = performance.now();
        const imageBitmap = isUserUpload && hasBakedBleed
            ? await createTrimmedBitmap(blob)
            : await createImageBitmap(blob);
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
