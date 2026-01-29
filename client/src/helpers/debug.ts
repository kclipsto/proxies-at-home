/**
 * Debug logging utilities for client.
 * DEBUG is automatically true during `npm run dev` (Vite dev server).
 */

export const DEBUG = import.meta.env.DEV;

/**
 * Log only in development mode. Use for verbose debugging output.
 * Errors and warnings should use console.error/console.warn directly.
 *
 * We use console.log.bind so the browser console attributes the log
 * to the caller's line number, but inject a dynamic timestamp via
 * a custom object's toString method.
 */
export const debugLog: (...args: unknown[]) => void = DEBUG
    ? console.log.bind(console, "%s", { toString: () => new Date().toISOString() })
    : () => { };