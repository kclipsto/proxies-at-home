/**
 * Shared utility functions for card name handling.
 */

/**
 * Normalize DFC names: "A // B" -> "A" (front face only)
 * This ensures client-side keys match server responses which return just the front face name.
 */
export function normalizeDfcName(name: string): string {
    return name.includes(' // ') ? name.split(' // ')[0].trim() : name;
}
