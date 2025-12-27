
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
  // DFC / Linked card support
  linkedFrontId?: string;  // If set, this card IS a back (points to its front)
  linkedBackId?: string;   // If set, this card HAS a back (points to it)
  // Default cardback tracking - for linked back cards only
  usesDefaultCardback?: boolean;  // If true, follows default cardback changes. If false, keeps specific selection.
  // Visual state
  isFlipped?: boolean;  // If true, card displays back face
  // Token metadata
  token_parts?: TokenPart[];
  needs_token?: boolean;
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
  // DFC support: face information
  card_faces?: Array<{
    name: string;
    imageUrl?: string;
  }>;
  token_parts?: TokenPart[];
  needs_token?: boolean;
}

export type CardInfo = {
  name: string;
  set?: string | undefined;
  number?: string | undefined;
  quantity?: number | undefined;
  language?: string | undefined;
  category?: string | undefined; // Archidekt deck category
};

export interface TokenPart {
  id?: string;
  name: string;
  type_line?: string;
  uri?: string;
}
