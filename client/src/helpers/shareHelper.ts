/**
 * Share Helper - Serialization and API functions for deck sharing
 * 
 * Serializes cards using Scryfall UUIDs and MPC IDs (not full names) for compact storage.
 * Uses short keys for settings to minimize payload size.
 */

import { API_BASE } from '../constants';
import type { CardOption, CardOverrides } from '@/types';
import { extractMpcIdentifierFromImageId } from './mpcAutofillApi';
import { inferImageSource } from './imageSourceUtils';

// ============================================================================
// Types
// ============================================================================

/** Compact card representation: [type, id, order, category?, overrides?, name?, imageId?] */
export type ShareCard = ['s' | 'm' | 'b', string, number, string | null, Record<string, unknown> | null, string?, string?];

/** Share data structure */
export interface ShareData {
    v: 1;                         // Schema version
    c: ShareCard[];               // Cards
    dfc?: [number, number][];     // DFC links: [frontIndex, backIndex]
    st?: ShareSettings;           // Settings
    skipped?: number;             // Count of skipped custom uploads
}

/**
 * Short-key settings for sharing
 * Maps all settings store values to compact keys
 */
export interface ShareSettings {
    // Layout
    pr?: string;   // pageSizePreset
    c?: number;    // columns
    r?: number;    // rows
    dpi?: number;  // dpi

    // Bleed
    bl?: boolean;  // bleedEdge
    blMm?: number; // bleedEdgeWidth
    wbSrc?: number;  // withBleedSourceAmount
    wbTm?: string;   // withBleedTargetMode
    wbTa?: number;   // withBleedTargetAmount
    nbTm?: string;   // noBleedTargetMode
    nbTa?: number;   // noBleedTargetAmount

    // Darken
    dk?: string;   // darkenMode
    dkC?: number;  // darkenContrast
    dkE?: number;  // darkenEdgeWidth
    dkA?: number;  // darkenAmount
    dkB?: number;  // darkenBrightness
    dkAd?: boolean; // darkenAutoDetect

    // Guide/Cut lines
    gs?: string;   // perCardGuideStyle
    gc?: string;   // guideColor
    gw?: number;   // guideWidth
    gp?: string;   // guidePlacement
    cgL?: number;  // cutGuideLengthMm
    cls?: string;  // cutLineStyle

    // Spacing/Position
    spc?: number;  // cardSpacingMm
    pX?: number;   // cardPositionX
    pY?: number;   // cardPositionY
    ucbo?: boolean; // useCustomBackOffset
    bpX?: number;  // cardBackPositionX
    bpY?: number;  // cardBackPositionY

    // User Preferences
    pas?: string;  // preferredArtSource
    gl?: string;   // globalLanguage
    ait?: boolean; // autoImportTokens
    mfs?: boolean; // mpcFuzzySearch
    spt?: boolean; // showProcessingToasts

    // Sort & Filter
    sb?: string;   // sortBy
    so?: string;   // sortOrder
    fmc?: number[]; // filterManaCost
    fcol?: string[]; // filterColors
    ftyp?: string[]; // filterTypes
    fcat?: string[]; // filterCategories
    ffeat?: string[]; // filterFeatures
    fmt?: string;  // filterMatchType

    // Export
    em?: string;   // exportMode
    dsa?: boolean; // decklistSortAlpha
}

