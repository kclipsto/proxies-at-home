import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../db';
import { cleanExpiredImageCache, getImageCacheStats } from './imageCacheUtils';

describe('imageCacheUtils', () => {
    beforeEach(async () => {
        // Clear the imageCache table before each test
        await db.imageCache.clear();
    });

    describe('cleanExpiredImageCache', () => {
        it('should return 0 when cache is empty', async () => {
            const count = await cleanExpiredImageCache();
            expect(count).toBe(0);
        });

        it('should remove expired entries', async () => {
            const now = Date.now();
            const sevenDays = 7 * 24 * 60 * 60 * 1000;

            // Add an expired entry (8 days old)
            await db.imageCache.add({
                url: 'http://example.com/expired.png',
                blob: new Blob(['test']),
                cachedAt: now - sevenDays - 24 * 60 * 60 * 1000, // 8 days ago
            });

            // Add a fresh entry (1 day old)
            await db.imageCache.add({
                url: 'http://example.com/fresh.png',
                blob: new Blob(['test']),
                cachedAt: now - 24 * 60 * 60 * 1000, // 1 day ago
            });

            const count = await cleanExpiredImageCache();
            expect(count).toBe(1);

            // Verify only the fresh entry remains
            const remaining = await db.imageCache.count();
            expect(remaining).toBe(1);

            const freshEntry = await db.imageCache.get('http://example.com/fresh.png');
            expect(freshEntry).toBeDefined();
        });

        it('should keep entries within TTL', async () => {
            const now = Date.now();
            const sixDays = 6 * 24 * 60 * 60 * 1000;

            // Add an entry that's 6 days old (within 7-day TTL)
            await db.imageCache.add({
                url: 'http://example.com/recent.png',
                blob: new Blob(['test']),
                cachedAt: now - sixDays,
            });

            const count = await cleanExpiredImageCache();
            expect(count).toBe(0);

            // Verify the entry still exists
            const entry = await db.imageCache.get('http://example.com/recent.png');
            expect(entry).toBeDefined();
        });

        it('should handle IndexedDB errors gracefully', async () => {
            // Mock db.imageCache.where to throw an error
            const whereSpy = vi.spyOn(db.imageCache, 'where').mockImplementationOnce(() => {
                throw new Error('IndexedDB error');
            });

            const count = await cleanExpiredImageCache();
            expect(count).toBe(0);

            whereSpy.mockRestore();
        });
    });

    describe('getImageCacheStats', () => {
        it('should return count 0 and null oldestMs when cache is empty', async () => {
            const stats = await getImageCacheStats();
            expect(stats.count).toBe(0);
            expect(stats.oldestMs).toBeNull();
        });

        it('should return correct count and oldest age', async () => {
            const now = Date.now();

            // Add some entries
            await db.imageCache.add({
                url: 'http://example.com/old.png',
                blob: new Blob(['test']),
                cachedAt: now - 3 * 24 * 60 * 60 * 1000, // 3 days ago
            });

            await db.imageCache.add({
                url: 'http://example.com/new.png',
                blob: new Blob(['test']),
                cachedAt: now - 1 * 24 * 60 * 60 * 1000, // 1 day ago
            });

            const stats = await getImageCacheStats();
            expect(stats.count).toBe(2);
            // Oldest should be approximately 3 days in ms (allow some tolerance for execution time)
            expect(stats.oldestMs).toBeGreaterThan(2.9 * 24 * 60 * 60 * 1000);
            expect(stats.oldestMs).toBeLessThan(3.1 * 24 * 60 * 60 * 1000);
        });

        it('should handle IndexedDB errors gracefully', async () => {
            // Mock db.imageCache.count to throw an error
            const countSpy = vi.spyOn(db.imageCache, 'count').mockRejectedValueOnce(new Error('IndexedDB error'));

            const stats = await getImageCacheStats();
            expect(stats.count).toBe(0);
            expect(stats.oldestMs).toBeNull();

            countSpy.mockRestore();
        });
    });
});
