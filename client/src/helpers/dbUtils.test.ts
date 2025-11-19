import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db';
import {
    addCards,
    rebalanceCardOrders,
} from './dbUtils';

describe('dbUtils', () => {

    beforeEach(async () => {
        await db.cards.clear();
        await db.images.clear();
        vi.clearAllMocks();

        // Mock crypto.subtle.digest
        let uuidCounter = 0;
        Object.defineProperty(global, 'crypto', {
            value: {
                subtle: {
                    digest: vi.fn(async (_algo, data) => data), // Return data as hash for uniqueness
                },
                randomUUID: vi.fn().mockImplementation(() => `mock-uuid-${++uuidCounter}`),
            },
            writable: true,
        });
    });

    describe('Card Management', () => {
        it('addCards should add new cards with increasing order', async () => {
            await addCards([{ name: 'Card 1', isUserUpload: false }]);
            await addCards([{ name: 'Card 2', isUserUpload: false }]);

            const cards = await db.cards.orderBy('order').toArray();
            expect(cards.length).toBe(2);
            expect(cards[0].name).toBe('Card 1');
            expect(cards[1].name).toBe('Card 2');
            expect(cards[1].order).toBeGreaterThan(cards[0].order);
        });
    });

    describe('rebalanceCardOrders', () => {
        it('should rebalance non-integer orders', async () => {
            await db.cards.bulkAdd([
                { uuid: '1', name: 'Card 1', order: 1.2, isUserUpload: false },
                { uuid: '2', name: 'Card 2', order: 1.5, isUserUpload: false },
                { uuid: '3', name: 'Card 3', order: 3, isUserUpload: false },
            ]);
            await rebalanceCardOrders();
            const cards = await db.cards.orderBy('order').toArray();
            expect(cards.map(c => c.order)).toEqual([10, 20, 30]);
        });

        it('should not rebalance if all orders are integers', async () => {
            await db.cards.bulkAdd([
                { uuid: '1', name: 'Card 1', order: 10, isUserUpload: false },
                { uuid: '2', name: 'Card 2', order: 20, isUserUpload: false },
            ]);

            // We can't directly check if bulkPut was called, so we check a side-effect
            // that would be undone by rebalancing. Let's add a non-standard order.
            await db.cards.update('1', { order: 5 });

            await rebalanceCardOrders();

            const cards = await db.cards.orderBy('order').toArray();
            // Order should be 5, 20 - not 10, 20. This indicates rebalance did not run.
            expect(cards.map(c => c.order)).toEqual([5, 20]);
        });
    });
    describe('Image Management', () => {
        it('hashBlob should return a hex string', async () => {
            const blob = new Blob(['test content'], { type: 'text/plain' });
            // Mock crypto.subtle.digest if not available in test env, but jsdom usually has it.
            // If it fails, we'll mock it.
            const hash = await import('./dbUtils').then(m => m.hashBlob(blob));
            expect(hash).toMatch(/^[a-f0-9]+$/);
        });

        it('addCustomImage should add image and handle ref counting', async () => {
            const blob = new Blob(['image data'], { type: 'image/png' });
            const { addCustomImage } = await import('./dbUtils');

            const id1 = await addCustomImage(blob);
            const img1 = await db.images.get(id1);
            expect(img1).toBeDefined();
            expect(img1?.refCount).toBe(1);

            // Add same blob again
            const id2 = await addCustomImage(blob);
            expect(id2).toBe(id1);
            const img2 = await db.images.get(id1);
            expect(img2?.refCount).toBe(2);
        });

        it('addRemoteImage should add image and handle ref counting', async () => {
            const url = 'https://cards.scryfall.io/large/front/1/2/12345.jpg';
            const { addRemoteImage } = await import('./dbUtils');

            const id1 = await addRemoteImage([url]);
            expect(id1).toBeDefined();
            if (!id1) return;

            const img1 = await db.images.get(id1);
            expect(img1).toBeDefined();
            expect(img1?.refCount).toBe(1);

            // Add same URL again
            const id2 = await addRemoteImage([url]);
            expect(id2).toBe(id1);
            const img2 = await db.images.get(id1);
            expect(img2?.refCount).toBe(2);
        });

        it('addRemoteImage should handle initial count > 1', async () => {
            const url = 'https://cards.scryfall.io/large/front/1/2/multi.jpg';
            const { addRemoteImage } = await import('./dbUtils');

            // Simulate adding 3 copies at once
            const id = await addRemoteImage([url], 3);
            expect(id).toBeDefined();
            if (!id) return;

            const img = await db.images.get(id);
            expect(img).toBeDefined();
            expect(img?.refCount).toBe(3);
        });

        it('removeImageRef should decrement ref count and delete if 0', async () => {
            const blob = new Blob(['delete me'], { type: 'image/png' });
            const { addCustomImage, removeImageRef } = await import('./dbUtils');

            const id = await addCustomImage(blob);
            await addCustomImage(blob); // refCount = 2

            await removeImageRef(id);
            const img1 = await db.images.get(id);
            expect(img1?.refCount).toBe(1);

            await removeImageRef(id);
            const img2 = await db.images.get(id);
            expect(img2).toBeUndefined();
        });
    });

    describe('Card Operations', () => {
        it('deleteCard should remove card and decrement image ref', async () => {
            const blob = new Blob(['card image'], { type: 'image/png' });
            const { addCustomImage, addCards, deleteCard } = await import('./dbUtils');

            const imageId = await addCustomImage(blob);
            await addCards([{ name: 'Delete Me', isUserUpload: true, imageId }]);

            const cards = await db.cards.toArray();
            const cardUuid = cards[0].uuid;

            await deleteCard(cardUuid);

            const card = await db.cards.get(cardUuid);
            expect(card).toBeUndefined();

            const image = await db.images.get(imageId);
            expect(image).toBeUndefined(); // Should be deleted as refCount went to 0
        });

        it('duplicateCard should copy card and increment image ref', async () => {
            const blob = new Blob(['dup image'], { type: 'image/png' });
            const { addCustomImage, addCards, duplicateCard } = await import('./dbUtils');

            const imageId = await addCustomImage(blob);
            await addCards([{ name: 'Original', isUserUpload: true, imageId }]);

            const cards = await db.cards.toArray();
            const originalUuid = cards[0].uuid;

            await duplicateCard(originalUuid);

            const allCards = await db.cards.toArray();
            expect(allCards.length).toBe(2);
            expect(allCards[1].imageId).toBe(imageId);

            const image = await db.images.get(imageId);
            expect(image?.refCount).toBe(2);
        });

        it('changeCardArtwork should update image refs and handle applyToAll', async () => {
            const blob1 = new Blob(['img1'], { type: 'image/png' });
            const blob2 = new Blob(['img2'], { type: 'image/png' });
            const { addCustomImage, addCards, changeCardArtwork } = await import('./dbUtils');

            const id1 = await addCustomImage(blob1);
            const id2 = await addCustomImage(blob2);

            await addCards([
                { name: 'Card A', isUserUpload: true, imageId: id1 },
                { name: 'Card A', isUserUpload: true, imageId: id1 }, // Same name
                { name: 'Card B', isUserUpload: true, imageId: id1 },
            ]);

            // Manually update refCount to match usage (3 cards)
            await db.images.update(id1, { refCount: 3 });

            const cards = await db.cards.toArray();
            const cardA1 = cards.find(c => c.name === 'Card A');
            if (!cardA1) throw new Error('Card A not found');

            // Change Card A to use id2, apply to all
            await changeCardArtwork(id1, id2, cardA1, true);

            const updatedCards = await db.cards.toArray();
            const updatedAs = updatedCards.filter(c => c.name === 'Card A');
            const updatedB = updatedCards.find(c => c.name === 'Card B');

            expect(updatedAs[0].imageId).toBe(id2);
            expect(updatedAs[1].imageId).toBe(id2);
            expect(updatedB?.imageId).toBe(id1);

            const img1 = await db.images.get(id1);
            expect(img1?.refCount).toBe(1); // Only Card B left

            const img2 = await db.images.get(id2);
            expect(img2?.refCount).toBe(3); // 2 cards + initial addCustomImage (1) = 3? 
            // Wait, addCustomImage sets refCount to 1.
            // changeCardArtwork increments by number of cards (2).
            // So 1 + 2 = 3. Correct.
        });
    });

    it('duplicateCard should rebalance if orders get too close', async () => {
        const blob = new Blob(['dup image'], { type: 'image/png' });
        const { addCustomImage, duplicateCard } = await import('./dbUtils');
        const imageId = await addCustomImage(blob);

        // Create cards with orders very close to each other
        await db.cards.bulkAdd([
            { uuid: '1', name: 'Card 1', order: 1, isUserUpload: true, imageId },
            { uuid: '2', name: 'Card 2', order: 1.000000000000001, isUserUpload: true, imageId },
        ]);

        // Duplicate the first card. The new order should be between 1 and 1.000000000000001
        // If it runs out of precision, it should trigger rebalance.
        // Note: JS numbers are double precision. 
        // Let's try to force a collision or just check if the logic runs.
        // Actually, the logic checks: if (newOrder === cardToCopy.order || newOrder === nextCard?.order)

        // Let's try to force it by manually setting orders that are identical or too close.
        // If we have 1 and 1 (which shouldn't happen but might), or 1 and 1 + epsilon.

        // A better way might be to mock the calculation or just trust that small enough difference triggers it.
        // Let's try with very close numbers.
        await db.cards.clear();
        await db.cards.bulkAdd([
            { uuid: '1', name: 'Card 1', order: 1, isUserUpload: true, imageId },
            { uuid: '2', name: 'Card 2', order: 1 + Number.EPSILON, isUserUpload: true, imageId },
        ]);

        // Duplicate '1'. It tries to put it between 1 and 1+EPSILON.
        // (1 + (1+EPSILON))/2 might be 1 or 1+EPSILON due to precision.
        await duplicateCard('1');

        const allCards = await db.cards.orderBy('order').toArray();
        expect(allCards.length).toBe(3);
        // If rebalanced, orders should be integers (1, 2, 3 or similar)
        // The rebalance logic sets them to i+1 (so 1, 2, 3)
        // Then the new card is added at currentIndex + 2?
        // Wait, code says:
        // const rebalanced = allCards.map((c, i) => ({ ...c, order: i + 1 }));
        // await db.cards.bulkPut(rebalanced);
        // newOrder = currentIndex + 2;

        // So we expect orders to be integers.
        expect(allCards.every(c => Number.isInteger(c.order))).toBe(true);
    });

    it('changeCardArtwork should handle new remote image (not in DB)', async () => {
        const blob1 = new Blob(['img1'], { type: 'image/png' });
        const { addCustomImage, addCards, changeCardArtwork } = await import('./dbUtils');

        const id1 = await addCustomImage(blob1);
        await addCards([{ name: 'Card A', isUserUpload: true, imageId: id1 }]);

        const cards = await db.cards.toArray();
        const cardA = cards[0];

        const newRemoteId = 'https://example.com/new-image.jpg';

        // Change to new remote image
        await changeCardArtwork(id1, newRemoteId, cardA, false);

        const updatedCard = await db.cards.get(cardA.uuid);
        expect(updatedCard?.imageId).toBe(newRemoteId);

        const newImage = await db.images.get(newRemoteId);
        expect(newImage).toBeDefined();
        expect(newImage?.refCount).toBe(1);
        expect(newImage?.sourceUrl).toBe(newRemoteId);
    });

    it('addRemoteImage should return undefined for empty list', async () => {
        const { addRemoteImage } = await import('./dbUtils');
        const result = await addRemoteImage([]);
        expect(result).toBeUndefined();
    });

    it('changeCardArtwork should update name if provided', async () => {
        const blob = new Blob(['img'], { type: 'image/png' });
        const { addCustomImage, addCards, changeCardArtwork } = await import('./dbUtils');
        const id = await addCustomImage(blob);
        await addCards([{ name: 'Old Name', isUserUpload: true, imageId: id }]);

        const cards = await db.cards.toArray();
        const card = cards[0];

        await changeCardArtwork(id, id, card, false, 'New Name');

        const updatedCard = await db.cards.get(card.uuid);
        expect(updatedCard?.name).toBe('New Name');
    });
});

