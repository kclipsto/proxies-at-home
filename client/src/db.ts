import Dexie, { type Table } from 'dexie';
import type { CardOption, PrintInfo } from '@/types';

// Image source types for explicit tracking
export type ImageSource = 'mpc' | 'scryfall' | 'custom' | 'cardback';

// Define a type for the image data to be stored
export interface Image {
  id: string; // hash for custom, URL for scryfall
  refCount: number;
  source?: ImageSource; // Explicit source tracking (lazy-migrated from ID parsing)
  originalBlob?: Blob;

  // Normal (non-darkened) versions
  displayBlob?: Blob;
  displayDpi?: number;
  displayBleedWidth?: number;

  exportBlob?: Blob;
  exportDpi?: number;
  exportBleedWidth?: number;

  // Generation Metadata (for invalidating cache on setting changes)
  generatedHasBuiltInBleed?: boolean;
  generatedBleedMode?: string;

  // Darkened versions for each mode (instant toggle)
  // Mode 1: Darken All (legacy threshold)
  displayBlobDarkenAll?: Blob;
  exportBlobDarkenAll?: Blob;
  // Mode 2: Contrast Edges (adaptive edge-only)
  displayBlobContrastEdges?: Blob;
  exportBlobContrastEdges?: Blob;
  // Mode 3: Contrast Full (adaptive full-card)
  displayBlobContrastFull?: Blob;
  exportBlobContrastFull?: Blob;
  // Legacy field for backwards compatibility (maps to contrast-edges)
  displayBlobDarkened?: Blob;
  exportBlobDarkened?: Blob;

  // For Card Editor (M1) and Full Canvas (M2)
  baseDisplayBlob?: Blob;      // Processed image, NO darkening applied
  baseExportBlob?: Blob;       // Same but export resolution
  distanceFieldBlob?: Blob;    // Edge distance texture from JFA
  darknessFactor?: number;     // 0-1, pre-computed from histogram

  sourceUrl?: string;
  imageUrls?: string[];

  // Per-print metadata for artwork selection
  prints?: PrintInfo[];
}

// Cardback library images (separate from card images)
// Note: Cardbacks don't need refCount - they're only deleted explicitly via UI
export interface Cardback {
  id: string;
  originalBlob?: Blob;

  // Processed versions
  displayBlob?: Blob;
  exportBlob?: Blob;
  exportBleedWidth?: number;

  // Darkened versions for each mode
  displayBlobDarkenAll?: Blob;
  exportBlobDarkenAll?: Blob;
  displayBlobContrastEdges?: Blob;
  exportBlobContrastEdges?: Blob;
  displayBlobContrastFull?: Blob;
  exportBlobContrastFull?: Blob;
  // Legacy field for backwards compatibility
  displayBlobDarkened?: Blob;
  exportBlobDarkened?: Blob;

  // Generation metadata
  generatedHasBuiltInBleed?: boolean;
  generatedBleedMode?: string;

  // Source and display
  sourceUrl?: string;
  displayName?: string;
  hasBuiltInBleed?: boolean;
}


export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export interface Setting {
  id: string;
  value: Json;
}

// Persistent image cache for long-term storage (survives card clearing)
export interface CachedImage {
  url: string;        // Primary key - the source URL
  blob: Blob;         // Original unprocessed image
  cachedAt: number;   // Timestamp for TTL calculation (last accessed)
  size: number;       // Size in bytes
}

// Pre-rendered effect cache for cards with overrides (holo, brightness, etc.)
export interface EffectCacheEntry {
  key: string;        // imageId + hash(overrides)
  blob: Blob;         // Pre-rendered export image
  size: number;       // Size in bytes
  cachedAt: number;   // For LRU eviction
}

class ProxxiedDexie extends Dexie {
  // 'cards' is the name of the table
  // '&uuid' makes 'uuid' a unique index and primary key
  // 'name, set, number' creates indexes for efficient lookup
  cards!: Table<CardOption, string>;

  // 'cardImages' table to store image blobs
  // '&uuid' makes 'uuid' a unique index and primary key
  images!: Table<Image, string>;

  // Cardbacks table - persists across card clears
  cardbacks!: Table<Cardback, string>;

  settings!: Table<Setting, string>;

  // Persistent image cache - survives card clearing, has TTL
  imageCache!: Table<CachedImage, string>;

  // Persistent metadata cache
  cardMetadataCache!: Table<CachedMetadata, string>;

  // Pre-rendered effect cache (for cards with overrides)
  effectCache!: Table<EffectCacheEntry, string>;

  // MPC search cache - persists for 1 week
  mpcSearchCache!: Table<MpcSearchCacheEntry, [string, string]>;


