import { db } from "../db";
import type { Table } from "dexie";
import { debugLog } from "./debug";

// Cache Caps
const IMAGE_CACHE_CAP_BYTES = 5 * 1024 * 1024 * 1024;    // 5GB
const METADATA_CACHE_CAP_BYTES = 100 * 1024 * 1024;       // 100MB
const EFFECT_CACHE_CAP_BYTES = 5 * 1024 * 1024 * 1024;   // 5GB

/**
 * Generic LRU Enforcer for a Dexie Table.
 * @param table The table to clean (must have cachedAt index and size property)
 * @param capBytes The max size in bytes
 * @param primaryKeyPath The primary key property name (e.g. 'url', 'key')
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
async function enforceGenericLruLimit(
    table: Table<any, any>,
    capBytes: number,
    primaryKeyPath: string
): Promise<number> {
    let removedCount = 0;

    try {
        // Step 1: Size Cap (LRU)
        // Iterate from NEWEST to OLDEST
        let currentSize = 0;
        const keysToDelete: any[] = [];

        await table.orderBy("cachedAt").reverse().each(item => {
            const itemSize = item.size || (item.blob ? item.blob.size : 0) || 0;

            if (currentSize + itemSize > capBytes) {
                // If OVER cap, mark for deletion
                // Exception: if currentSize is 0 (first item), we keep it even if it exceeds cap
                if (currentSize === 0) {
                    currentSize += itemSize;
                } else {
                    keysToDelete.push(item[primaryKeyPath]);
                }
            } else {
                currentSize += itemSize;
            }
        });

        if (keysToDelete.length > 0) {
            await table.bulkDelete(keysToDelete);
            removedCount += keysToDelete.length;
        }

        return removedCount;
    } catch (e) {
        console.error(`[Cache] Cleanup error for table ${table.name || 'unknown'}:`, e);
        return removedCount;
    }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Enforce Image Cache Limits (5GB Cap, 7 Day TTL)
 */
export async function enforceImageCacheLimits(): Promise<number> {
    return enforceGenericLruLimit(db.imageCache, IMAGE_CACHE_CAP_BYTES, "url");
}

/**
 * Enforce Metadata Cache Limits (100MB Cap, 7 Day TTL)
 */
export async function enforceMetadataCacheLimits(): Promise<number> {
    return enforceGenericLruLimit(db.cardMetadataCache, METADATA_CACHE_CAP_BYTES, "id");
}

/**
 * Enforce Effect Cache Limits (2GB Cap)
 */
export async function enforceEffectCacheLimits(): Promise<number> {
    return enforceGenericLruLimit(db.effectCache, EFFECT_CACHE_CAP_BYTES, "key");
}

/**
 * Get cache statistics for debugging/monitoring.
 */
export async function getImageCacheStats(): Promise<{ count: number; sizeBytes: number; oldestMs: number | null }> {
    try {
        const count = await db.imageCache.count();
        const oldest = await db.imageCache.orderBy("cachedAt").first();

        let totalSize = 0;
        await db.imageCache.each(item => {
            totalSize += item.size || item.blob.size;
        });

        return {
            count,
            sizeBytes: totalSize,
            oldestMs: oldest ? Date.now() - oldest.cachedAt : null,
        };
    } catch {
        return { count: 0, sizeBytes: 0, oldestMs: null };
    }
}

/**
 * Emergency cleanup for QuotaExceededError.
 * Aggressively clears oldest 90% of entries from all caches.
 * Returns true if cleanup was performed.
 */
export async function emergencyCleanup(): Promise<boolean> {
    try {
        console.warn('[Cache] Emergency cleanup triggered - clearing 90% of old entries');

        // Clear oldest 90% of image cache
        const imageCount = await db.imageCache.count();
        if (imageCount > 0) {
            const toDelete = Math.ceil(imageCount * 0.9);
            const oldestImages = await db.imageCache.orderBy("cachedAt").limit(toDelete).primaryKeys();
            await db.imageCache.bulkDelete(oldestImages);
            debugLog(`[Cache] Cleared ${oldestImages.length} image cache entries`);
        }

        // Clear oldest 90% of effect cache  
        const effectCount = await db.effectCache.count();
        if (effectCount > 0) {
            const toDelete = Math.ceil(effectCount * 0.9);
            const oldestEffects = await db.effectCache.orderBy("cachedAt").limit(toDelete).primaryKeys();
            await db.effectCache.bulkDelete(oldestEffects);
            debugLog(`[Cache] Cleared ${oldestEffects.length} effect cache entries`);
        }

        return true;
    } catch (e) {
        console.error('[Cache] Emergency cleanup failed:', e);
        return false;
    }
}
