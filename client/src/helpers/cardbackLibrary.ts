/**
 * Cardback Library
 * 
 * Provides a unified source for all available cardback images:
 * - Built-in (from server API)
 * - User-uploaded
 * - MPC-imported
 * 
 * Cardbacks are stored in their own table (db.cardbacks) which persists
 * across card clearing operations. Only explicit deletion removes cardbacks.
 */

import { API_BASE } from '../constants';
import { db } from '../db';
import { debugLog } from './debug';

export interface CardbackOption {
    id: string;
    name: string;
    imageUrl: string;  // For display (blob URL or asset path)
    source: 'builtin' | 'uploaded';
    hasBuiltInBleed?: boolean;  // True if cardback has bleed built in
}

/**
 * Built-in cardbacks served from the API
 * Images are hosted on the server to reduce client bundle size
 */
export const BUILTIN_CARDBACKS: CardbackOption[] = [
    {
        id: 'cardback_builtin_mtg',
        name: 'Rose',
        imageUrl: `${API_BASE}/api/cards/images/cardback/mtg`,
        source: 'builtin',
        hasBuiltInBleed: false,  // Standard MTG back, no bleed
    },
    {
        id: 'cardback_builtin_proxxied',
        name: 'Proxxied',
        imageUrl: `${API_BASE}/api/cards/images/cardback/proxxied`,
        source: 'builtin',
        hasBuiltInBleed: true,  // Has 1/8" bleed built in
    },
    {
        id: 'cardback_builtin_classic_dots',
        name: 'Classic Dots',
        imageUrl: `${API_BASE}/api/cards/images/cardback/classic-dots`,
        source: 'builtin',
        hasBuiltInBleed: true,  // Has 1/8" bleed built in
    },
    {
        id: 'cardback_builtin_blank',
        name: 'Blank (No Back)',
        imageUrl: '',  // No image - renders as plain white without cut guides
        source: 'builtin',
        hasBuiltInBleed: true,  // No guides needed
    },
];

/**
 * Track whether builtin cardbacks have been ensured during this session.
 * This avoids redundant database operations on every getAllCardbacks call.
 */
let builtinCardbacksEnsured = false;



/**
 * Checks if an imageId belongs to the cardbacks table (not images table).
 * All cardback IDs start with 'cardback_'.
 */
export function isCardbackId(id: string): boolean {
    return id.startsWith('cardback_');
}

/**
 * Ensures builtin cardbacks are stored in the cardbacks table.
 * This allows them to be used for creating linked back cards.
 */
export async function ensureBuiltinCardbacksInDb(): Promise<void> {
    // Skip if already ensured in this session
    if (builtinCardbacksEnsured) return;

    for (const cardback of BUILTIN_CARDBACKS) {
        // Check if already in database
        const existing = await db.cardbacks.get(cardback.id);

        // Skip if it exists AND has originalBlob (properly set up for normal cardbacks)
        // OR if it's the blank cardback and already exists (blank has no originalBlob by design)
        if (existing?.originalBlob) continue;
        if (cardback.id === 'cardback_builtin_blank' && existing) continue;

        try {
            // Handle blank cardback specially - no image to fetch
            if (cardback.id === 'cardback_builtin_blank') {
                await db.cardbacks.put({
                    id: cardback.id,
                    sourceUrl: '',
                    hasBuiltInBleed: true,
                });
                continue;
            }

            // Fetch the asset and convert to blob
            const response = await fetch(cardback.imageUrl);
            const blob = await response.blob();

            // Store in database with originalBlob so it goes through bleed processing
            await db.cardbacks.put({
                id: cardback.id,
                sourceUrl: cardback.imageUrl,
                originalBlob: blob,
                hasBuiltInBleed: cardback.hasBuiltInBleed,
                // Clear processed blobs to force reprocessing
                displayBlob: undefined,
                displayBlobDarkened: undefined,
                exportBlob: undefined,
                exportBlobDarkened: undefined,
            });
        } catch (error) {
            console.error(`Failed to store builtin cardback ${cardback.id}:`, error);
        }
    }

    // Mark as ensured so we don't run this again
    builtinCardbacksEnsured = true;
}

