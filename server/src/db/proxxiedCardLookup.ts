import { getDatabase } from './db.js';
import { debugLog } from '../utils/debug.js';
import { LRUCache } from '../utils/lruCache.js';
import type { ScryfallApiCard } from '../utils/getCardImagesPaged.js';

// Cache for scoring results: avoids re-scoring the same name+lang lookup
// Key: "name:lang" (lowercase), Value: best matching card
const scoringCache = new Map<string, ScryfallApiCard>();

// LRU memory cache for hot cards - bypasses SQLite entirely for frequently accessed cards
// Max 500 entries (~2MB memory overhead assuming ~4KB per card)
// Key: "set:number" or "name:lang", Value: card data
const hotCardCache = new LRUCache<string, ScryfallApiCard>(500);

// Clear caches when new cards are inserted (they might be better matches)
export function clearScoringCache(): void {
    scoringCache.clear();
    hotCardCache.clear();
}

// Prepared statement cache - avoids re-preparing same SQL on each call
// Lazy-initialized on first use (after database is ready)
// Using Map to store by SQL string for simplicity
import type Database from 'better-sqlite3';
const preparedStatementCache = new Map<string, Database.Statement>();

function getPreparedStatement(sql: string): Database.Statement {
    let stmt = preparedStatementCache.get(sql);
    if (!stmt) {
        const db = getDatabase();
        stmt = db.prepare(sql);
        preparedStatementCache.set(sql, stmt);
    }
    return stmt;
}

// Clear prepared statements when database changes (for testing)
export function clearPreparedStatements(): void {
    preparedStatementCache.clear();
}

/**
 * Look up a card by set code and collector number.
 * Set+number uniquely identifies a physical card, so we ignore language
 * since the actual printing determines the language.
 * Returns the card in ScryfallApiCard format, or null if not found.
 */
export function lookupCardBySetNumber(
    setCode: string,
    collectorNumber: string
): ScryfallApiCard | null {
    try {
        // Check hot card cache first
        const cacheKey = `${setCode.toLowerCase()}:${collectorNumber}`;
        const cached = hotCardCache.get(cacheKey);
        if (cached) {
            debugLog(`[DB Cache] Hot cache HIT for ${cacheKey}`);
            return cached;
        }

        // Use prepared statement (cached at module level)
        const stmt = getPreparedStatement(
            `SELECT * FROM cards WHERE set_code = ? AND collector_number = ? LIMIT 1`
        );
        const row = stmt.get(setCode.toLowerCase(), collectorNumber) as CardRow | undefined;
        if (!row) return null;

        // Treat cards without all_parts as cache miss - they need re-fetch for token data
        if (!row.all_parts) {
            return null;
        }

        const card = rowToScryfallCard(row);

        // Store in hot cache for future lookups
        hotCardCache.set(cacheKey, card);

        return card;
    } catch {
        // Database might not be initialized yet, return null
        return null;
    }
}

/**
 * Look up a card by name (case-insensitive).
 * Returns the best matching card based on scoring:
 * - Exact name match scores highest
 * - DFC front face match scores next
 * - Most recent release wins as tiebreaker
 */
