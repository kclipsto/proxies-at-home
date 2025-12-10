import { db } from "../db";

// Cache TTL: 7 days
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Clean expired entries from the image cache.
 * Returns the number of entries removed.
 */
export async function cleanExpiredImageCache(): Promise<number> {
    const cutoff = Date.now() - CACHE_TTL_MS;
    try {
        const count = await db.imageCache.where("cachedAt").below(cutoff).delete();
        return count;
    } catch {
        // IndexedDB error - return 0
        return 0;
    }
}

/**
 * Get cache statistics for debugging/monitoring.
 */
export async function getImageCacheStats(): Promise<{ count: number; oldestMs: number | null }> {
    try {
        const count = await db.imageCache.count();
        const oldest = await db.imageCache.orderBy("cachedAt").first();
        return {
            count,
            oldestMs: oldest ? Date.now() - oldest.cachedAt : null,
        };
    } catch {
        return { count: 0, oldestMs: null };
    }
}
