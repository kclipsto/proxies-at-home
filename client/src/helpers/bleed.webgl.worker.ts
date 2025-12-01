import {
    toProxied,
    trimBleedFromBitmap,
    fetchWithRetry,
} from "./imageProcessing";
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

        let imageBitmap = await createImageBitmap(blob);

        if (isUserUpload && hasBakedBleed) {
            const trimmed = await trimBleedFromBitmap(imageBitmap);
            if (trimmed !== imageBitmap) {
                imageBitmap.close();
                imageBitmap = trimmed;
            }
        }

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
