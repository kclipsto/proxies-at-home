import type Database from 'better-sqlite3';
import { getDatabase } from '../db/db.js';
import { LRUCache } from './lruCache.js';
import type { ScryfallApiCard } from './getCardImagesPaged.js';
import { debugLog } from './debug.js';

// --- Prepared Statement Cache ---

// Cache for prepared SQL statements to avoid re-parsing
const preparedStatementCache = new Map<string, Database.Statement>();

export function getPreparedStatement(sql: string): Database.Statement {
    let stmt = preparedStatementCache.get(sql);
    if (!stmt) {
        const db = getDatabase();
        stmt = db.prepare(sql);
        preparedStatementCache.set(sql, stmt);
    }
    return stmt;
}

export function clearPreparedStatements(): void {
    preparedStatementCache.clear();
}

// --- Hot Card Cache (RAM) ---

// Max size in bytes for a single cached item (50KB)
// This protects against "memory bombs" (e.g. cards with 1000s of tokens)
const MAX_ITEM_SIZE_BYTES = 50 * 1024;

// Capacity: 500 items
const hotCardCacheInternal = new LRUCache<string, ScryfallApiCard>(500);

export const hotCardCache = {
    get: (key: string): ScryfallApiCard | undefined => {
        return hotCardCacheInternal.get(key);
    },
    set: (key: string, value: ScryfallApiCard): void => {
        // Safety Check: Estimate size of the object
        // A rough JSON stringify is sufficient for safety estimation
        const size = JSON.stringify(value).length;

        if (size > MAX_ITEM_SIZE_BYTES) {
            debugLog(`[Cache] Item "${key}" too large (${size} bytes), skipping RAM cache.`);
            return;
        }

        hotCardCacheInternal.set(key, value);
    },
    clear: (): void => {
        hotCardCacheInternal.clear();
    },
    has: (key: string): boolean => {
        return hotCardCacheInternal.has(key);
    },
    // Expose internal cache for metrics if needed
    _internal: hotCardCacheInternal
};
