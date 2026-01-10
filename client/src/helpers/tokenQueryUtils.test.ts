import { describe, it, expect } from 'vitest';
import {
    parseTokenQuery,
    isTokenCard,
    detectMpcCardType,
    buildMpcSearchParams,
    TOKEN_TYPE_COLLISIONS,
} from './tokenQueryUtils';

describe('tokenQueryUtils', () => {
    describe('parseTokenQuery', () => {
        it('should return CARD type for regular queries', () => {
            const result = parseTokenQuery('Sol Ring');
            expect(result.query).toBe('Sol Ring');
            expect(result.hasTokenPrefix).toBe(false);
            expect(result.cardType).toBe('CARD');
        });

        it('should detect t: prefix (lowercase)', () => {
            const result = parseTokenQuery('t:treasure');
            expect(result.query).toBe('treasure');
            expect(result.hasTokenPrefix).toBe(true);
            expect(result.cardType).toBe('TOKEN');
        });

        it('should detect T: prefix (uppercase)', () => {
            const result = parseTokenQuery('T:Human');
            expect(result.query).toBe('Human');
            expect(result.hasTokenPrefix).toBe(true);
            expect(result.cardType).toBe('TOKEN');
        });

        it('should handle t:token format', () => {
            const result = parseTokenQuery('t:token human soldier');
            expect(result.query).toBe('human soldier');
            expect(result.hasTokenPrefix).toBe(true);
            expect(result.cardType).toBe('TOKEN');
        });

        it('should handle T:Token format (mixed case)', () => {
            const result = parseTokenQuery('T:Token Spirit');
            expect(result.query).toBe('Spirit');
            expect(result.hasTokenPrefix).toBe(true);
            expect(result.cardType).toBe('TOKEN');
        });

        it('should trim whitespace', () => {
            const result = parseTokenQuery('  t:treasure  ');
            expect(result.query).toBe('treasure');
            expect(result.hasTokenPrefix).toBe(true);
        });

        it('should handle empty query after prefix', () => {
            const result = parseTokenQuery('t:');
            expect(result.query).toBe('');
            expect(result.hasTokenPrefix).toBe(true);
            expect(result.cardType).toBe('TOKEN');
        });

        it('should not match t in the middle of a word', () => {
            const result = parseTokenQuery('Attack Force');
            expect(result.query).toBe('Attack Force');
            expect(result.hasTokenPrefix).toBe(false);
            expect(result.cardType).toBe('CARD');
        });
    });

    describe('isTokenCard', () => {
        it('should return true for Token type_line', () => {
            expect(isTokenCard('Token Creature — Human Soldier')).toBe(true);
        });

        it('should return true for token in type_line (case insensitive)', () => {
            expect(isTokenCard('token')).toBe(true);
            expect(isTokenCard('TOKEN CREATURE')).toBe(true);
        });

        it('should return false for regular creature', () => {
            expect(isTokenCard('Creature — Human Soldier')).toBe(false);
        });

        it('should return false for undefined', () => {
            expect(isTokenCard(undefined)).toBe(false);
        });

        it('should return false for empty string', () => {
            expect(isTokenCard('')).toBe(false);
        });
    });

    describe('detectMpcCardType', () => {
        it('should return TOKEN for token cards', () => {
            expect(detectMpcCardType({ type_line: 'Token Creature — Goblin' })).toBe('TOKEN');
        });

        it('should return CARD for regular cards', () => {
            expect(detectMpcCardType({ type_line: 'Creature — Goblin' })).toBe('CARD');
        });

        it('should return CARD for undefined card data', () => {
            expect(detectMpcCardType(undefined)).toBe('CARD');
        });

        it('should return CARD for missing type_line', () => {
            expect(detectMpcCardType({})).toBe('CARD');
        });
    });

    describe('buildMpcSearchParams', () => {
        it('should prioritize explicit token prefix over card data', () => {
            const result = buildMpcSearchParams('t:treasure', { type_line: 'Creature' });
            expect(result.query).toBe('treasure');
            expect(result.cardType).toBe('TOKEN');
        });

        it('should auto-detect token from card data when no prefix', () => {
            const result = buildMpcSearchParams('Human Soldier', {
                type_line: 'Token Creature — Human Soldier',
            });
            expect(result.query).toBe('Human Soldier');
            expect(result.cardType).toBe('TOKEN');
        });

        it('should return CARD type for regular cards without prefix', () => {
            const result = buildMpcSearchParams('Lightning Bolt', {
                type_line: 'Instant',
            });
            expect(result.query).toBe('Lightning Bolt');
            expect(result.cardType).toBe('CARD');
        });

        it('should return CARD type when no card data provided', () => {
            const result = buildMpcSearchParams('Unknown Card');
            expect(result.query).toBe('Unknown Card');
            expect(result.cardType).toBe('CARD');
        });
    });

    describe('TOKEN_TYPE_COLLISIONS', () => {
        it('should contain known artifact type tokens', () => {
            expect(TOKEN_TYPE_COLLISIONS.has('treasure')).toBe(true);
            expect(TOKEN_TYPE_COLLISIONS.has('blood')).toBe(true);
            expect(TOKEN_TYPE_COLLISIONS.has('clue')).toBe(true);
            expect(TOKEN_TYPE_COLLISIONS.has('food')).toBe(true);
        });

        it('should contain all expected collision names', () => {
            const expected = ['blood', 'clue', 'food', 'gold', 'incubator', 'junk', 'map', 'powerstone', 'treasure'];
            for (const name of expected) {
                expect(TOKEN_TYPE_COLLISIONS.has(name)).toBe(true);
            }
        });

        it('should not contain non-collision names', () => {
            expect(TOKEN_TYPE_COLLISIONS.has('human')).toBe(false);
            expect(TOKEN_TYPE_COLLISIONS.has('soldier')).toBe(false);
            expect(TOKEN_TYPE_COLLISIONS.has('goblin')).toBe(false);
        });
    });
});
