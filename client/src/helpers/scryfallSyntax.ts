/**
 * Scryfall Syntax Keywords
 * 
 * Complete list of Scryfall search syntax keywords from https://scryfall.com/docs/syntax
 * Used to detect when a query contains Scryfall syntax and should be passed through unchanged.
 */

// All known Scryfall syntax keywords (without the colon)
// These are prefixes that take a value after the colon (e.g., "is:mdfc", "c:r", "set:cmd")
export const SCRYFALL_SYNTAX_KEYWORDS = new Set([
    // Colors and Color Identity
    'c', 'color', 'id', 'identity',

    // Card Types
    't', 'type',

    // Card Text
    'o', 'oracle', 'fo', 'fulloracle', 'keyword', 'kw',

    // Mana Costs
    'm', 'mana', 'manavalue', 'mv', 'devotion', 'produces',

    // Power, Toughness, Loyalty
    'power', 'pow', 'toughness', 'tou', 'pt', 'powtou', 'loyalty', 'loy', 'defense', 'def',

    // Multi-faced Cards (is: keywords handled separately)

    // Spells, Permanents, Effects (is: keywords handled separately)

    // Rarity
    'r', 'rarity',

    // Sets and Blocks
    's', 'e', 'set', 'edition', 'cn', 'number', 'b', 'block', 'st',

    // In/cube
    'in', 'cube',

    // Format Legality
    'f', 'format', 'banned', 'restricted',

    // Prices
    'usd', 'eur', 'tix', 'cheapest',

    // Artist, Flavor Text, Watermark
    'a', 'artist', 'ft', 'flavor', 'wm', 'watermark', 'illustrations', 'artists',

    // Border, Frame, Games
    'border', 'frame', 'game',

    // Stamps and Security
    'stamp',

    // Year and Date
    'year', 'date',

    // Tags
    'art', 'atag', 'function', 'otag',

    // Reprints
    'prints', 'paperprints', 'papersets', 'sets',

    // Languages
    'lang', 'language',

    // Special keywords
    'is', 'not', 'has', 'new', 'unique', 'order', 'direction', 'include', 'prefer',
    'name', // For exact name or regex
]);

/**
 * Check if a string starts with a Scryfall syntax keyword followed by a colon.
 * This is used to detect queries like "is:mdfc", "c:r", "set:cmd", etc.
 * 
 * @param str The string to check
 * @returns true if the string starts with a Scryfall keyword prefix
 */
export function startsWithScryfallKeyword(str: string): boolean {
    const colonIndex = str.indexOf(':');
    if (colonIndex === -1) return false;

    const prefix = str.slice(0, colonIndex).toLowerCase();
    return SCRYFALL_SYNTAX_KEYWORDS.has(prefix);
}

/**
 * Check if a query string contains any Scryfall syntax.
 * Handles both single keywords (is:mdfc) and compound queries (is:legend set:ecc, c:r t:creature)
 * 
 * @param query The full query string
 * @returns true if the query contains Scryfall syntax
 */
export function containsScryfallSyntax(query: string): boolean {
    // Check each word/token in the query
    const tokens = query.split(/\s+/);
    for (const token of tokens) {
        // Handle negation (-is:something)
        const cleanToken = token.startsWith('-') ? token.slice(1) : token;
        if (startsWithScryfallKeyword(cleanToken)) {
            return true;
        }
    }
    return false;
}

/**
 * Check if the entire query is pure Scryfall syntax (no card names mixed in).
 * Used to determine if we should pass the query through unchanged.
 * 
 * @param query The full query string
 * @returns true if all parts of the query are Scryfall syntax
 */
export function isPureScryfallQuery(query: string): boolean {
    const tokens = query.split(/\s+/);

    // If query has tokens and ALL non-empty tokens are Scryfall syntax, it's pure
    const nonEmptyTokens = tokens.filter(t => t.length > 0);
    if (nonEmptyTokens.length === 0) return false;

    for (const token of nonEmptyTokens) {
        const cleanToken = token.startsWith('-') ? token.slice(1) : token;
        // A token is Scryfall syntax if it contains : and starts with a keyword
        // OR if it's a comparison (like pow>=8)
        const hasKeywordPrefix = startsWithScryfallKeyword(cleanToken);
        const isComparison = /^(pow|tou|cmc|mv|loy|def|usd|eur|tix|year|artists?|illustrations?|prints?|paperprints?|sets?|cn)[<>=!]/.test(cleanToken.toLowerCase());

        if (!hasKeywordPrefix && !isComparison) {
            return false;
        }
    }

    return true;
}