/** Full settings input type for serialization */
export interface SettingsInput {
    pageSizePreset?: string;
    columns?: number;
    rows?: number;
    dpi?: number;
    bleedEdge?: boolean;
    bleedEdgeWidth?: number;
    withBleedSourceAmount?: number;
    withBleedTargetMode?: string;
    withBleedTargetAmount?: number;
    noBleedTargetMode?: string;
    noBleedTargetAmount?: number;
    darkenMode?: string;
    darkenContrast?: number;
    darkenEdgeWidth?: number;
    darkenAmount?: number;
    darkenBrightness?: number;
    darkenAutoDetect?: boolean;
    perCardGuideStyle?: string;
    guideColor?: string;
    guideWidth?: number;
    guidePlacement?: string;
    cutGuideLengthMm?: number;
    cutLineStyle?: string;
    cardSpacingMm?: number;
    cardPositionX?: number;
    cardPositionY?: number;
    useCustomBackOffset?: boolean;
    cardBackPositionX?: number;
    cardBackPositionY?: number;
    preferredArtSource?: string;
    globalLanguage?: string;
    autoImportTokens?: boolean;
    mpcFuzzySearch?: boolean;
    showProcessingToasts?: boolean;
    sortBy?: string;
    sortOrder?: string;
    filterManaCost?: number[];
    filterColors?: string[];
    filterTypes?: string[];
    filterCategories?: string[];
    filterFeatures?: string[];
    filterMatchType?: string;
    exportMode?: string;
    decklistSortAlpha?: boolean;
}

/** API response types */
interface CreateShareResponse {
    id: string;
    expiresAt: number;
}

interface LoadShareResponse {
    data: ShareData;
    expiresAt: number;
}

// ============================================================================
// Override Key Mapping (full -> short)
// ============================================================================

const OVERRIDE_KEY_MAP: Record<string, string> = {
    brightness: 'br',
    contrast: 'ct',
    saturation: 'sa',
    darkenMode: 'dm',
    darkenThreshold: 'dt',
    darkenContrast: 'dc',
    darkenEdgeWidth: 'dew',
    darkenAmount: 'da',
    darkenBrightness: 'db',
    darkenUseGlobalSettings: 'dug',
    darkenAutoDetect: 'dad',
    sharpness: 'sh',
    pop: 'po',
    hueShift: 'hs',
    sepia: 'se',
    tintColor: 'tc',
    tintAmount: 'ta',
    gamma: 'gm',
    holoEffect: 'he',
    holoStrength: 'hst',
    holoAreaMode: 'ham',
    holoAreaThreshold: 'hat',
    holoAnimation: 'ha',
    holoSpeed: 'hsp',
    holoSweepWidth: 'hsw',
    holoStarSize: 'hss',
    holoStarVariety: 'hsv',
    holoProbability: 'hp',
    holoBlur: 'hb',
    holoExportMode: 'hem',
    colorReplaceEnabled: 'cre',
    colorReplaceSource: 'crs',
    colorReplaceTarget: 'crt',
    colorReplaceThreshold: 'crth',
    vignetteAmount: 'va',
    vignetteSize: 'vs',
    vignetteFeather: 'vf',
    noiseReduction: 'nr',
    cmykPreview: 'cmyk',
    redBalance: 'rb',
    greenBalance: 'gb',
    blueBalance: 'bb',
    cyanBalance: 'cb',
    magentaBalance: 'mb',
    yellowBalance: 'yb',
    blackBalance: 'kb',
    shadowsIntensity: 'si',
    midtonesIntensity: 'mi',
    highlightsIntensity: 'hi',
};

const OVERRIDE_KEY_REVERSE = Object.fromEntries(
    Object.entries(OVERRIDE_KEY_MAP).map(([k, v]) => [v, k])
);

// ============================================================================
// Serialization Functions
// ============================================================================

/**
 * Compress CardOverrides to short keys
 */
function compressOverrides(overrides: CardOverrides): Record<string, unknown> | null {
    const entries = Object.entries(overrides);
    if (entries.length === 0) return null;

    const compressed: Record<string, unknown> = {};
    for (const [key, value] of entries) {
        const shortKey = OVERRIDE_KEY_MAP[key] || key;
        compressed[shortKey] = value;
    }
    return compressed;
}

/**
 * Expand short-key overrides back to full CardOverrides
 */
function expandOverrides(compressed: Record<string, unknown>): CardOverrides {
    const expanded: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(compressed)) {
        const fullKey = OVERRIDE_KEY_REVERSE[key] || key;
        expanded[fullKey] = value;
    }
    return expanded as CardOverrides;
}

