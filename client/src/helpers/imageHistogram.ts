/**
 * Image histogram utilities for calculating image brightness characteristics.
 * Used to auto-detect optimal darknessFactor for the darken effect.
 */

/**
 * Calculate the darkness factor from an image blob using luminance histogram analysis.
 * 
 * Algorithm:
 * 1. Build luminance histogram (sampled every 4th pixel for speed)
 * 2. Find 10th percentile luminance (p10)
 * 3. darknessFactor = clamp((90 - p10) / 70, 0, 1)
 * 
 * Dark images (low p10) → higher factor → stronger darken effect
 * Light images (high p10) → lower factor → weaker darken effect
 * 
 * @param blob - The image blob to analyze
 * @returns Promise resolving to darknessFactor (0-1)
 */
export async function calculateDarknessFactorFromBlob(blob: Blob): Promise<number> {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);

        img.onload = () => {
            try {
                // Use OffscreenCanvas if available, otherwise regular Canvas
                const canvas = typeof OffscreenCanvas !== 'undefined'
                    ? new OffscreenCanvas(img.width, img.height)
                    : document.createElement('canvas');

                if (!(canvas instanceof OffscreenCanvas)) {
                    canvas.width = img.width;
                    canvas.height = img.height;
                }

                const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
                if (!ctx) {
                    console.warn('[imageHistogram] Could not get canvas context, using default');
                    resolve(0.5);
                    return;
                }

                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, img.width, img.height);
                const d = imageData.data;

                // Build luminance histogram (sampled every 4th pixel for speed)
                const hist = new Uint32Array(256);
                const sampleStep = 4 * 4; // every 4th pixel (4 bytes per pixel)

                for (let i = 0; i < d.length; i += sampleStep) {
                    // Standard luminance formula
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

                // Calculate darkness factor
                // Dark images (low p10) → higher factor
                // Light images (high p10) → lower factor
                const darknessFactor = Math.min(1, Math.max(0, (90 - p10) / 70));

                resolve(darknessFactor);
            } catch (err) {
                console.error('[imageHistogram] Error calculating darkness factor:', err);
                resolve(0.5); // Default fallback
            } finally {
                URL.revokeObjectURL(url);
            }
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            console.warn('[imageHistogram] Failed to load image, using default');
            resolve(0.5);
        };

        img.src = url;
    });
}