  constructor() {
    super('ProxxiedDB');
    this.version(1).stores({
      cards: '&uuid, imageId, order, name',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      settings: '&id',
    });
    // Version 2: Add darkened blob fields (no schema change needed, just new optional fields)
    this.version(2).stores({
      cards: '&uuid, imageId, order, name',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      settings: '&id',
    });
    // Version 3: Add needsEnrichment index for efficient querying of unenriched cards
    this.version(3).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      settings: '&id',
    });
    // Version 4: Add imageCache table for persistent image caching across sessions
    this.version(4).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      settings: '&id',
      imageCache: '&url, cachedAt',
    });
    // Version 5: Add cardMetadataCache table
    this.version(5).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
    });
    // Version 6: Add DFC support - linked card indexes
    this.version(6).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, linkedFrontId, linkedBackId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
    });
    // Version 7: Add separate cardbacks table (persists across card clears)
    this.version(7).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, linkedFrontId, linkedBackId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
    });
    // Version 8: Add effectCache table for pre-rendered exports
    this.version(8).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, linkedFrontId, linkedBackId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
      effectCache: '&key, cachedAt',
    });
    // Version 9: Add mpcSearchCache table for MPC Autofill search caching
    this.version(9).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, linkedFrontId, linkedBackId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
      effectCache: '&key, cachedAt',
      mpcSearchCache: '&[query+cardType], cachedAt',
    });
    // Version 10: Clear cardMetadataCache to fix stale DFC data
    this.version(10).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, linkedFrontId, linkedBackId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
      effectCache: '&key, cachedAt',
      mpcSearchCache: '&[query+cardType], cachedAt',
    }).upgrade(tx => {
      // Clear all cached metadata to force re-enrichment with correct DFC handling
      return tx.table('cardMetadataCache').clear();
    });
    // Version 11: Add source field for explicit image source tracking
    // No schema change needed (source is optional), but version bump ensures clean upgrade
    this.version(11).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, linkedFrontId, linkedBackId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
      effectCache: '&key, cachedAt',
      mpcSearchCache: '&[query+cardType], cachedAt',
    });
    // Version 12: Add needs_token index for efficient querying of cards requiring tokens
    this.version(12).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, needs_token, linkedFrontId, linkedBackId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
      effectCache: '&key, cachedAt',
      mpcSearchCache: '&[query+cardType], cachedAt',
    });
    // Version 13: Clean up self-referential tokens (e.g. Treasure needing Treasure)
    // This fixes the infinite loop button state for existing cards
    this.version(13).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, needs_token, linkedFrontId, linkedBackId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
      effectCache: '&key, cachedAt',
      mpcSearchCache: '&[query+cardType], cachedAt',
    }).upgrade(async tx => {
      // Iterate only cards that flagged as needing tokens
      // We use the index for performance since we just added it in v12, but we query it via filtering to avoid key errors
      await tx.table('cards').filter(c => c.needs_token).modify(card => {
        if (card.token_parts && card.token_parts.length > 0) {
          // Filter out parts that have the same name as the card (case-insensitive)
          const validParts = card.token_parts.filter((p: { name?: string }) =>
            !p.name || p.name.toLowerCase() !== card.name.toLowerCase()
          );

          if (validParts.length !== card.token_parts.length) {
            card.token_parts = validParts;
            card.needs_token = validParts.length > 0;
          }
        }
      });
    });
    // Version 14: Strict cleanup - Tokens should NOT have token_parts
    // This removes spurious links (e.g. Treasure -> Smaug)
    this.version(14).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, needs_token, linkedFrontId, linkedBackId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
      effectCache: '&key, cachedAt',
      mpcSearchCache: '&[query+cardType], cachedAt',
    }).upgrade(async tx => {
      await tx.table('cards').filter(c => c.needs_token).modify(card => {
        // If card itself is a token, clear dependencies
        if (card.type_line && card.type_line.toLowerCase().includes('token')) {
          card.token_parts = [];
          card.needs_token = false;
        }
      });
    });

  }
}

export interface CachedMetadata {
  id: string;         // UUID
  name: string;       // Card Name
  set: string;        // Set Code (or empty)
  number: string;     // Collector Number (or empty)
  data: Json;         // The metadata object
  cachedAt: number;   // Last accessed
  size: number;       // Estimated size in bytes
}

// MPC search cache entry - for caching MPC Autofill search results
export interface MpcSearchCacheEntry {
  query: string;           // lowercase normalized search query
  cardType: 'CARD' | 'CARDBACK' | 'TOKEN';
  cards: unknown[];        // MpcAutofillCard[] - use unknown to avoid circular deps
  cachedAt: number;        // Timestamp for TTL calculation
}

export const db = new ProxxiedDexie();