/**
 * Extract card identifier (Scryfall UUID or MPC ID) from a CardOption
 * Returns [type, id] or null if not shareable (custom upload)
 */
function getCardIdentifier(card: CardOption): ['s' | 'm' | 'b', string] | null {
    const source = inferImageSource(card.imageId);

    // 1. Check for Built-in Cardback
    // This must come first because cardbacks might be misidentified as other types
    if (card.imageId && card.imageId.startsWith('cardback_')) {
        return ['b', card.imageId];
    }

    // 2. Check for MPC
    if (source === 'mpc') {
        const mpcId = extractMpcIdentifierFromImageId(card.imageId);
        if (mpcId) return ['m', mpcId];
    }

    if (source === 'scryfall' && card.imageId) {
        // For Scryfall, we need set/number to reconstruct
        // The imageId for Scryfall is typically a URL, so we use set+number
        if (card.set && card.number) {
            return ['s', `${card.set}/${card.number}`];
        }
    }

    // Custom uploads are not shareable
    return null;
}

/**
 * Serialize cards for sharing
 */
export function serializeCards(cards: CardOption[]): { shareCards: ShareCard[]; dfc: [number, number][]; skipped: number } {
    const shareCards: ShareCard[] = [];
    const dfc: [number, number][] = [];
    let skipped = 0;

    // Map from original UUID to new index
    const uuidToIndex = new Map<string, number>();

    // First pass: serialize shareable cards
    for (const card of cards) {
        // Skip linked back cards (they'll be referenced via DFC links)
        if (card.linkedFrontId) continue;

        const identifier = getCardIdentifier(card);
        if (!identifier) {
            // Only count as skipped if it's an actual custom upload, not a placeholder
            if (card.isUserUpload) {
                skipped++;
            }
            continue;
        }

        const [type, id] = identifier;
        const overrides = card.overrides ? compressOverrides(card.overrides) : null;

        shareCards.push([
            type,
            id,
            card.order,
            card.category || null,
            overrides,
            card.name, // Include name
            card.imageId, // Include exact image ID/URL for fidelity
        ]);

        uuidToIndex.set(card.uuid, shareCards.length - 1);
    }

    // Second pass: build DFC links
    for (const card of cards) {
        if (card.linkedBackId) {
            const frontIndex = uuidToIndex.get(card.uuid);
            const backCard = cards.find(c => c.uuid === card.linkedBackId);

            if (frontIndex !== undefined && backCard) {
                // The back card identifier
                const backIdentifier = getCardIdentifier(backCard);
                if (backIdentifier) {
                    const [type, id] = backIdentifier;
                    const backOverrides = backCard.overrides ? compressOverrides(backCard.overrides) : null;

                    // Add back card to list
                    shareCards.push([
                        type,
                        id,
                        backCard.order,
                        backCard.category || null,
                        backOverrides,
                        backCard.name, // Include name for back card too
                    ]);

                    const backIndex = shareCards.length - 1;
                    dfc.push([frontIndex, backIndex]);
                }
            }
        }
    }

    return { shareCards, dfc, skipped };
}

/**
 * Serialize settings for sharing (includes all editor-relevant settings)
 */
