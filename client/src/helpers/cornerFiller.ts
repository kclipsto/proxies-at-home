/**
 * Corner Filler - Fills transparent corners of card images with border colors
 * 
 * This is a TypeScript port of the Python fill_corners.py script.
 * It detects and fills transparent corners with colors sampled from nearby opaque pixels.
 */

const CORNER_RADIUS = 40;
const BORDER_WIDTH = 5;  // Width of border to normalize
const TRANSPARENT_THRESHOLD = 250;  // pixels with alpha <= this are considered transparent

/**
 * Check if an image has transparent pixels (indicating it needs corner filling)
 */
export function hasTransparentPixels(imageData: ImageData): boolean {
    const data = imageData.data;
    for (let i = 3; i < data.length; i += 4) {  // Check every alpha channel
        if (data[i] < 255) {
            return true;
        }
    }
    return false;
}

/**
 * Count transparent pixels in an image
 */
function countTransparentPixels(imageData: ImageData): number {
    const data = imageData.data;
    let count = 0;
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] < TRANSPARENT_THRESHOLD) {
            count++;
        }
    }
    return count;
}

/**
 * Find the nearest opaque pixel's color using a spiral search pattern
 */
function findNearestOpaqueColor(
    imageData: ImageData,
    x: number,
    y: number,
    maxDistance: number = 50,
    skipBorder: number = 0
): [number, number, number] | null {
    const { data, width, height } = imageData;

    // Search in expanding squares
    for (let d = 1; d < maxDistance; d++) {
        const candidates: Array<[number, [number, number, number]]> = [];

        // Check pixels at distance d (perimeter of square)
        for (let dx = -d; dx <= d; dx++) {
            for (let dy = -d; dy <= d; dy++) {
                // Only check the perimeter
                if (Math.abs(dx) !== d && Math.abs(dy) !== d) continue;

                const nx = x + dx;
                const ny = y + dy;

                if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

                // Skip pixels too close to the edge
                if (skipBorder > 0) {
                    if (nx < skipBorder || nx >= width - skipBorder) continue;
                    if (ny < skipBorder || ny >= height - skipBorder) continue;
                }

                // Check if pixel is fully opaque
                const pixelIndex = (ny * width + nx) * 4;
                if (data[pixelIndex + 3] === 255) {
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const color: [number, number, number] = [
                        data[pixelIndex],
                        data[pixelIndex + 1],
                        data[pixelIndex + 2]
                    ];
                    candidates.push([dist, color]);
                }
            }
        }

        if (candidates.length > 0) {
            // Return the color of the closest opaque pixel
            candidates.sort((a, b) => a[0] - b[0]);
            return candidates[0][1];
        }
    }

    return null;
}

/**
 * Fill a transparent corner with colors sampled from nearby opaque pixels
 */
function fillCornerWithGradient(
    imageData: ImageData,
    corner: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right',
    radius: number = 35
): void {
    const { data, width, height } = imageData;

    let yStart: number, yEnd: number, xStart: number, xEnd: number;

    if (corner === 'top_left') {
        yStart = 0; yEnd = radius;
        xStart = 0; xEnd = radius;
    } else if (corner === 'top_right') {
        yStart = 0; yEnd = radius;
        xStart = width - radius; xEnd = width;
    } else if (corner === 'bottom_left') {
        yStart = height - radius; yEnd = height;
        xStart = 0; xEnd = radius;
    } else {  // bottom_right
        yStart = height - radius; yEnd = height;
        xStart = width - radius; xEnd = width;
    }

    // For each potentially transparent pixel in the corner, fill it
    for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
            const pixelIndex = (y * width + x) * 4;

            // Check if pixel is transparent or semi-transparent
            if (data[pixelIndex + 3] < 255) {
                const color = findNearestOpaqueColor(imageData, x, y, radius * 2, BORDER_WIDTH);
                if (color) {
                    data[pixelIndex] = color[0];
                    data[pixelIndex + 1] = color[1];
                    data[pixelIndex + 2] = color[2];
                    data[pixelIndex + 3] = 255;  // Make fully opaque
                }
            }
        }
    }
}

/**
 * Normalize the outer border pixels by extending colors from just inside the border.
 * This fixes any 1-pixel artifacts at the edges.
 */
