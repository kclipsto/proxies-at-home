/**
 * Debug logging utilities for client.
 * DEBUG is automatically true during `npm run dev` (Vite dev server).
 */

export const DEBUG = import.meta.env.DEV;

/**
 * Log only in development mode. Use for verbose debugging output.
 * Errors and warnings should use console.error/console.warn directly.
 */
export function debugLog(...args: unknown[]): void {
    if (DEBUG) {
        console.log(...args);
    }
}
