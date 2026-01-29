/**
 * Per-card rendering overrides.
 * Used in the Card Editor for fine-tuning individual cards.
 * Same structure as global params for M2 compatibility.
 */
export interface CardOverrides {
  // Basic adjustments
  brightness?: number; // -50 to +50
  contrast?: number; // 0.5-2.0
  saturation?: number; // 0-2.0

  // Darkening
  darkenMode?: "none" | "darken-all" | "contrast-edges" | "contrast-full";
  darkenThreshold?: number; // 0-255
  darkenContrast?: number; // 0.5-2.0
  darkenEdgeWidth?: number; // 0-100
  darkenAmount?: number; // 0-1.0
  darkenBrightness?: number; // -50 to +50
  darkenUseGlobalSettings?: boolean; // true = use global settings, false = use per-card overrides
  darkenAutoDetect?: boolean; // true = auto-detect darkness from histogram, false = use sliders

  // Enhancements
  sharpness?: number; // 0-1.0
  pop?: number; // 0-100 pop/punch effect

  // Color effects
  hueShift?: number; // -180 to +180 degrees
  sepia?: number; // 0-1.0
  tintColor?: string; // hex color like '#ff0000'
  tintAmount?: number; // 0-1.0
  redBalance?: number; // -100 to +100
  greenBalance?: number; // -100 to +100
  blueBalance?: number; // -100 to +100
  cyanBalance?: number; // -100 to +100
  magentaBalance?: number; // -100 to +100
  yellowBalance?: number; // -100 to +100
  blackBalance?: number; // -100 to +100

  // Color Balance (Shadows/Midtones/Highlights) - all -100 to +100
  shadowsIntensity?: number;
  midtonesIntensity?: number;
  highlightsIntensity?: number;

  // Noise Reduction
  noiseReduction?: number; // 0-100

  // Preview Modes
  cmykPreview?: boolean; // Simulate CMYK print colors

  // Holographic Effect
  holoEffect?: "none" | "rainbow" | "glitter" | "stars";
  holoStrength?: number; // 0-100
  holoAreaMode?: "full" | "bright";
  holoAreaThreshold?: number; // 0-100 brightness threshold for bright mode
  holoAnimation?: "none" | "wave" | "pulse" | "sweep" | "twinkle";
  holoSpeed?: number; // 1-10 animation speed
  holoSweepWidth?: number; // 10-100 sweep band width percentage
  holoStarSize?: number; // 10-100 star size (only for stars effect)
  holoStarVariety?: number; // 0-100 position randomness (only for stars effect)
  holoProbability?: number; // 0-100 density
  holoBlur?: number; // 0-100 blur/softness for glitter
  holoExportMode?: "static" | "none";
  // holoAngle is NOT persisted - it's runtime only for animation

  // Color Replace
  colorReplaceEnabled?: boolean;
  colorReplaceSource?: string; // hex color
  colorReplaceTarget?: string; // hex color
  colorReplaceThreshold?: number; // 0-100

  // Gamma
  gamma?: number; // 0.1-3.0

  // Border effects
  vignetteAmount?: number; // 0-1.0
  vignetteSize?: number; // 0-1.0 (higher = more center visible)
  vignetteFeather?: number; // 0-1.0 (higher = softer edge)
}

export interface CardOption {
  uuid: string;
  name: string;
  order: number;
  imageId?: string | undefined;
  isUserUpload: boolean;
  hasBuiltInBleed?: boolean | undefined;
  bleedMode?: "generate" | "existing" | "none" | undefined; // Per-card bleed override
  existingBleedMm?: number | undefined; // Amount when bleedMode is 'existing'
  generateBleedMm?: number | undefined; // Custom bleed width when bleedMode is 'generate' (undefined = use global)
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
  // Lookup error - tracks when a card couldn't be found during import
  lookupError?: string; // Error message (e.g., "Card not found on Scryfall.")
  // DFC / Linked card support
  linkedFrontId?: string; // If set, this card IS a back (points to its front)
  linkedBackId?: string; // If set, this card HAS a back (points to it)
  // Default cardback tracking - for linked back cards only
  usesDefaultCardback?: boolean; // If true, follows default cardback changes. If false, keeps specific selection.
  // Visual state
  isFlipped?: boolean; // If true, card displays back face
  // Per-card rendering overrides (M1)
  overrides?: CardOverrides;
  // Token metadata
  token_parts?: TokenPart[]; // Associated tokens this card can create
  needs_token?: boolean; // True if this card has associated tokens
  isToken?: boolean; // True if this card IS a token (for filtering)
  // Project scope
  projectId?: string;
}

export interface PrintInfo {
  imageUrl: string;
  set: string;
  number: string;
  lang?: string;
  rarity?: string;
  faceName?: string; // For DFCs: the specific face name this image belongs to
  [key: string]: string | undefined;
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
  layout?: string; // Card layout (e.g., 'transform', 'modal_dfc', 'normal')
  prints?: PrintInfo[];
  // DFC support: face information
  card_faces?: Array<{
    name: string;
    imageUrl?: string;
  }>;
  // Token metadata
  token_parts?: TokenPart[]; // Associated tokens this card can create
  needs_token?: boolean; // True if this card has associated tokens
}

export type CardInfo = {
  name: string;
  set?: string | undefined;
  number?: string | undefined;
  quantity?: number | undefined;
  language?: string | undefined;
  category?: string | undefined; // Archidekt deck category
  mpcIdentifier?: string | undefined; // MPC Autofill identifier for exact art matching
  isToken?: boolean | undefined; // True if this is explicitly a token card (e.g., from t: prefix)
  overrides?: CardOverrides | undefined; // Per-card editor settings (for share import)
  // Custom DFC support for stream processing
  linkedBackImageId?: string | undefined;
  linkedBackName?: string | undefined;
  linkedBackSet?: string;
  linkedBackNumber?: string;
  preferredImageId?: string; // Specific Scryfall/URL image to use
  order?: number; // Specific sort order
};

/**
 * Token information from Scryfall's all_parts field.
 * Used to track which tokens are associated with a card.
 */
export interface TokenPart {
  id?: string; // Scryfall ID for the token
  name: string; // Token name (e.g., "Rat", "Soldier")
  type_line?: string; // Type line of the token
  uri?: string; // Scryfall URI to fetch full token data
}
