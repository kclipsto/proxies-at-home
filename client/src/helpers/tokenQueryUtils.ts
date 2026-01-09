/**
 * Token Query Parsing Utilities
 *
 * Handles detection of token cards and parsing of token-specific query syntax
 * for MPC Autofill searches.
 *
 * Supported formats:
 * - "t:<token name>" → searches for token art (e.g., "t:treasure")
 * - "t:token <token name>" → explicit token search (e.g., "t:token human soldier")
 * - Auto-detection from card type_line containing "Token"
 */

export type MpcCardType = 'CARD' | 'CARDBACK' | 'TOKEN';

/**
 * Names that are BOTH artifact types AND common tokens.
 * When searching for these in MPC, we should search BOTH CARD and TOKEN.
 * List from Scryfall's /catalog/artifact-types that also exist as tokens.
 */
export const TOKEN_TYPE_COLLISIONS = new Set([
    'blood', 'clue', 'food', 'gold', 'incubator', 'junk', 'map', 'powerstone', 'treasure',
]);

export interface ParsedTokenQuery {
    /** The actual search query (with prefix removed) */
    query: string;
    /** Whether a token prefix was explicitly specified */
    hasTokenPrefix: boolean;
    /** The detected card type for the search */
    cardType: MpcCardType;
}

/**
 * Parse a search query to detect token-specific syntax.
 *
 * Supports:
 * - "t:<name>" - Token prefix
 * - "t:token <name>" - Explicit token qualifier
 *
 * @param rawQuery The raw search input
 * @returns Parsed query info with cardType and cleaned query
 */
export function parseTokenQuery(rawQuery: string): ParsedTokenQuery {
    const trimmed = rawQuery.trim();

    // Check for "t:" prefix (case-insensitive)
    const tokenPrefixMatch = trimmed.match(/^t:(.*)/i);

    if (tokenPrefixMatch) {
        let innerQuery = tokenPrefixMatch[1].trim();

        // Check for "t:token <name>" format
        if (innerQuery.toLowerCase().startsWith('token ')) {
            innerQuery = innerQuery.slice(6).trim();
        }

        return {
            query: innerQuery,
            hasTokenPrefix: true,
            cardType: 'TOKEN',
        };
    }

    // No token prefix - return as-is with default CARD type
    return {
        query: trimmed,
        hasTokenPrefix: false,
        cardType: 'CARD',
    };
}

/**
 * Detect if a card is a token based on its type_line.
 *
 * @param typeLine The card's type_line from Scryfall or DB
 * @returns True if the card is a token
 */
export function isTokenCard(typeLine?: string): boolean {
    if (!typeLine) return false;
    return typeLine.toLowerCase().includes('token');
}

/**
 * Determine the MPC card type based on card data.
 *
 * Priority:
 * 1. Explicit token prefix in query (handled separately)
 * 2. Card type_line containing "Token"
 * 3. Default to "CARD"
 *
 * @param cardData Optional card data with type_line
 * @returns The appropriate MPC card type
 */
export function detectMpcCardType(cardData?: { type_line?: string }): MpcCardType {
    if (cardData && isTokenCard(cardData.type_line)) {
        return 'TOKEN';
    }
    return 'CARD';
}

/**
 * Build the appropriate MPC search parameters.
 *
 * Combines query parsing with card type detection to return
 * the correct search parameters for MPC Autofill.
 *
 * @param rawQuery The user's search input
 * @param cardData Optional card data for auto-detection
 * @returns Object with query string and cardType
 */
export function buildMpcSearchParams(
    rawQuery: string,
    cardData?: { type_line?: string }
): { query: string; cardType: MpcCardType } {
    // First check for explicit token prefix
    const parsed = parseTokenQuery(rawQuery);

    if (parsed.hasTokenPrefix) {
        return {
            query: parsed.query,
            cardType: 'TOKEN',
        };
    }

    // If no prefix, try auto-detection from card data
    const detectedType = detectMpcCardType(cardData);

    return {
        query: parsed.query,
        cardType: detectedType,
    };
}
