/**
 * Utility functions for MPC card handling.
 * Separated to avoid circular imports between mpcAutofillApi and mpcSearchCache.
 */

/**
 * Parse an MPC card name to extract just the base card name.
 * MPC names often include set/collector info like "Forest [THB] {254}" or "Lightning Bolt (M21)".
 * This extracts just "Forest" or "Lightning Bolt".
 * @param mpcName The full MPC card name
 * @param fallback Optional fallback if parsing fails
 * @returns The base card name
 */
export function parseMpcCardName(mpcName: string, fallback?: string): string {
    if (!mpcName) return fallback || "";
    // Match everything before the first bracket, parenthesis, or brace
    const match = mpcName.match(/^([^([{\r\n]+)/);
    return match ? match[1].trim() : (mpcName.trim() || fallback || "");
}