export function serializeSettings(settings: SettingsInput): ShareSettings {
    const result: ShareSettings = {};

    // Layout
    if (settings.pageSizePreset) result.pr = settings.pageSizePreset;
    if (settings.columns !== undefined) result.c = settings.columns;
    if (settings.rows !== undefined) result.r = settings.rows;
    if (settings.dpi !== undefined) result.dpi = settings.dpi;

    // Bleed
    if (settings.bleedEdge !== undefined) result.bl = settings.bleedEdge;
    if (settings.bleedEdgeWidth !== undefined) result.blMm = settings.bleedEdgeWidth;
    if (settings.withBleedSourceAmount !== undefined) result.wbSrc = settings.withBleedSourceAmount;
    if (settings.withBleedTargetMode) result.wbTm = settings.withBleedTargetMode;
    if (settings.withBleedTargetAmount !== undefined) result.wbTa = settings.withBleedTargetAmount;
    if (settings.noBleedTargetMode) result.nbTm = settings.noBleedTargetMode;
    if (settings.noBleedTargetAmount !== undefined) result.nbTa = settings.noBleedTargetAmount;

    // Darken
    if (settings.darkenMode) result.dk = settings.darkenMode;
    if (settings.darkenContrast !== undefined) result.dkC = settings.darkenContrast;
    if (settings.darkenEdgeWidth !== undefined) result.dkE = settings.darkenEdgeWidth;
    if (settings.darkenAmount !== undefined) result.dkA = settings.darkenAmount;
    if (settings.darkenBrightness !== undefined) result.dkB = settings.darkenBrightness;
    if (settings.darkenAutoDetect !== undefined) result.dkAd = settings.darkenAutoDetect;

    // Guide/Cut lines
    if (settings.perCardGuideStyle) result.gs = settings.perCardGuideStyle;
    if (settings.guideColor) result.gc = settings.guideColor;
    if (settings.guideWidth !== undefined) result.gw = settings.guideWidth;
    if (settings.guidePlacement) result.gp = settings.guidePlacement;
    if (settings.cutGuideLengthMm !== undefined) result.cgL = settings.cutGuideLengthMm;
    if (settings.cutLineStyle) result.cls = settings.cutLineStyle;

    // Spacing/Position
    if (settings.cardSpacingMm !== undefined) result.spc = settings.cardSpacingMm;
    if (settings.cardPositionX !== undefined) result.pX = settings.cardPositionX;
    if (settings.cardPositionY !== undefined) result.pY = settings.cardPositionY;
    if (settings.useCustomBackOffset !== undefined) result.ucbo = settings.useCustomBackOffset;
    if (settings.cardBackPositionX !== undefined) result.bpX = settings.cardBackPositionX;
    if (settings.cardBackPositionY !== undefined) result.bpY = settings.cardBackPositionY;

    // User Preferences
    if (settings.preferredArtSource) result.pas = settings.preferredArtSource;
    if (settings.globalLanguage) result.gl = settings.globalLanguage;
    if (settings.autoImportTokens !== undefined) result.ait = settings.autoImportTokens;
    if (settings.mpcFuzzySearch !== undefined) result.mfs = settings.mpcFuzzySearch;
    if (settings.showProcessingToasts !== undefined) result.spt = settings.showProcessingToasts;

    // Sort & Filter
    if (settings.sortBy) result.sb = settings.sortBy;
    if (settings.sortOrder) result.so = settings.sortOrder;
    if (settings.filterManaCost?.length) result.fmc = settings.filterManaCost;
    if (settings.filterColors?.length) result.fcol = settings.filterColors;
    if (settings.filterTypes?.length) result.ftyp = settings.filterTypes;
    if (settings.filterCategories?.length) result.fcat = settings.filterCategories;
    if (settings.filterFeatures?.length) result.ffeat = settings.filterFeatures;
    if (settings.filterMatchType) result.fmt = settings.filterMatchType;

    // Export
    if (settings.exportMode) result.em = settings.exportMode;
    if (settings.decklistSortAlpha !== undefined) result.dsa = settings.decklistSortAlpha;

    return result;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Create a share on the server and return the share URL
 * Uses projectId for stable share links - same project = same link
 */
import { sortCards } from './dbUtils';

/**
 * Create a share on the server and return the share URL
 * Uses projectId for stable share links - same project = same link
 */
export async function createShare(
    cards: CardOption[],
    settings: SettingsInput,
    projectId?: string
): Promise<{ url: string; id: string; skipped: number }> {
    // Sort cards by order to ensure the shared payload is ordered.
    // This helps simple parsers and debugging, and aligns array order with 'order' property.
    const sortedCards = sortCards(cards);
    const { shareCards, dfc, skipped } = serializeCards(sortedCards);

    if (shareCards.length === 0) {
        throw new Error('No shareable cards in deck');
    }

    const shareData: ShareData = {
        v: 1,
        c: shareCards,
        st: serializeSettings(settings),
    };

    if (dfc.length > 0) {
        shareData.dfc = dfc;
    }

    if (skipped > 0) {
        shareData.skipped = skipped;
    }

    const response = await fetch(`${API_BASE}/api/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: shareData, projectId }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to create share' }));
        throw new Error(error.error || 'Failed to create share');
    }

    const result: CreateShareResponse = await response.json();

    // Generate the share URL
    const baseUrl = window.location.origin + window.location.pathname;
    const url = `${baseUrl}?share=${result.id}`;

    return { url, id: result.id, skipped };
}

/**
 * Load a share from the server
 */
export async function loadShare(id: string): Promise<ShareData> {
    const response = await fetch(`${API_BASE}/api/share/${id}?t=${Date.now()}`);

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error('Share not found or expired');
        }
        const error = await response.json().catch(() => ({ error: 'Failed to load share' }));
        throw new Error(error.error || 'Failed to load share');
    }

    const result: LoadShareResponse = await response.json();
    return result.data;
}

/**
 * Get warnings about the share (e.g., custom uploads being excluded)
 * Only warns about actual custom uploads, not placeholder cards
 */
export function getShareWarnings(cards: CardOption[]): string[] {
    const warnings: string[] = [];

    let customUploadCount = 0;
    for (const card of cards) {
        if (card.linkedFrontId) continue; // Skip backs
        // Only count actual custom uploads, not placeholders (undefined imageId)
        if (card.isUserUpload) {
            // Check if it's a built-in cardback, which IS shareable now
            if (card.imageId && card.imageId.startsWith('cardback_')) {
                continue;
            }
            customUploadCount++;
        }
    }

    if (customUploadCount > 0) {
        warnings.push(`${customUploadCount} custom upload${customUploadCount > 1 ? 's' : ''} will be excluded`);
    }

    return warnings;
}

/**
 * Deserialize share data back to partial card info for import
 * Returns data suitable for streamCards import
 */
export function deserializeForImport(data: ShareData): {
    cards: Array<{
        name?: string;
        set?: string;
        number?: string;
        mpcIdentifier?: string;
        builtInCardbackId?: string;
        category?: string;
        overrides?: CardOverrides;
        imageId?: string;
        order?: number;
    }>;
    dfcLinks: [number, number][];
    settings?: ShareSettings;
} {
    const cards = data.c.map(([type, id, order, category, overrides, name, imageId]) => {
        if (type === 'm') {
            return {
                name,
                mpcIdentifier: id,
                category: category || undefined,
                overrides: overrides ? expandOverrides(overrides) : undefined,
                imageId,
                order,
            };
        } else if (type === 'b') {
            return {
                name,
                builtInCardbackId: id,
                category: category || undefined,
                overrides: overrides ? expandOverrides(overrides) : undefined,
                imageId,
                order,
            };
        } else {
            // Scryfall: set/number format
            const [set, number] = id.split('/');
            return {
                name,
                set,
                number,
                category: category || undefined,
                overrides: overrides ? expandOverrides(overrides) : undefined,
                imageId,
                order,
            };
        }
    });

    return {
        cards,
        dfcLinks: data.dfc || [],
        settings: data.st,
    };
}

/**
 * Calculate a stable hash of the project state (cards + settings)
 * Used to detect if the user has modified their local copy since the last sync
 */
export async function calculateStateHash(
    cards: CardOption[],
    settings: SettingsInput
): Promise<string> {
    // Sort cards by order to ensure deterministic hash regardless of array/insertion order
    const sortedCards = [...cards].sort((a, b) => a.order - b.order);
    const { shareCards, dfc } = serializeCards(sortedCards);
    const shareSettings = serializeSettings(settings);

    // Create a stable object structure for hashing
    const state = {
        c: shareCards,
        dfc,
        st: shareSettings
    };

    const json = JSON.stringify(state);

    // valid simple hash for this purpose (SHA-256 is good but async)
    const msgBuffer = new TextEncoder().encode(json);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
