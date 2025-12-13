import Dexie, { type Table } from 'dexie';
import type { CardOption, PrintInfo } from '@/types';

// Define a type for the image data to be stored
export interface Image {
  id: string; // hash for custom, URL for scryfall
  refCount: number;
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

  // Darkened versions for instant toggle
  displayBlobDarkened?: Blob;
  exportBlobDarkened?: Blob;

  sourceUrl?: string;
  imageUrls?: string[];

  // Per-print metadata for artwork selection
  prints?: PrintInfo[];
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

export class ProxxiedDexie extends Dexie {
  // 'cards' is the name of the table
  // '&uuid' makes 'uuid' a unique index and primary key
  // 'name, set, number' creates indexes for efficient lookup
  cards!: Table<CardOption, string>;

  // 'cardImages' table to store image blobs
  // '&uuid' makes 'uuid' a unique index and primary key
  images!: Table<Image, string>;

  settings!: Table<Setting, string>;

  // Persistent image cache - survives card clearing, has TTL
  imageCache!: Table<CachedImage, string>;

  // Persistent metadata cache
  cardMetadataCache!: Table<CachedMetadata, string>;


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

export const db = new ProxxiedDexie();
