/**
 * LRU Cache wrapper around lru-cache npm package.
 * Provides a simple interface for caching with automatic eviction.
 */
import { LRUCache as LRU } from "lru-cache";

export class LRUCache<K extends NonNullable<unknown>, V extends NonNullable<unknown>> {
    private cache: LRU<K, V>;
    private readonly maxSize: number;

    constructor(maxSize: number) {
        this.maxSize = maxSize;
        this.cache = new LRU<K, V>({ max: maxSize });
    }

    /**
     * Get a value from the cache.
     * Returns undefined if not found.
     */
    get(key: K): V | undefined {
        return this.cache.get(key);
    }

    /**
     * Set a value in the cache.
     * If cache is at capacity, evicts the least recently used item.
     */
    set(key: K, value: V): void {
        this.cache.set(key, value);
    }

    /**
     * Check if a key exists in the cache.
     */
    has(key: K): boolean {
        return this.cache.has(key);
    }

    /**
     * Clear all entries from the cache.
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get the current number of items in the cache.
     */
    get size(): number {
        return this.cache.size;
    }

    /**
     * Get the maximum size of the cache.
     */
    get capacity(): number {
        return this.maxSize;
    }
}
