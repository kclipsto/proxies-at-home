import { describe, it, expect } from 'vitest';
import { detectBleed } from './cardDimensions';

describe('detectBleed', () => {
    it('should return false (no bleed) for exact standard aspect ratio', () => {
        // 630x880 is exactly 63x88 ratio
        const result = detectBleed(630, 880);
        expect(result).toBe(false);
    });

    it('should return false (no bleed) for Scryfall high-res images (approx standard)', () => {
        // Scryfall "large" is often ~672x936 which is exactly 0.7179... 
        // 63/88 is 0.7159... diff is ~0.002. Should be within tolerance.
        const result = detectBleed(672, 936);
        expect(result).toBe(false);
    });

    it('should return true (has bleed) for MPC standard images', () => {
        // Common MPC resolution: 816x1110
        // Ratio: 0.7351... 
        // Standard: 0.7159...
        // Diff: ~0.019. This is > 0.015 default tolerance.
        const result = detectBleed(816, 1110);
        expect(result).toBe(true);
    });


    it('should return true for significantly different aspect ratios (Loose Detection)', () => {
        // Loose detection flags anything non-standard as "likely having bleed" (or at least not standard)
        // Square image - Deviation > 0.015 -> True
        expect(detectBleed(1000, 1000)).toBe(true);
        // Very wide image - Deviation > 0.015 -> True
        expect(detectBleed(2000, 1000)).toBe(true);
    });

    it('should handle landscape orientation correctly', () => {
        // Rotated standard card 880x630 -> Not MPC -> False
        expect(detectBleed(880, 630)).toBe(false);

        // Rotated MPC card 1110x816 -> Match MPC -> True
        expect(detectBleed(1110, 816)).toBe(true);
    });

    it('should handle zero dimension inputs gracefully', () => {
        expect(detectBleed(0, 100)).toBe(false);
        expect(detectBleed(100, 0)).toBe(false);
    });

    it('should use tolerance 0.015 by default', () => {
        // High Res MPC Image: 0.7221
        // Standard: 0.7159
        // Diff: 0.0062.

        // With 0.015 tolerance:
        // 0.0062 < 0.015 -> False (Standard)

        expect(detectBleed(3811, 5277)).toBe(false); // 0.0062 < 0.015 -> Standard -> No Bleed
    });
});
