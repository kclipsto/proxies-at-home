import { describe, it, expect, beforeEach } from 'vitest';
import { indexedDbStorage } from './indexedDbStorage';
import { db } from '../db';

describe('indexedDbStorage', () => {
    beforeEach(async () => {
        await db.settings.clear();
    });

    it('should set item', async () => {
        await indexedDbStorage.setItem('test-key', JSON.stringify({ foo: 'bar' }));
        const stored = await db.settings.get('test-key');
        expect(stored).toBeDefined();
        expect(stored?.value).toEqual({ foo: 'bar' });
    });

    it('should get item', async () => {
        await db.settings.put({ id: 'test-key', value: { foo: 'bar' } });
        const retrieved = await indexedDbStorage.getItem('test-key');
        expect(retrieved).toBe(JSON.stringify({ foo: 'bar' }));
    });

    it('should return null if item not found', async () => {
        const retrieved = await indexedDbStorage.getItem('non-existent');
        expect(retrieved).toBeNull();
    });

    it('should remove item', async () => {
        await db.settings.put({ id: 'test-key', value: { foo: 'bar' } });
        await indexedDbStorage.removeItem('test-key');
        const stored = await db.settings.get('test-key');
        expect(stored).toBeUndefined();
    });
});