export function lookupCardByName(
    name: string,
    lang: string = 'en'
): ScryfallApiCard | null {
    try {
        const queryLower = name.toLowerCase();

        // Use prepared statements (cached at module level)
        const exactStmt = getPreparedStatement(
            `SELECT * FROM cards WHERE name = ? COLLATE NOCASE AND lang = ?`
        );
        let rows = exactStmt.all(name, lang.toLowerCase()) as CardRow[];

        // If no exact matches, try DFC front face matching
        // e.g., "Bala Ged Recovery" should match "Bala Ged Recovery // Bala Ged Sanctuary"
        if (rows.length === 0) {
            const likeStmt = getPreparedStatement(
                `SELECT * FROM cards WHERE name LIKE ? COLLATE NOCASE AND lang = ?`
            );
            rows = likeStmt.all(`${name} //%`, lang.toLowerCase()) as CardRow[];
        }

        // Filter out cards without all_parts - they need re-fetch for token data
        // This handles cards cached before all_parts column was added
        rows = rows.filter(row => row.all_parts !== null);

        if (rows.length === 0) {
            debugLog(`[DB Cache] lookupCardByName("${name}", "${lang}"): Not found (or missing all_parts)`);
            return null;
        }

        // Check scoring cache first - avoids re-scoring on repeated lookups
        const cacheKey = `${queryLower}:${lang.toLowerCase()}`;
        const cached = scoringCache.get(cacheKey);
        if (cached) {
            debugLog(`[DB Cache] lookupCardByName("${name}", "${lang}"): Scoring cache hit`);
            return cached;
        }

        // Score each card to pick the best match
        const scored = rows.map(row => {
            const card = rowToScryfallCard(row);
            const setCode = (row.set_code || '').toLowerCase();
            let score = 0;

            // Exact name match (highest priority)
            if (card.name?.toLowerCase() === queryLower) {
                score += 100;
            }
            // DFC: query matches front face
            else if (card.name?.toLowerCase().startsWith(queryLower + ' // ')) {
                score += 90;
            }

            // Deprioritize art_series cards (often have wrong metadata)
            if (card.layout === 'art_series') {
                score -= 50;
            }

            // Use collector number as final tiebreaker (lower = earlier in set = more likely main card)
            const collectorNum = parseInt(row.collector_number || '999', 10);
            if (!isNaN(collectorNum)) {
                score += (1000 - Math.min(collectorNum, 999)) / 10000; // Small tiebreaker
            }

            return { card, score, setCode };
        });

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);

        // Log summary and top 3 candidates only (not all 64 for common cards)
        debugLog(`[DB Cache] lookupCardByName("${name}", "${lang}"): ${rows.length} candidates, showing top 3`);
        for (const { card, score, setCode } of scored.slice(0, 3)) {
            debugLog(`  [→] ${score.toFixed(4)} - "${card.name}" (${setCode}:${card.collector_number})`);
        }

        const result = scored[0].card;

        // Cache the scoring result for future lookups
        scoringCache.set(cacheKey, result);

        return result;
    } catch {
        // Database might not be initialized yet, return null
        return null;
    }
}

/**
 * Insert or update a card in the database.
 * Used to cache Scryfall API responses.
 */
export function insertOrUpdateCard(card: ScryfallApiCard): void {
    try {
        const db = getDatabase();
        const stmt = db.prepare(`
      INSERT OR REPLACE INTO cards (
        id, oracle_id, name, set_code, collector_number, lang,
        colors, mana_cost, cmc, type_line, rarity, layout,
        image_uris, card_faces, all_parts
      ) VALUES (
        @id, @oracle_id, @name, @set_code, @collector_number, @lang,
        @colors, @mana_cost, @cmc, @type_line, @rarity, @layout,
        @image_uris, @card_faces, @all_parts
      )
    `);

        const cardData = {
            id: (card as CardWithId).id || `generated_${card.set}_${card.collector_number}`,
            oracle_id: (card as CardWithId).oracle_id || null,
            name: card.name || '',
            set_code: card.set || null,
            collector_number: card.collector_number || null,
            lang: card.lang || 'en',
            colors: card.colors ? JSON.stringify(card.colors) : null,
            mana_cost: card.mana_cost || null,
            cmc: card.cmc ?? null,
            type_line: card.type_line || null,
            rarity: card.rarity || null,
            layout: card.layout || null,
            image_uris: card.image_uris ? JSON.stringify(card.image_uris) : null,
            card_faces: card.card_faces ? JSON.stringify(card.card_faces) : null,
            // Store '[]' for cards without tokens so we can distinguish "never fetched" (null) from "has no tokens" ([])
            all_parts: JSON.stringify(card.all_parts || []),
        };
        stmt.run(cardData);
    } catch (error) {
        console.warn('[DB] Failed to cache card:', (error as Error).message);
    }
}
/**
 * Batch insert cards from bulk data import.
 * Uses a transaction for better performance.
 * Returns count of processed cards (INSERT OR REPLACE handles both new and updates).
 */
