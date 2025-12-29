import { describe, it, expect } from 'vitest';
import { hashOverrides } from './overridesHash';
import type { CardOverrides } from '../../../shared/types';

describe('hashOverrides', () => {
    it('returns empty string for undefined overrides', () => {
        expect(hashOverrides(undefined)).toBe('');
    });

    it('returns consistent hash for same overrides', () => {
        const overrides: CardOverrides = {
            brightness: 10,
            contrast: 5,
            saturation: 0,
        };
        const hash1 = hashOverrides(overrides);
        const hash2 = hashOverrides(overrides);
        expect(hash1).toBe(hash2);
    });

    it('returns different hashes for different override values', () => {
        const overrides1: CardOverrides = { brightness: 10 };
        const overrides2: CardOverrides = { brightness: 20 };
        expect(hashOverrides(overrides1)).not.toBe(hashOverrides(overrides2));
    });

    it('returns different hashes for different override keys', () => {
        const overrides1: CardOverrides = { brightness: 10 };
        const overrides2: CardOverrides = { contrast: 10 };
        expect(hashOverrides(overrides1)).not.toBe(hashOverrides(overrides2));
    });

    it('returns same hash for semantically equivalent objects', () => {
        const overrides1: CardOverrides = { brightness: 10, contrast: 5 };
        const overrides2: CardOverrides = { brightness: 10, contrast: 5 };
        expect(hashOverrides(overrides1)).toBe(hashOverrides(overrides2));
    });

    it('returns a valid hex string', () => {
        const overrides: CardOverrides = { brightness: 10 };
        const hash = hashOverrides(overrides);
        expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('handles complex nested overrides', () => {
        const overrides: CardOverrides = {
            brightness: 10,
            contrast: 5,
            holoEffect: 'rainbow',
            holoAnimation: 'wave',
            holoSpeed: 50,
        };
        const hash = hashOverrides(overrides);
        expect(hash).toBeTruthy();
        expect(hash.length).toBeGreaterThan(0);
    });

    it('handles empty object overrides', () => {
        const overrides: CardOverrides = {};
        const hash = hashOverrides(overrides);
        // Empty object should still produce a hash (not empty string)
        expect(hash).toBeTruthy();
    });

    it('is fast for performance-critical comparisons', () => {
        const overrides: CardOverrides = {
            brightness: 10,
            contrast: 5,
            saturation: 0,
            holoEffect: 'rainbow',
            holoAnimation: 'wave',
        };

        // Run 10000 iterations - should complete within 100ms
        const start = performance.now();
        for (let i = 0; i < 10000; i++) {
            hashOverrides(overrides);
        }
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(100);
    });
});
