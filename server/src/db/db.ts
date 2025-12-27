import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file location (persists in server directory)
const DB_PATH = path.join(__dirname, '..', 'proxxied-cards.db');

let db: Database.Database | null = null;

/**
 * Ensure a column exists (idempotent add).
 */
function ensureColumn(table: string, column: string, type: string): void {
    if (!db) return;
    const info = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!info.some((c) => c.name === column)) {
        db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
    }
}

/**
 * Initialize the SQLite database and create tables if they don't exist.
 */
export function initDatabase(): Database.Database {
    if (db) return db;

    db = new Database(DB_PATH);

    // Enable WAL mode for better concurrent read/write performance
    db.pragma('journal_mode = WAL');

    // Create cards table
    db.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      -- Core identifiers
      id TEXT PRIMARY KEY,              -- Scryfall UUID
      oracle_id TEXT,                   -- Groups all printings of same card
      name TEXT NOT NULL,               -- Full name (e.g., "Bala Ged Recovery // Bala Ged Sanctuary")
      
      -- Printing info
      set_code TEXT,                    -- Set code (e.g., "znr")
      collector_number TEXT,            -- Collector number (e.g., "180")
      lang TEXT DEFAULT 'en',           -- Language code
      
      -- Metadata (for enrichment)
      colors TEXT,                      -- JSON array: ["W", "U", "B", "R", "G"]
      mana_cost TEXT,                   -- e.g., "{2}{G}"
      cmc REAL,                         -- Converted mana cost
      type_line TEXT,                   -- e.g., "Sorcery // Land"
      rarity TEXT,                      -- common, uncommon, rare, mythic
      layout TEXT,                      -- normal, transform, mdfc, split, etc.
      all_parts TEXT,                   -- JSON array of related parts (tokens/emblems/etc.)
      
      -- Image data
      image_uris TEXT,                  -- JSON: { "png": "https://...", ... }
      card_faces TEXT,                  -- JSON array for DFCs
      
      -- Sync tracking
      updated_at TEXT                   -- ISO timestamp for incremental updates
    );

    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

    // Backfill new columns for existing installs
    ensureColumn('cards', 'all_parts', 'TEXT');

    // Create indexes (IF NOT EXISTS for idempotency)
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_cards_set_number ON cards(set_code, collector_number);
    CREATE INDEX IF NOT EXISTS idx_cards_set_number_lang ON cards(set_code, collector_number, lang);
    CREATE INDEX IF NOT EXISTS idx_cards_name_lang ON cards(name COLLATE NOCASE, lang);
  `);

    console.log('[DB] SQLite database initialized at', DB_PATH);
    return db;
}

/**
 * Get the database instance. Throws if not initialized.
 */
export function getDatabase(): Database.Database {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}

/**
 * Close the database connection (for clean shutdown).
 */
export function closeDatabase(): void {
    if (db) {
        db.close();
        db = null;
        console.log('[DB] Database connection closed.');
    }
}