function normalizeBorder(imageData: ImageData, borderWidth: number = BORDER_WIDTH): void {
    const { data, width, height } = imageData;

    // Top edge - extend the full width, sample from row at borderWidth
    for (let x = 0; x < width; x++) {
        const refX = Math.max(borderWidth, Math.min(x, width - borderWidth - 1));
        const refIndex = (borderWidth * width + refX) * 4;
        const [r, g, b] = [data[refIndex], data[refIndex + 1], data[refIndex + 2]];

        for (let y = 0; y < borderWidth; y++) {
            const pixelIndex = (y * width + x) * 4;
            data[pixelIndex] = r;
            data[pixelIndex + 1] = g;
            data[pixelIndex + 2] = b;
            data[pixelIndex + 3] = 255;
        }
    }

    // Bottom edge - extend the full width
    for (let x = 0; x < width; x++) {
        const refX = Math.max(borderWidth, Math.min(x, width - borderWidth - 1));
        const refIndex = ((height - borderWidth - 1) * width + refX) * 4;
        const [r, g, b] = [data[refIndex], data[refIndex + 1], data[refIndex + 2]];

        for (let y = height - borderWidth; y < height; y++) {
            const pixelIndex = (y * width + x) * 4;
            data[pixelIndex] = r;
            data[pixelIndex + 1] = g;
            data[pixelIndex + 2] = b;
            data[pixelIndex + 3] = 255;
        }
    }

    // Left edge - sample from column at borderWidth (excluding corners already done)
    for (let y = borderWidth; y < height - borderWidth; y++) {
        const refIndex = (y * width + borderWidth) * 4;
        const [r, g, b] = [data[refIndex], data[refIndex + 1], data[refIndex + 2]];

        for (let x = 0; x < borderWidth; x++) {
            const pixelIndex = (y * width + x) * 4;
            data[pixelIndex] = r;
            data[pixelIndex + 1] = g;
            data[pixelIndex + 2] = b;
            data[pixelIndex + 3] = 255;
        }
    }

    // Right edge - sample from column at width - borderWidth - 1
    for (let y = borderWidth; y < height - borderWidth; y++) {
        const refIndex = (y * width + (width - borderWidth - 1)) * 4;
        const [r, g, b] = [data[refIndex], data[refIndex + 1], data[refIndex + 2]];

        for (let x = width - borderWidth; x < width; x++) {
            const pixelIndex = (y * width + x) * 4;
            data[pixelIndex] = r;
            data[pixelIndex + 1] = g;
            data[pixelIndex + 2] = b;
            data[pixelIndex + 3] = 255;
        }
    }
}

/**
 * Advanced corner filling that samples from nearby opaque pixels
 * to smoothly continue the border pattern.
 */
function fillCornersAdvanced(imageData: ImageData, cornerRadius: number = CORNER_RADIUS): void {
    // Fill each corner
    fillCornerWithGradient(imageData, 'top_left', cornerRadius);
    fillCornerWithGradient(imageData, 'top_right', cornerRadius);
    fillCornerWithGradient(imageData, 'bottom_left', cornerRadius);
    fillCornerWithGradient(imageData, 'bottom_right', cornerRadius);

    // Normalize the border to fix any artifacts on all edges
    normalizeBorder(imageData, BORDER_WIDTH);
}

/**
 * Process an image blob to fill transparent corners
 * Returns the processed blob, or the original if no processing needed
 */
export async function fillTransparentCorners(blob: Blob): Promise<Blob> {
    // Only process if it's an image
    if (!blob.type.startsWith('image/')) {
        return blob;
    }

    try {
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            return blob;
        }

        // Draw image to canvas
        ctx.drawImage(bitmap, 0, 0);

        // Get image data
        const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

        // Check if image has transparency
        if (!hasTransparentPixels(imageData)) {
            bitmap.close();
            return blob;
        }

        const transparentCount = countTransparentPixels(imageData);

        // Only process if there's a reasonable amount of transparent pixels
        // (avoid processing images that are mostly transparent)
        const totalPixels = bitmap.width * bitmap.height;
        const transparentRatio = transparentCount / totalPixels;

        if (transparentRatio > 0.5) {
            // Too much transparency, don't process
            bitmap.close();
            return blob;
        }

        // Fill corners
        fillCornersAdvanced(imageData, CORNER_RADIUS);

        // Put processed image data back
        ctx.putImageData(imageData, 0, 0);

        // Convert canvas to blob
        const resultBlob = await canvas.convertToBlob({ type: blob.type });
        bitmap.close();

        return resultBlob;
    } catch (error) {
        console.warn('[CornerFiller] Error processing image:', error);
        return blob;  // Return original blob if processing fails
    }
}
