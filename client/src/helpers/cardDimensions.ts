/**
 * Standard MTG card dimensions in millimeters.
 * Source: https://en.wikipedia.org/wiki/Standard_card_size
 */
export const CARD_WIDTH_MM = 63;
export const CARD_HEIGHT_MM = 88;

/**
 * Standard aspect ratio (Width / Height)
 * ~0.7159
 */
export const STANDARD_ASPECT_RATIO = CARD_WIDTH_MM / CARD_HEIGHT_MM;

/**
 * MPC-ready aspect ratio (with 1/8" bleed)
 * 63mm + 2*3.175mm / 88mm + 2*3.175mm = 69.35 / 94.35 ≈ 0.7350
 */
export const MPC_ASPECT_RATIO = (CARD_WIDTH_MM + 6.35) / (CARD_HEIGHT_MM + 6.35);


/**
 * Detects if an image likely has built-in bleed based on its aspect ratio.
 * @param width Image width in pixels
 * @param height Image height in pixels
 * @param tolerance Tolerance for aspect ratio comparison (default 0.015)
 * @returns true if the image is detected to have bleed (non-standard ratio)
 */
export function detectBleed(width: number, height: number, tolerance?: number): boolean {
    if (!width || !height) return false;

    const minDim = Math.min(width, height);
    const maxDim = Math.max(width, height);
    const aspect = minDim / maxDim;

    const deviation = Math.abs(aspect - STANDARD_ASPECT_RATIO);
    return deviation >= (tolerance ?? 0.015);
}
