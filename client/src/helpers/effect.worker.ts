/**
 * Effect Pre-rendering Worker
 * 
 * Runs WebGL rendering in a separate thread to avoid blocking the UI.
 * Used by EffectProcessor to process card effects in the background.
 * 
 * Imports shared utilities from cardCanvasWorker.ts to avoid duplication.
 */

import type { RenderParams } from '../components/CardCanvas/types';
import { renderCardWithOverridesWorker } from './cardCanvasWorker';

// --- Message types ---
interface EffectWorkerMessage {
    taskId: string;
    imageData: ArrayBuffer;  // Transferred from main thread
    imageWidth: number;
    imageHeight: number;
    params: RenderParams;
}

interface EffectWorkerSuccessResponse {
    taskId: string;
    blob: Blob;
    error?: undefined;
}

interface EffectWorkerErrorResponse {
    taskId: string;
    error: string;
}

// --- Worker message handler ---
self.onmessage = async (event: MessageEvent<EffectWorkerMessage>) => {
    const { taskId, imageData, imageWidth, imageHeight, params } = event.data;

    let imageBitmap: ImageBitmap | undefined;

    try {
        // Create ImageData from the buffer
        const clampedArray = new Uint8ClampedArray(imageData);
        const imgData = new ImageData(clampedArray, imageWidth, imageHeight);

        // Create ImageBitmap from ImageData
        imageBitmap = await createImageBitmap(imgData);

        const blob = await renderCardWithOverridesWorker(imageBitmap, params);
        const response: EffectWorkerSuccessResponse = { taskId, blob };
        self.postMessage(response);
    } catch (error) {
        const response: EffectWorkerErrorResponse = {
            taskId,
            error: error instanceof Error ? error.message : String(error),
        };
        self.postMessage(response);
    } finally {
        if (imageBitmap) {
            imageBitmap.close();
        }
    }
};
