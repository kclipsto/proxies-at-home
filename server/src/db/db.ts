import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file location (persists in server/data directory)
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'proxxied-cards.db');

// Current schema version - increment when adding migrations
const CURRENT_DB_VERSION = 3;

// Migration definitions - each entry upgrades from (version-1) to (version)
// Add new migrations to the end of this array
interface Migration {
  version: number;
  description: string;
  up: string[];
}

// Version 1 is the initial schema (created in initDatabase)
// 
// =====================================================================
// HOW TO ADD A NEW MIGRATION:
// =====================================================================
// 1. Increment CURRENT_DB_VERSION above (e.g., from 1 to 2)
// 2. Add a new migration object to this array with:
//    - version: the new version number (must match CURRENT_DB_VERSION)
//    - description: human-readable description of the change
//    - up: array of SQL statements to apply the migration
//
// Example - adding a new column:
// {
//   version: 2,
//   description: 'Add foil column to cards table',
//   up: ['ALTER TABLE cards ADD COLUMN foil INTEGER DEFAULT 0;']
// },
//
// Example - adding multiple changes:
// {
//   version: 3,
//   description: 'Add price tracking',
//   up: [
//     'ALTER TABLE cards ADD COLUMN price_usd REAL;',
//     'ALTER TABLE cards ADD COLUMN price_updated_at TEXT;',
//     'CREATE INDEX IF NOT EXISTS idx_cards_price ON cards(price_usd);',
//   ]
// },
//
// IMPORTANT: Never modify existing migrations after they've been deployed!
//
// ALTERNATIVE: If manual migrations become burdensome, consider Drizzle ORM
// (https://orm.drizzle.team). Drizzle can auto-generate migrations from a
// declarative schema. However, it adds dependencies and build complexity.
// For simple schemas like this one, manual migrations are often simpler.
// =====================================================================
const migrations: Migration[] = [
  {
    version: 2,
    description: 'Add scryfall_cache table for API response caching',
    up: [
      `CREATE TABLE IF NOT EXISTS scryfall_cache (
        endpoint TEXT NOT NULL,
        query_hash TEXT NOT NULL,
        response TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        PRIMARY KEY (endpoint, query_hash)
      );`,
      'CREATE INDEX IF NOT EXISTS idx_scryfall_cache_expires ON scryfall_cache(expires_at);',
    ],
  },
  {
    version: 3,
    description: 'Add all_parts column for token data',
    up: [
      'ALTER TABLE cards ADD COLUMN all_parts TEXT;',
    ],
  },
];

let db: Database.Database | null = null;

/**
 * Run any pending migrations to bring database up to current version.
 */
function runMigrations(database: Database.Database): void {
  // Get current version from metadata table
  const row = database.prepare('SELECT value FROM metadata WHERE key = ?').get('schema_version') as { value: string } | undefined;
  const currentVersion = row ? parseInt(row.value, 10) : 0;

  if (currentVersion === 0) {
    // Fresh database - set to current version (no migrations needed)
    database.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run('schema_version', CURRENT_DB_VERSION.toString());
    console.log(`[DB] Initialized schema version ${CURRENT_DB_VERSION}`);
    return;
  }

  if (currentVersion === CURRENT_DB_VERSION) {
    console.log(`[DB] Schema is up to date (version ${currentVersion})`);
    return;
  }

  if (currentVersion > CURRENT_DB_VERSION) {
    console.warn(`[DB] Warning: Database schema version ${currentVersion} is newer than code version ${CURRENT_DB_VERSION}. This may cause issues.`);
    return;
  }

  // Run migrations in order
  console.log(`[DB] Migrating from version ${currentVersion} to ${CURRENT_DB_VERSION}...`);

  for (const migration of migrations) {
    if (migration.version > currentVersion && migration.version <= CURRENT_DB_VERSION) {
      console.log(`[DB] Applying migration ${migration.version}: ${migration.description}`);
      try {
        database.transaction(() => {
          for (const sql of migration.up) {
            database.exec(sql);
          }
          database.prepare('UPDATE metadata SET value = ? WHERE key = ?').run(migration.version.toString(), 'schema_version');
        })();
        console.log(`[DB] Migration ${migration.version} complete`);
      } catch (error) {
        console.error(`[DB] Migration ${migration.version} failed:`, error);
        throw error;
      }
    }
  }

  console.log(`[DB] All migrations complete. Now at version ${CURRENT_DB_VERSION}`);
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
      
      -- Image data
      image_uris TEXT,                  -- JSON: { "png": "https://...", ... }
      card_faces TEXT,                  -- JSON array for DFCs
      all_parts TEXT,                   -- JSON array for related cards/tokens
      
      -- Sync tracking
      updated_at TEXT                   -- ISO timestamp for incremental updates
    );

    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS mpc_search_cache (
      query TEXT NOT NULL,
      card_type TEXT NOT NULL,
      results_json TEXT NOT NULL,
      cached_at INTEGER NOT NULL,
      PRIMARY KEY (query, card_type)
    );
  `);

  // Create indexes (IF NOT EXISTS for idempotency)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_cards_set_number ON cards(set_code, collector_number);
    CREATE INDEX IF NOT EXISTS idx_cards_set_number_lang ON cards(set_code, collector_number, lang);
    CREATE INDEX IF NOT EXISTS idx_cards_name_lang ON cards(name COLLATE NOCASE, lang);
    CREATE INDEX IF NOT EXISTS idx_mpc_cache_time ON mpc_search_cache(cached_at);
  `);

  // Run any pending migrations
  runMigrations(db);

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

/**
 * Clear all cached cards from the database.
 * Useful for forcing fresh fetches from Scryfall.
 */
export function clearCardsCache(): number {
  const database = getDatabase();
  const result = database.prepare('DELETE FROM cards').run();
  console.log(`[DB] Cleared ${result.changes} cached cards`);
  return result.changes;
}
