/**
 * Shared holographic animation utility
 * Provides consistent animation behavior across all canvas components
 */

export type HoloAnimationStyle = 'none' | 'wave' | 'pulse' | 'sweep' | 'twinkle';

export interface HoloAnimationResult {
    angle: number;
    strength: number;
}

/**
 * Calculate holographic animation values
 * @param style The animation style
 * @param time Current time in milliseconds (e.g., performance.now())
 * @param speed Animation speed (1-10)
 * @param baseStrength Base strength value (0-100)
 * @param currentAngle Current angle value for delta-based animations
 * @param delta Time delta in seconds since last frame
 * @returns Updated angle and strength values
 */
export function calculateHoloAnimation(
    style: HoloAnimationStyle,
    time: number,
    speed: number,
    baseStrength: number,
    currentAngle: number,
    delta: number
): HoloAnimationResult {
    const timeSeconds = time / 1000;
    const speedMultiplier = speed * 12; // 12-120 degrees per second based on speed 1-10

    switch (style) {
        case 'wave':
            // Wave: rotate angle continuously
            return {
                angle: (currentAngle + delta * speedMultiplier) % 360,
                strength: baseStrength,
            };

        case 'pulse': {
            // Pulse: fade strength in and out
            const pulse = (Math.sin(timeSeconds * speed * 2) + 1) / 2; // 0-1 oscillation
            return {
                angle: 45, // Keep angle fixed
                strength: baseStrength * (0.2 + pulse * 0.8), // 20% to 100%
            };
        }

        case 'sweep': {
            // Sweep: moving band back and forth with ease in/out (ping-pong)
            // Uses sine wave for smooth oscillation, same as per-card rendering
            // Uses 1000+ range to trigger sweep mode in shader
            const cycle = Math.sin(timeSeconds * speed * 0.5) * 0.5 + 0.5; // 0-1 oscillation
            const sweepPos = cycle * 180; // 0-180 position
            return {
                angle: 1000 + sweepPos, // 1000+ tells shader to use sweep mode
                strength: baseStrength,
            };
        }
        case 'twinkle':
            // Twinkle: randomized twinkling (uses 2000+ range in shader)
            // Speed reduced: max 10 = old speed 4
            return {
                angle: 2000 + (timeSeconds * speed * 6),
                strength: baseStrength,
            };

        default:
            // No animation or unknown style
            return {
                angle: currentAngle,
                strength: baseStrength,
            };
    }
}
