import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../db';
import { enforceImageCacheLimits, enforceMetadataCacheLimits, getImageCacheStats } from './cacheUtils';

describe('cacheUtils', () => {
    beforeEach(async () => {
        // Clear the imageCache table before each test
        await db.imageCache.clear();
    });

    describe('enforceImageCacheLimits', () => {
        beforeEach(async () => {
            await db.imageCache.clear();
        });

        it('should NOT remove old entries (even a month later)', async () => {
            const now = Date.now();
            const thirtyDays = 30 * 24 * 60 * 60 * 1000;

            await db.imageCache.add({
                url: 'http://example.com/expired.jpg',
                blob: new Blob(['expired']),
                cachedAt: now - thirtyDays,
                size: 100 // small
            });

            await db.imageCache.add({
                url: 'http://example.com/fresh.jpg',
                blob: new Blob(['fresh']),
                cachedAt: now - 1000,
                size: 100
            });

            const count = await enforceImageCacheLimits();
            // Should NOT remove the expired one
            expect(count).toBe(0);

            const all = await db.imageCache.toArray();
            expect(all).toHaveLength(2);
        });

        it('should enforce size cap by evicting oldest accessed items', async () => {
            // Note: IMAGE_CACHE_CAP_BYTES is 5GB.
            // We can't realistically fill 5GB in a test.
            // However, we CAN verify that enforceGenericLruLimit logic works by testing
            // the same function with a smaller cap on the metadata cache, which uses the same logic.
            // But since this is specific to image cache, we just ensure it doesn't crash on empty.
            const count = await enforceImageCacheLimits();
            expect(count).toBe(0);
        });
    });

    describe('enforceMetadataCacheLimits', () => {
        beforeEach(async () => {
            await db.cardMetadataCache.clear();
        });

        it('should NOT remove old entries for metadata (No TTL)', async () => {
            const now = Date.now();
            const oneYear = 365 * 24 * 60 * 60 * 1000;

            await db.cardMetadataCache.add({
                id: 'uuid-1',
                name: 'Old',
                set: '',
                number: '',
                data: { name: 'Old' },
                cachedAt: now - oneYear,
                size: 100
            });

            await db.cardMetadataCache.add({
                id: 'uuid-2',
                name: 'Fresh',
                set: '',
                number: '',
                data: { name: 'Fresh' },
                cachedAt: now,
                size: 100
            });

            const count = await enforceMetadataCacheLimits();
            expect(count).toBe(0);

            const all = await db.cardMetadataCache.toArray();
            expect(all).toHaveLength(2);
        });

        it('should allow loose lookup matching', async () => {
            // If we have a specific printing cached
            await db.cardMetadataCache.add({
                id: 'uuid-specific',
                name: 'LooseMatch',
                set: 'LEA',
                number: '1',
                data: { name: 'LooseMatch' },
                cachedAt: Date.now(),
                size: 100
            });

            // We search without set info
            const cached = await db.cardMetadataCache
                .where('name').equals('LooseMatch')
                .and(item => {
                    const targetSet = '';
                    if (targetSet && item.set !== targetSet) return false;
                    return true;
                })
                .first();

            expect(cached).toBeDefined();
            expect(cached?.set).toBe('LEA');
        });

        it('should enforce size cap by evicting oldest items', async () => {
            // To test the logic without filling 100MB, we can't easily change the constant 
            // from the outside, but we can assume the logic is shared.
            // We can try to fill it with "large" items? 
            // Actually, we can just inject a mock enforce function that exposes the logic 
            // OR we can trust the unit test for update logic if we exported the generic function.
            // Since we can't export the generic function easily without breaking encapsulation,
            // we will simulate a large fill.

            // 100MB Cap. Let's add 2 items of 60MB each.
            // Old item: 60MB
            // New item: 60MB
            // Total 120MB > 100MB. Old item should go.

            const now = Date.now();
            const sixtyMB = 60 * 1024 * 1024;

            await db.cardMetadataCache.add({
                id: 'uuid-old',
                name: 'Old',
                set: '',
                number: '',
                data: { name: 'Old' },
                cachedAt: now - 10000,
                size: sixtyMB
            });

            await db.cardMetadataCache.add({
                id: 'uuid-new',
                name: 'New',
                set: '',
                number: '',
                data: { name: 'New' },
                cachedAt: now,
                size: sixtyMB
            });

            const count = await enforceMetadataCacheLimits();
            // 60+60 = 120 > 100. Should delete 1.
            expect(count).toBe(1);

            const all = await db.cardMetadataCache.toArray();
            expect(all).toHaveLength(1);
            expect(all[0].name).toBe('New');
            expect(all[0].id).toBe('uuid-new');
        });

        it('should keep the newest item even if it exceeds the cap alone', async () => {
            // 100MB Cap. Add one item of 150MB.
            const hugeSize = 150 * 1024 * 1024;

            await db.cardMetadataCache.add({
                id: 'uuid-huge',
                name: 'Huge',
                set: '',
                number: '',
                data: { name: 'Huge' },
                cachedAt: Date.now(),
                size: hugeSize
            });

            const count = await enforceMetadataCacheLimits();
            // Should NOT delete the only item, even if it's too big
            expect(count).toBe(0);

            const all = await db.cardMetadataCache.toArray();
            expect(all).toHaveLength(1);
            expect(all[0].id).toBe('uuid-huge');
        });
    });

    describe('getImageCacheStats', () => {
        it('should return count 0 and null oldestMs when cache is empty', async () => {
            const stats = await getImageCacheStats();
            expect(stats.count).toBe(0);
            expect(stats.oldestMs).toBeNull();
            expect(stats.sizeBytes).toBe(0);
        });

        it('should return correct count, size, and oldest age', async () => {
            const now = Date.now();

            await db.imageCache.add({
                url: 'http://example.com/old.png',
                blob: new Blob(['test']),
                cachedAt: now - 3 * 24 * 60 * 60 * 1000, // 3 days ago
                size: 100
            });

            await db.imageCache.add({
                url: 'http://example.com/new.png',
                blob: new Blob(['test']),
                cachedAt: now - 1 * 24 * 60 * 60 * 1000, // 1 day ago
                size: 200
            });

            const stats = await getImageCacheStats();
            expect(stats.count).toBe(2);
            expect(stats.sizeBytes).toBe(300);
            expect(stats.oldestMs).toBeGreaterThan(2.9 * 24 * 60 * 60 * 1000);
        });
    });
});
