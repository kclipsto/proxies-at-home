
export interface CardOption {
  uuid: string;
  name: string;
  order: number;
  imageId?: string | undefined;
  isUserUpload: boolean;
  hasBuiltInBleed?: boolean | undefined;
  bleedMode?: 'generate' | 'existing' | 'none' | undefined;  // Per-card bleed override
  existingBleedMm?: number | undefined;  // Amount when bleedMode is 'existing'
  generateBleedMm?: number | undefined;  // Custom bleed width when bleedMode is 'generate' (undefined = use global)
  set?: string | undefined;
  number?: string | undefined;
  lang?: string | undefined;
  colors?: string[];
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  rarity?: string;
  category?: string; // Archidekt deck category (Commander, Mainboard, Sideboard, etc.)
  // Enrichment tracking
  needsEnrichment?: boolean;
  enrichmentRetryCount?: number;
  enrichmentNextRetryAt?: number;
}

export interface PrintInfo {
  imageUrl: string;
  set: string;
  number: string;
  lang?: string;
  rarity?: string;
  faceName?: string; // For DFCs: the specific face name this image belongs to
}

export interface ScryfallCard {
  name: string;
  imageUrls: string[];
  set?: string | undefined;
  number?: string | undefined;
  lang?: string | undefined;
  colors?: string[];
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  rarity?: string;
  prints?: PrintInfo[];
}

export type CardInfo = {
  name: string;
  set?: string | undefined;
  number?: string | undefined;
  quantity?: number | undefined;
  language?: string | undefined;
  category?: string | undefined; // Archidekt deck category
};
