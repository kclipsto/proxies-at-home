/**
 * Shared adjustment shader for both PixiJS AdjustmentFilter and PDF export worker.
 * 
 * This file contains the raw GLSL shader source without any framework dependencies,
 * so it can be safely imported by web workers.
 * 
 * The shader is exported for PixiJS use. For worker use, call getWorkerAdjustmentShader()
 * which adapts the variable names for standard WebGL2 usage.
 */

/**
 * Full adjustment fragment shader with all effects.
 * Uses PixiJS variable naming conventions.
 */
import ADJUSTMENT_FRAGMENT_RAW from './adjustment.frag?raw';
export const ADJUSTMENT_FRAGMENT = ADJUSTMENT_FRAGMENT_RAW;

/**
 * Get the adjustment shader adapted for WebGL2 worker usage.
 * Converts PixiJS variable/uniform names to standard WebGL2 names:
 * - vTextureCoord → v_texCoord
 * - finalColor → fragColor  
 * - uTexture → u_baseTexture
 * - uXxxYyy → u_xxxYyy (camelCase uniform names)
 */
export function getWorkerAdjustmentShader(pixiFragment: string): string {
    // First convert the main variable names
    let shader = pixiFragment
        .replace(/vTextureCoord/g, 'v_texCoord')
        .replace(/finalColor/g, 'fragColor')
        .replace(/uTexture/g, 'u_baseTexture');

    // Convert all uXxx uniform names to u_xxx format
    // Match uUppercase and convert to u_lowercase maintaining rest of name
    shader = shader.replace(/\bu([A-Z])([a-zA-Z0-9]*)/g, (_, firstChar, rest) => {
        return `u_${firstChar.toLowerCase()}${rest}`;
    });

    // Prepend #version 300 es for WebGL2 compatibility
    return '#version 300 es\n' + shader;
}
