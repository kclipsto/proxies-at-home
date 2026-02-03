import axios from "axios";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import StreamJsonParser from "stream-json";
import StreamArray from "stream-json/streamers/StreamArray.js";
import { getDatabase } from "../db/db.js";
import { batchInsertCards, getCardCount } from "../db/proxxiedCardLookup.js";
import {
  parseTypeLine,
  batchInsertCardTypes,
  batchInsertTokenNames,
} from "../utils/scryfallCatalog.js";
import type { ScryfallApiCard } from "../utils/getCardImagesPaged.js";
import { debugLog } from "../utils/debug.js";

// Use all-cards bulk data for broad coverage on set+number lookups.
// Name-only queries bypass this cache and use live Scryfall API search with scoring.
const BULK_DATA_API = "https://api.scryfall.com/bulk-data/all-cards";
const BATCH_SIZE = 10000;

interface BulkDataInfo {
  download_uri: string;
  size: number;
}

/**
 * Fetch the current bulk data download URL from Scryfall API.
 */
export async function getBulkDataInfo(): Promise<BulkDataInfo> {
  const response = await axios.get<BulkDataInfo>(BULK_DATA_API, {
    headers: { "User-Agent": "Proxxied/1.0" },
  });
  return response.data;
}

/**
 * Get the last import timestamp from the metadata table.
 */
export function getLastImportTime(): string | null {
  try {
    const db = getDatabase();
    const result = db
      .prepare("SELECT value FROM metadata WHERE key = ?")
      .get("last_import") as { value: string } | undefined;
    return result?.value || null;
  } catch {
    return null;
  }
}

/**
 * Set the last import timestamp in the metadata table.
 */
function setLastImportTime(timestamp: string): void {
  const db = getDatabase();
  db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)").run(
    "last_import",
    timestamp
  );
}

/**
 * Check if we should perform a bulk import.
 * Returns true if last import was more than 7 days ago or never happened.
 */
export function shouldImport(): boolean {
  const lastImport = getLastImportTime();
  if (!lastImport) return true;

  const lastImportDate = new Date(lastImport);
  const now = new Date();
  const daysSinceImport =
    (now.getTime() - lastImportDate.getTime()) / (1000 * 60 * 60 * 24);

  return daysSinceImport > 7;
}

/**
 * Download and import bulk data from Scryfall.
 * Uses streaming to avoid loading the entire file into memory.
 * Always downloads and processes - no skip logic for simplicity.
 */
export async function downloadAndImportBulkData(): Promise<{
  cardsImported: number;
  cardsNew: number;
  cardsUpdated: number;
  durationMs: number;
}> {
  const startTime = Date.now();
  debugLog("[Bulk Import] Starting bulk data import...");

  // Get bulk data info
  const bulkInfo = await getBulkDataInfo();
  debugLog(`[Bulk Import] Downloading from: ${bulkInfo.download_uri}`);
  debugLog(
    `[Bulk Import] File size: ${(bulkInfo.size / 1024 / 1024).toFixed(1)} MB`
  );

  // Download as a stream (no file stored to disk)
  const response = await axios.get(bulkInfo.download_uri, {
    responseType: "stream",
    headers: { "User-Agent": "Proxxied/1.0" },
  });

  let cardsProcessed = 0;
  let batch: ScryfallApiCard[] = [];
  let typeEntries: Array<{ cardId: string; type: string; isToken: boolean }> = [];
  let tokenNames: string[] = [];
  let totalInserted = 0;
  let totalUpdated = 0;

  // Create a transform pipeline to parse the JSON stream
  const jsonParser = StreamJsonParser.parser();
  const arrayStreamer = StreamArray.streamArray();

  // Handle stream parsing errors
  let streamError: Error | null = null;
  arrayStreamer.on("error", (err: Error) => {
    console.error("[Bulk Import] Stream parse error:", err.message);
    streamError = err;
  });

  // Process cards as they come in
  arrayStreamer.on("data", ({ value }: { value: ScryfallBulkCard }) => {
    // Convert bulk card format to our ScryfallApiCard format
    const card = convertBulkCard(value);
    batch.push(card);
    cardsProcessed++;

    // Parse and index types for fast lookups
    const types = parseTypeLine(value.type_line || "");
    const isToken = types.includes("token");

    for (const type of types) {
      typeEntries.push({ cardId: value.id, type, isToken });
    }

    // Register token names for t: prefix detection
    if (isToken) {
      tokenNames.push(value.name);
    }

    // Insert in batches for better performance
    if (batch.length >= BATCH_SIZE) {
      const result = batchInsertCards(batch);
      totalInserted += result.inserted;
      totalUpdated += result.updated;

      // Batch insert auxiliary data
      batchInsertCardTypes(typeEntries);
      batchInsertTokenNames(tokenNames);

      batch = [];
      typeEntries = [];
      tokenNames = [];

      if (cardsProcessed % BATCH_SIZE === 0) {
        debugLog(
          `[Bulk Import] Processed ${cardsProcessed} cards... (${totalInserted} new, ${totalUpdated} updated)`
        );
      }
    }
  });

  // Wait for the stream to complete
  await pipeline(response.data as Readable, jsonParser, arrayStreamer);

  // Check if stream had parsing errors
  if (streamError) {
    throw streamError;
  }

  // Insert any remaining cards
  if (batch.length > 0) {
    const result = batchInsertCards(batch);
    totalInserted += result.inserted;
    totalUpdated += result.updated;

    batchInsertCardTypes(typeEntries);
    batchInsertTokenNames(tokenNames);
  }

  // Update last import time
  setLastImportTime(new Date().toISOString());

  const durationMs = Date.now() - startTime;
  debugLog(
    `[Bulk Import] Complete! Processed ${cardsProcessed} cards in ${(durationMs / 1000).toFixed(1)}s`
  );
  debugLog(
    `[Bulk Import]   └─ ${totalInserted} new, ${totalUpdated} updated`
  );
  debugLog(`[Bulk Import] Total cards in database: ${getCardCount()}`);

  return {
    cardsImported: cardsProcessed,
    cardsNew: totalInserted,
    cardsUpdated: totalUpdated,
    durationMs,
  };
}

// --- Internal Types and Helpers ---

interface ScryfallBulkCard {
  id: string;
  oracle_id?: string;
  name: string;
  set: string;
  collector_number: string;
  lang: string;
  colors?: string[];
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  rarity?: string;
  layout?: string;
  image_uris?: { png?: string;[key: string]: string | undefined };
  card_faces?: Array<{
    name?: string;
    colors?: string[];
    mana_cost?: string;
    image_uris?: { png?: string;[key: string]: string | undefined };
  }>;
  all_parts?: Array<{
    id?: string;
    component?: string;
    name?: string;
    type_line?: string;
    uri?: string;
  }>;
}

/**
 * Convert a Scryfall bulk data card to our internal format.
 */
function convertBulkCard(
  bulk: ScryfallBulkCard
): ScryfallApiCard & { id: string } {
  return {
    id: bulk.id,
    oracle_id: bulk.oracle_id,
    name: bulk.name,
    set: bulk.set,
    collector_number: bulk.collector_number,
    lang: bulk.lang,
    colors: bulk.colors,
    mana_cost: bulk.mana_cost,
    cmc: bulk.cmc,
    type_line: bulk.type_line,
    rarity: bulk.rarity,
    layout: bulk.layout,
    image_uris: bulk.image_uris,
    card_faces: bulk.card_faces,
    all_parts: bulk.all_parts,
  };
}
