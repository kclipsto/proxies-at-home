import Dexie, { type Table } from 'dexie';
import type { CardOption } from '@/types';

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

  // Darkened versions for instant toggle
  displayBlobDarkened?: Blob;
  exportBlobDarkened?: Blob;

  sourceUrl?: string;
  imageUrls?: string[];
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

export class ProxxiedDexie extends Dexie {
  // 'cards' is the name of the table
  // '&uuid' makes 'uuid' a unique index and primary key
  // 'name, set, number' creates indexes for efficient lookup
  cards!: Table<CardOption, string>;

  // 'cardImages' table to store image blobs
  // '&uuid' makes 'uuid' a unique index and primary key
  images!: Table<Image, string>;

  settings!: Table<Setting, string>;


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
  }
}

export const db = new ProxxiedDexie();