export function batchInsertCards(cards: ScryfallApiCard[]): { inserted: number; updated: number } {
    const db = getDatabase();
    const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO cards (
      id, oracle_id, name, set_code, collector_number, lang,
      colors, mana_cost, cmc, type_line, rarity, layout,
      image_uris, card_faces, all_parts
    ) VALUES (
      @id, @oracle_id, @name, @set_code, @collector_number, @lang,
      @colors, @mana_cost, @cmc, @type_line, @rarity, @layout,
      @image_uris, @card_faces, @all_parts
    )
  `);

    const insertMany = db.transaction((cardsToInsert: ScryfallApiCard[]) => {
        for (const card of cardsToInsert) {
            const id = (card as CardWithId).id || `generated_${card.set}_${card.collector_number}`;

            insertStmt.run({
                id,
                oracle_id: (card as CardWithId).oracle_id || null,
                name: card.name || '',
                set_code: card.set || null,
                collector_number: card.collector_number || null,
                lang: card.lang || 'en',
                colors: card.colors ? JSON.stringify(card.colors) : null,
                mana_cost: card.mana_cost || null,
                cmc: card.cmc ?? null,
                type_line: card.type_line || null,
                rarity: card.rarity || null,
                layout: card.layout || null,
                image_uris: card.image_uris ? JSON.stringify(card.image_uris) : null,
                card_faces: card.card_faces ? JSON.stringify(card.card_faces) : null,
                // Store '[]' for cards without tokens so we can distinguish "never fetched" (null) from "has no tokens" ([])
                all_parts: JSON.stringify(card.all_parts || []),
            });
        }
    });

    insertMany(cards);
    // Return total as inserted - INSERT OR REPLACE handles both cases, exact counts not critical
    return { inserted: cards.length, updated: 0 };
}

/**
 * Get the total number of cards in the database.
 */
export function getCardCount(): number {
    try {
        const db = getDatabase();
        const result = db.prepare('SELECT COUNT(*) as count FROM cards').get() as { count: number };
        return result.count;
    } catch {
        return 0;
    }
}

/**
 * Get the database file size in bytes.
 */
export function getDbSizeBytes(): number {
    try {
        const db = getDatabase();
        // SQLite page_count * page_size gives total DB size
        const pageCount = (db.prepare('PRAGMA page_count').get() as { page_count: number }).page_count;
        const pageSize = (db.prepare('PRAGMA page_size').get() as { page_size: number }).page_size;
        return pageCount * pageSize;
    } catch {
        return 0;
    }
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// --- Internal Types ---

interface CardRow {
    id: string;
    oracle_id: string | null;
    name: string;
    set_code: string | null;
    collector_number: string | null;
    lang: string;
    colors: string | null;
    mana_cost: string | null;
    cmc: number | null;
    type_line: string | null;
    rarity: string | null;
    layout: string | null;
    image_uris: string | null;
    card_faces: string | null;
    all_parts: string | null;
}

interface CardWithId extends ScryfallApiCard {
    id?: string;
    oracle_id?: string;
}

/**
 * Convert a database row to ScryfallApiCard format.
 */
function rowToScryfallCard(row: CardRow): ScryfallApiCard {
    return {
        name: row.name,
        set: row.set_code || undefined,
        collector_number: row.collector_number || undefined,
        lang: row.lang,
        colors: row.colors ? JSON.parse(row.colors) : undefined,
        mana_cost: row.mana_cost || undefined,
        cmc: row.cmc ?? undefined,
        type_line: row.type_line || undefined,
        rarity: row.rarity || undefined,
        layout: row.layout || undefined,
        image_uris: row.image_uris ? JSON.parse(row.image_uris) : undefined,
        card_faces: row.card_faces ? JSON.parse(row.card_faces) : undefined,
        all_parts: row.all_parts ? JSON.parse(row.all_parts) : undefined,
    };
}
