import { getDatabase } from './db.js';
import { debugLog } from '../utils/debug.js';

/**
 * MPC Search Cache - Server-side caching for MPC Autofill search results.
 * Uses SQLite with hybrid TTL + LRU eviction strategy.
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_ENTRIES = 10000;

export interface MpcCard {
    identifier: string;
    name: string;
    smallThumbnailUrl: string;
    mediumThumbnailUrl: string;
    dpi: number;
    tags: string[];
    sourceName: string;
    source: string;
    extension: string;
    size: number;
}

interface CacheRow {
    query: string;
    card_type: string;
    results_json: string;
    cached_at: number;
}

/**
 * Get cached MPC search results if fresh (< 24h old).
 * Returns null if not cached or expired.
 */
export function getCachedMpcSearch(
    query: string,
    cardType: string
): MpcCard[] | null {
    try {
        const db = getDatabase();
        const normalizedQuery = query.toLowerCase().trim();
        const now = Date.now();
        const expiryTime = now - CACHE_TTL_MS;

        const stmt = db.prepare(`
            SELECT results_json, cached_at FROM mpc_search_cache
            WHERE query = ? AND card_type = ?
        `);

        const row = stmt.get(normalizedQuery, cardType) as CacheRow | undefined;

        if (!row) {
            return null;
        }

        // Check if expired
        if (row.cached_at < expiryTime) {
            // Delete expired entry
            db.prepare('DELETE FROM mpc_search_cache WHERE query = ? AND card_type = ?')
                .run(normalizedQuery, cardType);
            return null;
        }

        return JSON.parse(row.results_json) as MpcCard[];
    } catch (error) {
        console.warn('[MPC Cache] Failed to get cached search:', (error as Error).message);
        return null;
    }
}

/**
 * Store MPC search results in cache.
 * Automatically trims oldest entries if over limit.
 */
export function cacheMpcSearch(
    query: string,
    cardType: string,
    cards: MpcCard[]
): void {
    try {
        const db = getDatabase();
        const normalizedQuery = query.toLowerCase().trim();
        const now = Date.now();

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO mpc_search_cache (query, card_type, results_json, cached_at)
            VALUES (?, ?, ?, ?)
        `);

        stmt.run(normalizedQuery, cardType, JSON.stringify(cards), now);

        // Trim cache if over limit
        trimMpcCacheIfNeeded();
    } catch (error) {
        console.warn('[MPC Cache] Failed to cache search:', (error as Error).message);
    }
}

/**
 * Trim cache if over MAX_CACHE_ENTRIES.
 * Deletes oldest entries first (LRU eviction).
 */
function trimMpcCacheIfNeeded(): void {
    try {
        const db = getDatabase();

        const countResult = db.prepare('SELECT COUNT(*) as count FROM mpc_search_cache').get() as { count: number };

        if (countResult.count > MAX_CACHE_ENTRIES) {
            const toDelete = countResult.count - MAX_CACHE_ENTRIES;

            // Delete oldest entries
            db.prepare(`
                DELETE FROM mpc_search_cache
                WHERE rowid IN (
                    SELECT rowid FROM mpc_search_cache
                    ORDER BY cached_at ASC
                    LIMIT ?
                )
            `).run(toDelete);

            debugLog(`[MPC Cache] Trimmed ${toDelete} oldest entries`);
        }
    } catch (error) {
        console.warn('[MPC Cache] Failed to trim cache:', (error as Error).message);
    }
}

/**
 * Get cache statistics for logging/debugging.
 */
export function getMpcCacheStats(): { count: number; oldestTimestamp: number | null } {
    try {
        const db = getDatabase();

        const countResult = db.prepare('SELECT COUNT(*) as count FROM mpc_search_cache').get() as { count: number };
        const oldestResult = db.prepare('SELECT MIN(cached_at) as oldest FROM mpc_search_cache').get() as { oldest: number | null };

        return {
            count: countResult.count,
            oldestTimestamp: oldestResult.oldest,
        };
    } catch {
        return { count: 0, oldestTimestamp: null };
    }
}

/**
 * Clear all expired entries from cache.
 * Can be called periodically for maintenance.
 */
export function clearExpiredMpcCache(): number {
    try {
        const db = getDatabase();
        const expiryTime = Date.now() - CACHE_TTL_MS;

        const result = db.prepare('DELETE FROM mpc_search_cache WHERE cached_at < ?').run(expiryTime);
        return result.changes;
    } catch (error) {
        console.warn('[MPC Cache] Failed to clear expired entries:', (error as Error).message);
        return 0;
    }
}
