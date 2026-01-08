import { db, type MpcSearchCacheEntry } from '../db';
import type { MpcAutofillCard } from './mpcAutofillApi';
import { parseMpcCardName } from './mpcUtils';

/**
 * Client-side MPC search cache with hybrid TTL + LRU eviction.
 * Persists across sessions, cleared on reset app data.
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (aligned with server)
const MAX_ENTRIES = 1000;

/**
 * Get cached MPC search results if fresh (< 1 week old).
 * Returns null if not cached or expired.
 */
export async function getCachedMpcSearch(
    query: string,
    cardType: 'CARD' | 'CARDBACK' | 'TOKEN'
): Promise<MpcAutofillCard[] | null> {
    try {
        const normalizedQuery = query.toLowerCase().trim();
        const now = Date.now();
        const expiryTime = now - CACHE_TTL_MS;

        const entry = await db.mpcSearchCache.get([normalizedQuery, cardType]);

        if (!entry) {
            return null;
        }

        // Check if expired
        if (entry.cachedAt < expiryTime) {
            // Delete expired entry
            await db.mpcSearchCache.delete([normalizedQuery, cardType]);
            return null;
        }

        // Update cachedAt for LRU (touch on access)
        await db.mpcSearchCache.update([normalizedQuery, cardType], { cachedAt: now });

        // Parse card names in case of stale cache entries with unparsed names
        const cards = (entry.cards as MpcAutofillCard[]).map((card) => ({
            ...card,
            name: parseMpcCardName(card.name, card.name),
        }));
        return cards;
    } catch (error) {
        console.warn('[MPC Client Cache] Failed to get cached search:', error);
        return null;
    }
}

/**
 * Store MPC search results in cache.
 * Automatically trims oldest entries if over limit.
 */
export async function cacheMpcSearch(
    query: string,
    cardType: 'CARD' | 'CARDBACK' | 'TOKEN',
    cards: MpcAutofillCard[]
): Promise<void> {
    try {
        const normalizedQuery = query.toLowerCase().trim();
        const now = Date.now();

        const entry: MpcSearchCacheEntry = {
            query: normalizedQuery,
            cardType,
            cards,
            cachedAt: now,
        };

        await db.mpcSearchCache.put(entry);

        // Trim cache if over limit (async, non-blocking)
        trimMpcCacheIfNeeded().catch(e =>
            console.warn('[MPC Client Cache] Trim failed:', e)
        );
    } catch (error) {
        console.warn('[MPC Client Cache] Failed to cache search:', error);
    }
}

/**
 * Trim cache if over MAX_ENTRIES.
 * Deletes oldest entries first (LRU eviction).
 */
async function trimMpcCacheIfNeeded(): Promise<void> {
    const count = await db.mpcSearchCache.count();

    if (count > MAX_ENTRIES) {
        const toDelete = count - MAX_ENTRIES;

        // Get oldest entries by cachedAt
        const oldestEntries = await db.mpcSearchCache
            .orderBy('cachedAt')
            .limit(toDelete)
            .toArray();

        // Delete them
        const keysToDelete = oldestEntries.map(e => [e.query, e.cardType] as [string, string]);
        await db.mpcSearchCache.bulkDelete(keysToDelete);
    }
}

/**
 * Clear all MPC search cache entries.
 * Called during reset app data.
 */
export async function clearMpcSearchCache(): Promise<void> {
    try {
        await db.mpcSearchCache.clear();
    } catch (error) {
        console.warn('[MPC Client Cache] Failed to clear:', error);
    }
}

/**
 * Get cache statistics for debugging.
 */
export async function getMpcCacheStats(): Promise<{ count: number; oldestTimestamp: number | null }> {
    try {
        const count = await db.mpcSearchCache.count();
        const oldest = await db.mpcSearchCache.orderBy('cachedAt').first();
        return {
            count,
            oldestTimestamp: oldest?.cachedAt ?? null,
        };
    } catch {
        return { count: 0, oldestTimestamp: null };
    }
}
