import { describe, it, expect } from 'vitest';
import { calculateHoloAnimation, type HoloAnimationStyle } from './holoAnimation';

describe('calculateHoloAnimation', () => {
    const time = 1000; // 1 second
    const speed = 5;
    const baseStrength = 50;
    const currentAngle = 45;
    const delta = 0.016; // ~60fps frame delta

    describe('none style', () => {
        it('should return unchanged values for none style', () => {
            const result = calculateHoloAnimation('none', time, speed, baseStrength, currentAngle, delta);
            expect(result.angle).toBe(currentAngle);
            expect(result.strength).toBe(baseStrength);
        });
    });

    describe('wave style', () => {
        it('should rotate angle based on speed and delta', () => {
            const result = calculateHoloAnimation('wave', time, speed, baseStrength, 0, delta);
            // speedMultiplier = 5 * 12 = 60; delta * 60 = 0.016 * 60 = 0.96
            expect(result.angle).toBeCloseTo(0.96, 1);
            expect(result.strength).toBe(baseStrength);
        });

        it('should wrap angle at 360 degrees', () => {
            const result = calculateHoloAnimation('wave', time, speed, baseStrength, 359, delta);
            expect(result.angle).toBeGreaterThanOrEqual(0);
            expect(result.angle).toBeLessThan(360);
        });
    });

    describe('pulse style', () => {
        it('should keep angle fixed at 45', () => {
            const result = calculateHoloAnimation('pulse', time, speed, baseStrength, currentAngle, delta);
            expect(result.angle).toBe(45);
        });

        it('should vary strength based on time', () => {
            const result1 = calculateHoloAnimation('pulse', 0, speed, baseStrength, currentAngle, delta);
            const result2 = calculateHoloAnimation('pulse', 500, speed, baseStrength, currentAngle, delta);
            // Strength should vary between 20% and 100% of baseStrength
            expect(result1.strength).toBeGreaterThanOrEqual(baseStrength * 0.2);
            expect(result1.strength).toBeLessThanOrEqual(baseStrength);
            expect(result2.strength).toBeGreaterThanOrEqual(baseStrength * 0.2);
        });
    });

    describe('sweep style', () => {
        it('should return angle in 1000+ range for sweep mode', () => {
            const result = calculateHoloAnimation('sweep', time, speed, baseStrength, currentAngle, delta);
            expect(result.angle).toBeGreaterThanOrEqual(1000);
            expect(result.angle).toBeLessThanOrEqual(1180);
        });

        it('should maintain base strength', () => {
            const result = calculateHoloAnimation('sweep', time, speed, baseStrength, currentAngle, delta);
            expect(result.strength).toBe(baseStrength);
        });
    });

    describe('twinkle style', () => {
        it('should return angle in 2000+ range for twinkle mode', () => {
            const result = calculateHoloAnimation('twinkle', time, speed, baseStrength, currentAngle, delta);
            expect(result.angle).toBeGreaterThanOrEqual(2000);
        });

        it('should increase angle with time for twinkle variation', () => {
            const result1 = calculateHoloAnimation('twinkle', 1000, speed, baseStrength, currentAngle, delta);
            const result2 = calculateHoloAnimation('twinkle', 2000, speed, baseStrength, currentAngle, delta);
            expect(result2.angle).toBeGreaterThan(result1.angle);
        });

        it('should maintain base strength', () => {
            const result = calculateHoloAnimation('twinkle', time, speed, baseStrength, currentAngle, delta);
            expect(result.strength).toBe(baseStrength);
        });
    });

    describe('unknown style', () => {
        it('should return unchanged values for unknown style', () => {
            const result = calculateHoloAnimation('unknown' as HoloAnimationStyle, time, speed, baseStrength, currentAngle, delta);
            expect(result.angle).toBe(currentAngle);
            expect(result.strength).toBe(baseStrength);
        });
    });
});
