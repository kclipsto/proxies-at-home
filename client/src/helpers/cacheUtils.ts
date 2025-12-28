import { db } from "../db";
import type { Table } from "dexie";

// Cache TTL:// 5GB Cap for Images (Raw bytes)
const IMAGE_CACHE_CAP_BYTES = 5 * 1024 * 1024 * 1024;
// 100MB Cap for Metadata (Approx)
const METADATA_CACHE_CAP_BYTES = 100 * 1024 * 1024;
// 2GB Cap for Effect Cache (pre-rendered exports)
const EFFECT_CACHE_CAP_BYTES = 5 * 1024 * 1024 * 1024; // 5GB for high-DPI effect caching

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
