/**
 * Debug logging utilities for server.
 * DEBUG is automatically true when NODE_ENV=development (npm run dev).
 */

export const DEBUG = process.env.NODE_ENV === 'development';

/**
 * Log only in development mode. Use for verbose debugging output.
 * Errors and warnings should use console.error/console.warn directly.
 */
export function debugLog(...args: unknown[]): void {
    if (DEBUG) {
        console.log(...args);
    }
}
