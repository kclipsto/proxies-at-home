import { db, type ScryfallSetsCacheEntry } from '../db';
import type { ScryfallSet } from '../../../shared/types';

/**
 * Client-side Scryfall sets cache.
 * Persists set data with a 24-hour TTL (stale-while-revalidate pattern).
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface CachedSetsResult {
    sets: ScryfallSet[] | null;
    stale: boolean;
    dataHash?: string;
}

/**
 * Compute a simple hash of the sets data to detect changes.
 * Uses a string of sorted set codes joined by commas.
 * Sufficient for detecting added/removed sets or code changes.
 */
function computeSetsHash(sets: ScryfallSet[]): string {
    if (!sets || sets.length === 0) return '';
    return sets
        .map(s => s.code)
        .sort()
        .join(',');
}

/**
 * Get cached Scryfall sets.
 * Returns { sets, stale: boolean }
 * - stale=true means the data is present but >24h old (caller should trigger background refresh)
 * - sets=null means no cache available
 */
export async function getCachedScryfallSets(): Promise<CachedSetsResult> {
    try {
        const entry = await db.scryfallSetsCache.get('sets');

        if (!entry) {
            return { sets: null, stale: true };
        }

        const now = Date.now();
        const age = now - entry.cachedAt;
        const isStale = age > CACHE_TTL_MS;

        return {
            sets: entry.sets as ScryfallSet[],
            stale: isStale,
            dataHash: entry.dataHash,
        };
    } catch (error) {
        console.warn('[Scryfall Cache] Failed to read sets cache:', error);
        return { sets: null, stale: true };
    }
}

/**
 * Store Scryfall sets in cache.
 * Only updates if the data hash has changed, or if we force an update (e.g. to refresh timestamp).
 * @returns true if data was written (cache updated)
 */
export async function cacheScryfallSets(sets: ScryfallSet[], previousHash?: string): Promise<boolean> {
    try {
        const now = Date.now();
        const dataHash = computeSetsHash(sets);

        // If provided a previous hash and it matches current, just update timestamp
        // But we actually just want to write if changed.
        // If hashes match, we might still want to update 'cachedAt' to reset TTL?
        // Yes: if data is same, we touched it, so update timestamp. 

        // Wait, if data is same, we don't need to re-write the huge array? 
        // We can just update cachedAt.

        const isSame = previousHash === dataHash;

        if (isSame) {
            // Update timestamp only
            await db.scryfallSetsCache.update('sets', { cachedAt: now });
            return false; // No data change
        }

        // Data changed or no previous hash
        const entry: ScryfallSetsCacheEntry = {
            key: 'sets',
            sets,
            cachedAt: now,
            dataHash
        };

        await db.scryfallSetsCache.put(entry);
        return true; // Data changed
    } catch (error) {
        console.warn('[Scryfall Cache] Failed to write sets cache:', error);
        return false;
    }
}

/**
 * Clear the sets cache.
 */
export async function clearScryfallSetsCache(): Promise<void> {
    try {
        await db.scryfallSetsCache.clear();
    } catch (error) {
        console.warn('[Scryfall Cache] Failed to clear sets cache:', error);
    }
}
