import Dexie, { type Table } from 'dexie';
import type { CardOption } from './types/Card';

// Define a type for the image data to be stored
export interface Image {
  id: string; // hash for custom, URL for scryfall
  refCount: number;
  originalBlob?: Blob;
  
  displayBlob?: Blob;
  displayDpi?: number;
  displayBleedWidth?: number;

  exportBlob?: Blob;
  exportDpi?: number;
  exportBleedWidth?: number;

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
      cards: '&uuid, imageId, order, name', // uuid is unique primary key, name, set, number are indexed
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth', // uuid is unique primary key
      settings: '&id',
    });
  }
}

export const db = new ProxxiedDexie();