// Cache for active blob URLs to prevent redundant creation/revocation
const cardbackUrlCache = new Map<string, string>();

/**
 * Invalidates the cached URL for a given cardback ID.
 * Call this when a cardback is updated or deleted.
 */
export function invalidateCardbackUrl(id: string) {
    const url = cardbackUrlCache.get(id);
    if (url) {
        URL.revokeObjectURL(url);
        cardbackUrlCache.delete(id);
    }
}

/**
 * Revokes all cached blob URLs and clears the cache.
 * Call this during app cleanup, when clearing all cards, or when unmounting.
 * Prevents memory leaks from accumulated blob URLs.
 */
export function revokeAllCardbackUrls(): void {
    cardbackUrlCache.forEach(url => URL.revokeObjectURL(url));
    cardbackUrlCache.clear();
}

/**
 * Resets cardback state for testing purposes.
 * Revokes all cached URLs and clears the ensured flag.
 */
export function _resetCardbackState(): void {
    revokeAllCardbackUrls();
    builtinCardbacksEnsured = false;
}

/**
 * Get all available cardbacks from the cardbacks table.
 * Returns built-in cardbacks plus any user-uploaded or MPC-imported cardbacks.
 */
export async function getAllCardbacks(): Promise<CardbackOption[]> {
    // Ensure builtin cardbacks are in the database
    await ensureBuiltinCardbacksInDb();

    // Fetch all cardbacks from database
    const cardbackImages = await db.cardbacks.toArray();

    // Map database cardbacks to CardbackOption
    const cardbackOptions: CardbackOption[] = cardbackImages.map(img => {
        // Check if this is a builtin cardback
        const builtinInfo = BUILTIN_CARDBACKS.find(b => b.id === img.id);

        // Name priority: builtin name > custom displayName > last segment of sourceUrl > default
        const name = builtinInfo?.name
            || img.displayName
            || img.sourceUrl?.split('/').pop()
            || 'Uploaded Cardback';

        // hasBuiltInBleed priority: image record override > builtin default > fallback false for uploaded
        const hasBuiltInBleed = img.hasBuiltInBleed ?? builtinInfo?.hasBuiltInBleed ?? false;

        // Resolve URL
        let imageUrl = '';
        if (cardbackUrlCache.has(img.id)) {
            debugLog(`[CardbackLib] Cache hit for ${img.id}`);
            imageUrl = cardbackUrlCache.get(img.id)!;
        } else {
            debugLog(`[CardbackLib] Creating new Blob URL for ${img.id}`);
            if (img.displayBlob) {
                imageUrl = URL.createObjectURL(img.displayBlob);
                cardbackUrlCache.set(img.id, imageUrl);
            } else if (img.originalBlob) {
                imageUrl = URL.createObjectURL(img.originalBlob);
                cardbackUrlCache.set(img.id, imageUrl);
            } else {
                imageUrl = img.sourceUrl || '';
            }
        }

        return {
            id: img.id,
            name,
            imageUrl,
            source: builtinInfo ? 'builtin' : 'uploaded',
            hasBuiltInBleed,
        };
    });

    // Sort: builtins first in defined order, then user-uploaded alphabetically
    const priorityOrder = ['cardback_builtin_mtg', 'cardback_builtin_proxxied', 'cardback_builtin_classic_dots', 'cardback_builtin_blank'];
    return cardbackOptions.sort((a, b) => {
        const aIndex = priorityOrder.indexOf(a.id);
        const bIndex = priorityOrder.indexOf(b.id);

        // Both are priority items - sort by priority order
        if (aIndex !== -1 && bIndex !== -1) {
            return aIndex - bIndex;
        }
        // Only a is priority - a comes first
        if (aIndex !== -1) return -1;
        // Only b is priority - b comes first
        if (bIndex !== -1) return 1;
        // Neither is priority - sort alphabetically
        return a.name.localeCompare(b.name);
    });
}


