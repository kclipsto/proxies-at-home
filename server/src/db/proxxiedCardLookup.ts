import { getDatabase } from './db.js';
import { debugLog } from '../utils/debug.js';
import type { ScryfallApiCard } from '../utils/getCardImagesPaged.js';

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
        const db = getDatabase();
        // Set + collector_number uniquely identifies a card printing
        // The language is determined by the printing itself, not requested
        const stmt = db.prepare(`
      SELECT * FROM cards 
      WHERE set_code = ? AND collector_number = ?
      LIMIT 1
    `);
        const row = stmt.get(setCode.toLowerCase(), collectorNumber) as CardRow | undefined;
        return row ? rowToScryfallCard(row) : null;
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
        const db = getDatabase();
        const queryLower = name.toLowerCase();

        // Get all exact name matches
        const exactStmt = db.prepare(`
            SELECT * FROM cards 
            WHERE name = ? COLLATE NOCASE AND lang = ?
        `);
        let rows = exactStmt.all(name, lang.toLowerCase()) as CardRow[];

        // If no exact matches, try DFC front face matching
        // e.g., "Bala Ged Recovery" should match "Bala Ged Recovery // Bala Ged Sanctuary"
        if (rows.length === 0) {
            const likeStmt = db.prepare(`
                SELECT * FROM cards 
                WHERE name LIKE ? COLLATE NOCASE AND lang = ?
            `);
            rows = likeStmt.all(`${name} //%`, lang.toLowerCase()) as CardRow[];
        }

        if (rows.length === 0) {
            debugLog(`[DB Cache] lookupCardByName("${name}", "${lang}"): Not found`);
            return null;
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

            debugLog(`[DB Cache] Scoring "${card.name}" (${setCode}:${row.collector_number}): ${score.toFixed(2)}`);
            return { card, score, setCode };
        });

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);

        // Log all candidates with their scores
        debugLog(`[DB Cache] lookupCardByName("${name}", "${lang}"): ${rows.length} candidates found`);
        for (const { card, score, setCode } of scored) {
            debugLog(`  [${score >= scored[0].score ? '→' : ' '}] ${score.toFixed(4)} - "${card.name}" (${setCode}:${card.collector_number}) layout=${card.layout || 'normal'}`);
        }

        const result = scored[0].card;
        debugLog(`[DB Cache] Selected: "${result.name}" (${scored[0].setCode}:${result.collector_number}) with score ${scored[0].score.toFixed(4)}`);
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
            all_parts: card.all_parts ? JSON.stringify(card.all_parts) : null,
        };
        stmt.run(cardData);
    } catch (error) {
        console.warn('[DB] Failed to cache card:', (error as Error).message);
    }
}
/**
 * Batch insert cards from bulk data import.
 * Uses a transaction for better performance.
 * Returns counts of new and updated cards.
 */
export function batchInsertCards(cards: ScryfallApiCard[]): { inserted: number; updated: number } {
    const db = getDatabase();
    const checkStmt = db.prepare('SELECT id FROM cards WHERE id = ?');
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

    let insertedCount = 0;
    let updatedCount = 0;

    const insertMany = db.transaction((cardsToInsert: ScryfallApiCard[]) => {
        for (const card of cardsToInsert) {
            const id = (card as CardWithId).id || `generated_${card.set}_${card.collector_number}`;

            // Check if exists for logging purposes
            const exists = checkStmt.get(id);

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
                all_parts: card.all_parts ? JSON.stringify(card.all_parts) : null,
            });

            if (exists) {
                updatedCount++;
            } else {
                insertedCount++;
            }
        }
    });

    insertMany(cards);
    return { inserted: insertedCount, updated: updatedCount };
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
