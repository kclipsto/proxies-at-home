import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    getFlexibleCardTypes,
    filterUploadLibraryItems,
    sortUploadLibraryItems,
    invalidateUploadLibraryUrl,
    revokeAllUploadLibraryUrls,
    type UploadLibraryItem
} from './uploadLibrary';

vi.mock('../db', () => ({
    db: {
        user_images: {
            toArray: vi.fn(),
            add: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            get: vi.fn(),
        },
        images: { get: vi.fn(), delete: vi.fn(), update: vi.fn() },
        transaction: vi.fn((_mode: string, _t1: unknown, _t2: unknown, cb: () => void) => cb()),
    },
}));

describe('uploadLibrary', () => {
    describe('getFlexibleCardTypes', () => {
        it('should return empty array for empty type line', () => {
            expect(getFlexibleCardTypes('')).toEqual([]);
            expect(getFlexibleCardTypes(undefined)).toEqual([]);
        });

        it('should return single type', () => {
            expect(getFlexibleCardTypes('Creature')).toEqual(['Creature']);
        });

        it('should include subtypes after hyphen', () => {
            expect(getFlexibleCardTypes('Creature - Goblin')).toEqual(['Creature', 'Goblin']);
        });

        it('should include subtypes after em dash', () => {
            expect(getFlexibleCardTypes('Creature — Elf Warrior')).toEqual(['Creature', 'Elf', 'Warrior']);
        });

        it('should include all supertypes, types, and subtypes', () => {
            expect(getFlexibleCardTypes('Legendary Creature - Human Wizard')).toEqual(['Legendary', 'Creature', 'Human', 'Wizard']);
        });
    });

    describe('filterUploadLibraryItems', () => {
        const items: UploadLibraryItem[] = [
            { hash: '1', displayName: 'Goblin Guide', imageUrl: 'url1', typeLine: 'Creature - Goblin Scout', isFavorite: true, createdAt: 100 },
            { hash: '2', displayName: 'Lightning Bolt', imageUrl: 'url2', typeLine: 'Instant', isFavorite: false, createdAt: 200 },
            { hash: '3', displayName: 'Mountain', imageUrl: 'url3', typeLine: 'Basic Land - Mountain', isFavorite: false, createdAt: 300 },
        ];

        it('should return all items if no filters', () => {
            expect(filterUploadLibraryItems(items, {})).toHaveLength(3);
        });

        it('should filter by query (case insensitive)', () => {
            const result = filterUploadLibraryItems(items, { query: 'goblin' });
            expect(result).toHaveLength(1);
            expect(result[0].displayName).toBe('Goblin Guide');
        });

        it('should filter by single type', () => {
            expect(filterUploadLibraryItems(items, { types: ['Creature'] })).toHaveLength(1);
            expect(filterUploadLibraryItems(items, { types: ['Basic'] })).toHaveLength(1);
        });

        it('should filter by multiple types (OR logic)', () => {
            expect(filterUploadLibraryItems(items, { types: ['Instant', 'Basic'] })).toHaveLength(2);
        });

        it('should filter by favorites', () => {
            const result = filterUploadLibraryItems(items, { isFavoriteOnly: true });
            expect(result).toHaveLength(1);
            expect(result[0].displayName).toBe('Goblin Guide');
        });

        it('should combine filters', () => {
            expect(filterUploadLibraryItems(items, { query: 'Guide', isFavoriteOnly: true })).toHaveLength(1);
            expect(filterUploadLibraryItems(items, { query: 'Bolt', isFavoriteOnly: true })).toHaveLength(0);
        });
    });

    describe('sortUploadLibraryItems', () => {
        const items: UploadLibraryItem[] = [
            { hash: '1', displayName: 'Apple', imageUrl: 'url1', typeLine: 'Fruit', isFavorite: false, createdAt: 100 },
            { hash: '2', displayName: 'Banana', imageUrl: 'url2', typeLine: 'Fruit', isFavorite: true, createdAt: 300 },
            { hash: '3', displayName: 'Carrot', imageUrl: 'url3', typeLine: 'Vegetable', isFavorite: false, createdAt: 200 },
        ];

        it('should sort by name asc', () => {
            const result = sortUploadLibraryItems([...items], 'name', 'asc');
            expect(result.map(i => i.displayName)).toEqual(['Apple', 'Banana', 'Carrot']);
        });

        it('should sort by name desc', () => {
            const result = sortUploadLibraryItems([...items], 'name', 'desc');
            expect(result.map(i => i.displayName)).toEqual(['Carrot', 'Banana', 'Apple']);
        });

        it('should sort by date asc', () => {
            const result = sortUploadLibraryItems([...items], 'date', 'asc');
            expect(result.map(i => i.displayName)).toEqual(['Apple', 'Carrot', 'Banana']);
        });

        it('should sort by date desc', () => {
            const result = sortUploadLibraryItems([...items], 'date', 'desc');
            expect(result.map(i => i.displayName)).toEqual(['Banana', 'Carrot', 'Apple']);
        });
    });

    describe('URL cache management', () => {
        const originalCreateObjectURL = global.URL.createObjectURL;
        const originalRevokeObjectURL = global.URL.revokeObjectURL;
        const mockRevokeObjectURL = vi.fn();

        afterEach(() => {
            global.URL.createObjectURL = originalCreateObjectURL;
            global.URL.revokeObjectURL = originalRevokeObjectURL;
            revokeAllUploadLibraryUrls();
        });

        it('should revoke URL when invalidating', () => {
            global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
            global.URL.revokeObjectURL = mockRevokeObjectURL;
            invalidateUploadLibraryUrl('nonexistent-hash');
            expect(mockRevokeObjectURL).not.toHaveBeenCalled();
        });

        it('should clear all cached URLs', () => {
            global.URL.revokeObjectURL = mockRevokeObjectURL;
            revokeAllUploadLibraryUrls();
            expect(mockRevokeObjectURL).not.toHaveBeenCalled();
        });
    });
});
