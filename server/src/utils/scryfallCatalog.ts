/**
 * Scryfall Catalog Utilities
 * 
 * Manages type catalogs from Scryfall API and token name lookups from the database.
 * Used for smart detection of `t:` prefix queries to determine if they're valid
 * Scryfall types (e.g., t:artifact) or token searches (e.g., t:treasure).
 */

import { getDatabase } from '../db/db.js';

// In-memory cache of valid types from Scryfall catalogs
const validTypes = new Set<string>();

interface CatalogResponse {
    data: string[];
}

/**
 * Initialize catalogs by fetching type lists from Scryfall API.
 * Should be called once at server startup.
 */
export async function initCatalogs(): Promise<void> {
    try {
        // Fetch all type-related catalogs from Scryfall
        const catalogEndpoints = [
            'supertypes',      // Legendary, Basic, Snow, World
            'card-types',      // Artifact, Creature, Enchantment, Land, etc.
            'artifact-types',  // Equipment, Vehicle, Clue, Food, Treasure
            'battle-types',    // Siege
            'creature-types',  // Human, Soldier, Goblin, etc.
            'enchantment-types', // Aura, Saga, Shrine, etc.
            'land-types',      // Forest, Island, Swamp, Locus, etc.
            'planeswalker-types', // Jace, Chandra, Liliana, etc.
            'spell-types',     // Arcane, Trap
        ];

        const responses = await Promise.all(
            catalogEndpoints.map(endpoint =>
                fetch(`https://api.scryfall.com/catalog/${endpoint}`)
                    .then(r => r.json())
                    .catch(() => ({ data: [] }))
            )
        );

        // Add all types to the set (lowercase for case-insensitive matching)
        for (const response of responses) {
            const catalog = response as CatalogResponse;
            catalog.data?.forEach((t: string) => validTypes.add(t.toLowerCase()));
        }

        console.log(`[Catalog] Loaded ${validTypes.size} types from ${catalogEndpoints.length} Scryfall catalogs`);
    } catch (error) {
        console.error('[Catalog] Failed to load catalogs from Scryfall:', error);
        // Fallback: Add common types that we know exist
        const fallbackTypes = [
            'artifact', 'creature', 'enchantment', 'instant', 'land',
            'planeswalker', 'sorcery', 'battle', 'kindred',
            'human', 'soldier', 'elf', 'goblin', 'wizard', 'dragon',
            'legendary', 'basic', 'snow',
        ];
        fallbackTypes.forEach(t => validTypes.add(t));
        console.log(`[Catalog] Using ${validTypes.size} fallback types`);
    }
}

/**
 * Check if a type is a valid Scryfall type (from card-types or creature-types catalogs).
 * @param type The type to check (e.g., "artifact", "creature", "human")
 * @returns True if it's a known Scryfall type
 */
export function isValidScryfallType(type: string): boolean {
    return validTypes.has(type.toLowerCase());
}

/**
 * Check if a name is a known token from the database.
 * @param name The token name to check (e.g., "treasure", "human soldier")
 * @returns True if it's a known token name
 */
export function isKnownToken(name: string): boolean {
    try {
        const db = getDatabase();
        const result = db.prepare('SELECT 1 FROM token_names WHERE name = ?').get(name.toLowerCase());
        return !!result;
    } catch {
        // Table might not exist yet (before migration)
        return false;
    }
}

/**
 * Insert a token name into the database.
 * Called during bulk import for cards with "Token" in their type_line.
 * @param name The token name to insert
 */
export function insertTokenName(name: string): void {
    try {
        const db = getDatabase();
        db.prepare('INSERT OR IGNORE INTO token_names (name) VALUES (?)').run(name.toLowerCase());
    } catch {
        // Ignore errors (table might not exist yet)
    }
}

/**
 * Insert a card's types into the database.
 * Called during bulk import to index types for fast lookups.
 * @param cardId Scryfall card ID
 * @param type Individual type (e.g., "artifact")
 * @param isToken Whether this card is a token
 */
export function insertCardType(cardId: string, type: string, isToken: boolean): void {
    try {
        const db = getDatabase();
        db.prepare(
            'INSERT OR IGNORE INTO card_types (card_id, type, is_token) VALUES (?, ?, ?)'
        ).run(cardId, type.toLowerCase(), isToken ? 1 : 0);
    } catch {
        // Ignore errors (table might not exist yet)
    }
}

/**
 * Parse a type_line into individual types.
 * @param typeLine The full type line (e.g., "Legendary Artifact Creature — Human Soldier")
 * @returns Array of individual types (e.g., ["legendary", "artifact", "creature", "human", "soldier"])
 */
export function parseTypeLine(typeLine: string): string[] {
    if (!typeLine) return [];

    return typeLine
        .replace(/—/g, ' ')  // Replace em-dash with space
        .replace(/-/g, ' ')  // Replace hyphen with space
        .split(/\s+/)
        .map(t => t.toLowerCase())
        .filter(t => t.length > 0);
}
