import { describe, it, expect } from 'vitest';
import { normalizeCardInfos } from './cardUtils';

describe('cardUtils', () => {
    describe('normalizeCardInfos', () => {
        it('should handle cardQueries array', () => {
            const queries = [
                { name: 'Card 1', set: 'SET', number: '123' },
                { name: 'Card 2', language: 'fr' },
            ];
            const result = normalizeCardInfos(queries, undefined, 'en');
            expect(result).toEqual([
                { name: 'Card 1', set: 'SET', number: '123', language: 'en' },
                { name: 'Card 2', set: undefined, number: undefined, language: 'fr' },
            ]);
        });

        it('should handle cardNames array', () => {
            const names = ['Card 1', 'Card 2'];
            const result = normalizeCardInfos(undefined, names, 'es');
            expect(result).toEqual([
                { name: 'Card 1', language: 'es' },
                { name: 'Card 2', language: 'es' },
            ]);
        });

        it('should return empty array if neither is provided', () => {
            const result = normalizeCardInfos(undefined, undefined, 'en');
            expect(result).toEqual([]);
        });

        it('should default to "en" if no language provided', () => {
            const result = normalizeCardInfos([{ name: 'Card 1' }], undefined, '');
            expect(result).toEqual([{ name: 'Card 1', set: undefined, number: undefined, language: 'en' }]);
        });

        it('should default to "en" if no language provided (cardNames)', () => {
            const result = normalizeCardInfos(undefined, ['Card 1'], '');
            expect(result).toEqual([{ name: 'Card 1', language: 'en' }]);
        });

        it('should preserve isToken flag for token cards', () => {
            const queries = [
                { name: 'Treasure', isToken: true },
                { name: 'Sol Ring', isToken: false },
                { name: 'Lightning Bolt' }, // no isToken field
            ];
            const result = normalizeCardInfos(queries, undefined, 'en');
            expect(result[0].isToken).toBe(true);
            expect(result[1].isToken).toBe(false);
            expect(result[2].isToken).toBeUndefined();
        });

        it('should preserve isToken with set and number', () => {
            const queries = [
                { name: 'Human Soldier', set: 'T2XM', number: '1', isToken: true },
            ];
            const result = normalizeCardInfos(queries, undefined, 'en');
            expect(result[0]).toEqual({
                name: 'Human Soldier',
                set: 'T2XM',
                number: '1',
                language: 'en',
                isToken: true,
            });
        });
    });
});
