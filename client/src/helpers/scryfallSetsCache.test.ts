import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCachedScryfallSets, cacheScryfallSets, clearScryfallSetsCache } from './scryfallSetsCache';
import { db } from '../db';
import type { ScryfallSet } from '../../../shared/types';

// Mock DB
vi.mock('../db', () => ({
    db: {
        scryfallSetsCache: {
            get: vi.fn(),
            put: vi.fn(),
            update: vi.fn(),
            clear: vi.fn(),
        },
        isOpen: vi.fn().mockReturnValue(false),
        close: vi.fn(),
    },
}));

describe('scryfallSetsCache', () => {
    const mockSets = [
        { code: 'lea', name: 'Alpha' },
        { code: 'leb', name: 'Beta' },
    ] as unknown as ScryfallSet[];

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('getCachedScryfallSets', () => {
        it('should return stale=true/sets=null if cache is empty', async () => {
            vi.mocked(db.scryfallSetsCache.get).mockResolvedValue(undefined);

            const result = await getCachedScryfallSets();
            expect(result).toEqual({ sets: null, stale: true });
        });

        it('should return sets and stale=false if cache is fresh', async () => {
            const now = Date.now();
            vi.mocked(db.scryfallSetsCache.get).mockResolvedValue({
                key: 'sets',
                sets: mockSets,
                cachedAt: now - 1000, // 1 second old
                dataHash: 'lea,leb',
            });

            const result = await getCachedScryfallSets();
            expect(result.sets).toEqual(mockSets);
            expect(result.stale).toBe(false);
            expect(result.dataHash).toBe('lea,leb');
        });

        it('should return sets and stale=true if cache is expired (>24h)', async () => {
            const now = Date.now();
            const expiredTime = now - (24 * 60 * 60 * 1000) - 1; // 24h + 1ms old

            vi.mocked(db.scryfallSetsCache.get).mockResolvedValue({
                key: 'sets',
                sets: mockSets,
                cachedAt: expiredTime,
                dataHash: 'lea,leb',
            });

            const result = await getCachedScryfallSets();
            expect(result.sets).toEqual(mockSets);
            expect(result.stale).toBe(true);
        });
    });

    describe('cacheScryfallSets', () => {
        it('should write new entry if data hash changes', async () => {
            const newSets = [{ code: 'lea', name: 'Alpha' }] as unknown as ScryfallSet[];
            await cacheScryfallSets(newSets, 'old-hash');

            expect(db.scryfallSetsCache.put).toHaveBeenCalledWith(expect.objectContaining({
                key: 'sets',
                sets: newSets,
                dataHash: 'lea',
            }));
        });

        it('should update timestamp only if data hash matches', async () => {
            const sets = [{ code: 'lea', name: 'Alpha' }] as unknown as ScryfallSet[];
            // Hash for this is 'lea'

            // Pass the SAME hash ('lea') as previousHash
            const changed = await cacheScryfallSets(sets, 'lea');

            expect(changed).toBe(false);
            expect(db.scryfallSetsCache.put).not.toHaveBeenCalled();
            expect(db.scryfallSetsCache.update).toHaveBeenCalledWith('sets', expect.objectContaining({
                cachedAt: expect.any(Number),
            }));
        });

        it('should write if no previous hash provided', async () => {
            await cacheScryfallSets(mockSets);
            expect(db.scryfallSetsCache.put).toHaveBeenCalled();
        });
    });

    describe('clearScryfallSetsCache', () => {
        it('should call db clear', async () => {
            await clearScryfallSetsCache();
            expect(db.scryfallSetsCache.clear).toHaveBeenCalled();
        });
    });
});
