/**
 * Tests for MPC Search Cache functionality
 */
import { describe, beforeEach, afterEach, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Test database path
const TEST_DB_PATH = path.join(os.tmpdir(), 'test-mpc-cache.db');

describe('MPC Search Cache', () => {
    let db: Database.Database;

    beforeEach(() => {
        // Clean up any existing test database
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }

        // Create a fresh test database with cache table
        db = new Database(TEST_DB_PATH);
        db.pragma('journal_mode = WAL');

        db.exec(`
            CREATE TABLE IF NOT EXISTS mpc_search_cache (
                query TEXT NOT NULL,
                card_type TEXT NOT NULL,
                results_json TEXT NOT NULL,
                cached_at INTEGER NOT NULL,
                PRIMARY KEY (query, card_type)
            );
        `);
    });

    afterEach(() => {
        if (db) {
            db.close();
        }
        // Cleanup test files
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

    it('should insert and retrieve cached results', () => {
        const query = 'lightning bolt';
        const cardType = 'CARD';
        const results = [{ identifier: 'abc123', name: 'Lightning Bolt' }];
        const now = Date.now();

        // Insert cache entry
        db.prepare(`
            INSERT INTO mpc_search_cache (query, card_type, results_json, cached_at)
            VALUES (?, ?, ?, ?)
        `).run(query, cardType, JSON.stringify(results), now);

        // Retrieve cache entry
        const row = db.prepare(
            'SELECT results_json FROM mpc_search_cache WHERE query = ? AND card_type = ?'
        ).get(query, cardType) as { results_json: string } | undefined;

        expect(row).toBeDefined();
        expect(JSON.parse(row!.results_json)).toEqual(results);
    });

    it('should update existing cache entry on replace', () => {
        const query = 'sol ring';
        const cardType = 'CARD';
        const oldResults = [{ identifier: 'old', name: 'Old' }];
        const newResults = [{ identifier: 'new', name: 'New' }];
        const now = Date.now();

        // Insert initial entry
        db.prepare(`
            INSERT INTO mpc_search_cache (query, card_type, results_json, cached_at)
            VALUES (?, ?, ?, ?)
        `).run(query, cardType, JSON.stringify(oldResults), now - 10000);

        // Replace with new entry
        db.prepare(`
            INSERT OR REPLACE INTO mpc_search_cache (query, card_type, results_json, cached_at)
            VALUES (?, ?, ?, ?)
        `).run(query, cardType, JSON.stringify(newResults), now);

        // Verify only one entry exists with new data
        const count = (db.prepare('SELECT COUNT(*) as count FROM mpc_search_cache').get() as { count: number }).count;
        expect(count).toBe(1);

        const row = db.prepare(
            'SELECT results_json FROM mpc_search_cache WHERE query = ? AND card_type = ?'
        ).get(query, cardType) as { results_json: string };

        expect(JSON.parse(row.results_json)).toEqual(newResults);
    });

    it('should delete expired entries', () => {
        const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
        const now = Date.now();

        // Insert fresh entry
        db.prepare(`
            INSERT INTO mpc_search_cache (query, card_type, results_json, cached_at)
            VALUES (?, ?, ?, ?)
        `).run('fresh', 'CARD', '[]', now);

        // Insert expired entry
        db.prepare(`
            INSERT INTO mpc_search_cache (query, card_type, results_json, cached_at)
            VALUES (?, ?, ?, ?)
        `).run('expired', 'CARD', '[]', now - TTL_MS - 1000);

        // Delete expired
        const expiryTime = now - TTL_MS;
        db.prepare('DELETE FROM mpc_search_cache WHERE cached_at < ?').run(expiryTime);

        // Verify only fresh entry remains
        const count = (db.prepare('SELECT COUNT(*) as count FROM mpc_search_cache').get() as { count: number }).count;
        expect(count).toBe(1);

        const row = db.prepare('SELECT query FROM mpc_search_cache').get() as { query: string };
        expect(row.query).toBe('fresh');
    });

    it('should trim oldest entries when over limit', () => {
        const MAX_ENTRIES = 3;
        const now = Date.now();

        // Insert entries with varying timestamps
        for (let i = 0; i < 5; i++) {
            db.prepare(`
                INSERT INTO mpc_search_cache (query, card_type, results_json, cached_at)
                VALUES (?, ?, ?, ?)
            `).run(`query${i}`, 'CARD', '[]', now - (10000 * (5 - i))); // oldest first
        }

        // Verify we have 5 entries
        let count = (db.prepare('SELECT COUNT(*) as count FROM mpc_search_cache').get() as { count: number }).count;
        expect(count).toBe(5);

        // Trim to max entries (delete oldest)
        const toDelete = count - MAX_ENTRIES;
        if (toDelete > 0) {
            db.prepare(`
                DELETE FROM mpc_search_cache WHERE rowid IN (
                    SELECT rowid FROM mpc_search_cache ORDER BY cached_at ASC LIMIT ?
                )
            `).run(toDelete);
        }

        // Verify we only have MAX_ENTRIES left
        count = (db.prepare('SELECT COUNT(*) as count FROM mpc_search_cache').get() as { count: number }).count;
        expect(count).toBe(MAX_ENTRIES);

        // Verify the oldest entries were deleted (query0, query1)
        const remaining = db.prepare('SELECT query FROM mpc_search_cache ORDER BY cached_at ASC').all() as { query: string }[];
        expect(remaining.map(r => r.query)).toEqual(['query2', 'query3', 'query4']);
    });
});
