import { describe, beforeEach, afterEach, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

// We need to test the actual implementation
// Create a test database in temp location
const TEST_DB_PATH = path.join(os.tmpdir(), 'test-proxxied-cards.db');

describe('Database Layer', () => {
    let db: Database.Database;

    beforeEach(() => {
        // Create a fresh test database
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
        if (fs.existsSync(TEST_DB_PATH + '-wal')) {
            fs.unlinkSync(TEST_DB_PATH + '-wal');
        }
        if (fs.existsSync(TEST_DB_PATH + '-shm')) {
            fs.unlinkSync(TEST_DB_PATH + '-shm');
        }

        db = new Database(TEST_DB_PATH);
        db.pragma('journal_mode = WAL');

        // Create tables
        db.exec(`
            CREATE TABLE IF NOT EXISTS cards (
                id TEXT PRIMARY KEY,
                oracle_id TEXT,
                name TEXT NOT NULL,
                set_code TEXT,
                collector_number TEXT,
                lang TEXT DEFAULT 'en',
                colors TEXT,
                mana_cost TEXT,
                cmc REAL,
                type_line TEXT,
                rarity TEXT,
                layout TEXT,
                image_uris TEXT,
                card_faces TEXT,
                updated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name COLLATE NOCASE);
            CREATE INDEX IF NOT EXISTS idx_cards_set_number ON cards(set_code, collector_number);
        `);
    });

    afterEach(() => {
        if (db) {
            db.close();
        }
        // Cleanup
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
        if (fs.existsSync(TEST_DB_PATH + '-wal')) {
            fs.unlinkSync(TEST_DB_PATH + '-wal');
        }
        if (fs.existsSync(TEST_DB_PATH + '-shm')) {
            fs.unlinkSync(TEST_DB_PATH + '-shm');
        }
    });

    describe('Card Insertion', () => {
        it('should insert a new card', () => {
            const stmt = db.prepare(`
                INSERT INTO cards (id, name, set_code, collector_number, lang)
                VALUES (?, ?, ?, ?, ?)
            `);
            stmt.run('test-id-1', 'Lightning Bolt', 'leb', '162', 'en');

            const result = db.prepare('SELECT * FROM cards WHERE id = ?').get('test-id-1') as { name: string };
            expect(result.name).toBe('Lightning Bolt');
        });

        it('should update existing card with INSERT OR REPLACE', () => {
            const stmt = db.prepare(`
                INSERT OR REPLACE INTO cards (id, name, set_code, collector_number, lang, rarity)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            stmt.run('test-id-1', 'Lightning Bolt', 'leb', '162', 'en', 'common');
            stmt.run('test-id-1', 'Lightning Bolt', 'leb', '162', 'en', 'rare');

            const count = (db.prepare('SELECT COUNT(*) as count FROM cards').get() as { count: number }).count;
            expect(count).toBe(1);

            const result = db.prepare('SELECT * FROM cards WHERE id = ?').get('test-id-1') as { rarity: string };
            expect(result.rarity).toBe('rare');
        });
    });

    describe('Card Lookup', () => {
        beforeEach(() => {
            // Insert test cards
            const stmt = db.prepare(`
                INSERT INTO cards (id, name, set_code, collector_number, lang, image_uris)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            stmt.run('id-1', 'Sol Ring', 'cmr', '332', 'en', '{"png":"http://example.com/sol.png"}');
            stmt.run('id-2', 'Bala Ged Recovery // Bala Ged Sanctuary', 'znr', '180', 'en', null);
            stmt.run('id-3', 'Sol Ring', 'c21', '289', 'en', '{"png":"http://example.com/sol-c21.png"}');
            stmt.run('id-4', 'Gala Greeters', 'snc', '459', 'ru', '{"png":"http://example.com/gala-ru.png"}');
        });

        it('should find card by set and collector number', () => {
            const result = db.prepare(`
                SELECT * FROM cards WHERE set_code = ? AND collector_number = ?
            `).get('cmr', '332') as { name: string };

            expect(result.name).toBe('Sol Ring');
        });

        it('should find card by name (case insensitive)', () => {
            const result = db.prepare(`
                SELECT * FROM cards WHERE name = ? COLLATE NOCASE LIMIT 1
            `).get('sol ring') as { set_code: string };

            expect(result).toBeDefined();
            expect(result.set_code).toBe('cmr');
        });

        it('should find DFC by partial name with LIKE', () => {
            const result = db.prepare(`
                SELECT * FROM cards WHERE name LIKE ? COLLATE NOCASE LIMIT 1
            `).get('Bala Ged Recovery //%') as { name: string };

            expect(result).toBeDefined();
            expect(result.name).toBe('Bala Ged Recovery // Bala Ged Sanctuary');
        });

        it('should find card by set and collector number with correct language', () => {
            const result = db.prepare(`
                SELECT * FROM cards WHERE set_code = ? AND collector_number = ? AND lang = ?
            `).get('snc', '459', 'ru') as { name: string; lang: string };

            expect(result.name).toBe('Gala Greeters');
            expect(result.lang).toBe('ru');
        });

        it('should NOT find card if language does not match', () => {
            const result = db.prepare(`
                SELECT * FROM cards WHERE set_code = ? AND collector_number = ? AND lang = ?
            `).get('snc', '459', 'en');

            expect(result).toBeUndefined();
        });
    });

    describe('Batch Operations', () => {
        it('should insert multiple cards in a transaction', () => {
            const insertStmt = db.prepare(`
                INSERT INTO cards (id, name, set_code, collector_number, lang)
                VALUES (?, ?, ?, ?, ?)
            `);

            const insertMany = db.transaction((cards: Array<{ id: string; name: string; set: string; num: string }>) => {
                for (const card of cards) {
                    insertStmt.run(card.id, card.name, card.set, card.num, 'en');
                }
            });

            const cards = [
                { id: 'b1', name: 'Card 1', set: 'set1', num: '1' },
                { id: 'b2', name: 'Card 2', set: 'set1', num: '2' },
                { id: 'b3', name: 'Card 3', set: 'set1', num: '3' },
            ];

            insertMany(cards);

            const count = (db.prepare('SELECT COUNT(*) as count FROM cards').get() as { count: number }).count;
            expect(count).toBe(3);
        });
    });

    describe('Metadata Table', () => {
        it('should store and retrieve metadata', () => {
            db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run('last_import', '2024-01-01T00:00:00Z');

            const result = db.prepare('SELECT value FROM metadata WHERE key = ?').get('last_import') as { value: string };
            expect(result.value).toBe('2024-01-01T00:00:00Z');
        });

        it('should update existing metadata', () => {
            db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run('last_import', '2024-01-01T00:00:00Z');
            db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run('last_import', '2024-02-01T00:00:00Z');

            const result = db.prepare('SELECT value FROM metadata WHERE key = ?').get('last_import') as { value: string };
            expect(result.value).toBe('2024-02-01T00:00:00Z');
        });
    });

    describe('Database Size', () => {
        it('should calculate database size in bytes', () => {
            const pageCount = (db.prepare('PRAGMA page_count').get() as { page_count: number }).page_count;
            const pageSize = (db.prepare('PRAGMA page_size').get() as { page_size: number }).page_size;
            const sizeBytes = pageCount * pageSize;

            expect(sizeBytes).toBeGreaterThan(0);
        });
    });

    describe('PRAGMA Optimizations', () => {
        it('should have WAL mode enabled', () => {
            const result = db.pragma('journal_mode') as { journal_mode: string }[];
            expect(result[0].journal_mode).toBe('wal');
        });

        it('should support synchronous = NORMAL setting', () => {
            // Set and verify synchronous mode
            // NORMAL = 1, FULL = 2, OFF = 0
            db.pragma('synchronous = NORMAL');
            const result = db.pragma('synchronous') as { synchronous: number }[];
            expect(result[0].synchronous).toBe(1); // NORMAL = 1
        });

        it('should support temp_store = MEMORY setting', () => {
            // MEMORY = 2, FILE = 1, DEFAULT = 0
            db.pragma('temp_store = MEMORY');
            const result = db.pragma('temp_store') as { temp_store: number }[];
            expect(result[0].temp_store).toBe(2); // MEMORY = 2
        });

        it('should support mmap_size setting', () => {
            const mmapSize = 268435456; // 256MB
            db.pragma(`mmap_size = ${mmapSize}`);
            const result = db.pragma('mmap_size') as { mmap_size: number }[];
            expect(result[0].mmap_size).toBe(mmapSize);
        });
    });
});
