import { API_BASE } from "../constants";
import { getMpcImageUrl } from "./mpc";
import { debugLog } from "./debug";

/**
 * MPC Autofill card data from the community database
 */
export interface MpcAutofillCard {
    identifier: string;
    name: string;
    smallThumbnailUrl: string;
    mediumThumbnailUrl: string;
    dpi: number;
    tags: string[];
    sourceName: string;
    source: string;
    extension: string;
    size: number;
}

interface MpcSearchResponse {
    cards: MpcAutofillCard[];
    error?: string;
}

interface MpcBatchSearchResponse {
    results: Record<string, MpcAutofillCard[]>;
    error?: string;
}

/**
 * Search MPC Autofill for custom card art
 * @param query Card name to search for
 * @param cardType Type of card to search (default: CARD)
 * @param fuzzySearch Enable fuzzy/approximate name matching (default: true)
 * @returns Array of matching MPC cards
 */
export async function searchMpcAutofill(
    query: string,
    cardType: "CARD" | "CARDBACK" | "TOKEN" = "CARD",
    fuzzySearch: boolean = true
): Promise<MpcAutofillCard[]> {
    if (!query.trim()) {
        return [];
    }

    const normalizedQuery = query.trim().toLowerCase();

    // Check client cache first (cache key includes fuzzy setting)
    const { getCachedMpcSearch, cacheMpcSearch } = await import('./mpcSearchCache');
    const cacheKey = `${normalizedQuery}:${fuzzySearch ? 'fuzzy' : 'exact'}`;
    const cached = await getCachedMpcSearch(cacheKey, cardType);
    if (cached) {
        return cached;
    }

    try {
        const response = await fetch(`${API_BASE}/api/mpcfill/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: query.trim(), cardType, fuzzySearch }),
        });

        if (!response.ok) {
            console.error("[MPC Autofill] Search failed:", response.status);
            return [];
        }

        const data: MpcSearchResponse = await response.json();
        const cards = data.cards || [];

        // Store in client cache
        if (cards.length > 0) {
            await cacheMpcSearch(cacheKey, cardType, cards);
        }

        return cards;
    } catch (err) {
        console.error("[MPC Autofill] Search error:", err);
        return [];
    }
}

/**
 * Batch search MPC Autofill for multiple cards
 * Uses client cache for each query - only fetches uncached from server
 * @param queries Array of card names to search for
 * @param cardType Type of card to search (default: CARD)
 * @returns Object mapping queries to matching MPC cards
 */
export async function batchSearchMpcAutofill(
    queries: string[],
    cardType: "CARD" | "CARDBACK" | "TOKEN" = "CARD"
): Promise<Record<string, MpcAutofillCard[]>> {
    if (queries.length === 0) {
        return {};
    }

    const { getCachedMpcSearch, cacheMpcSearch } = await import('./mpcSearchCache');
    const results: Record<string, MpcAutofillCard[]> = {};
    const uncachedQueries: string[] = [];

    // Batch search always uses fuzzy=true, so cache key includes :fuzzy suffix
    // Check cache for each query first
    for (const query of queries) {
        const cacheKey = `${query.trim().toLowerCase()}:fuzzy`;
        const cached = await getCachedMpcSearch(cacheKey, cardType);
        if (cached) {
            results[query] = cached;
        } else {
            uncachedQueries.push(query);
        }
    }

    const cacheHits = queries.length - uncachedQueries.length;
    if (cacheHits > 0) {
        debugLog(`[MPC Batch] ${cacheHits} cache hits, ${uncachedQueries.length} misses`);
    }

    if (uncachedQueries.length === 0) {
        return results;
    }

    try {
        const response = await fetch(`${API_BASE}/api/mpcfill/batch-search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ queries: uncachedQueries.map(q => q.trim()), cardType }),
        });

        if (!response.ok) {
            console.error("[MPC Autofill] Batch search failed:", response.status);
            return results;
        }

        const data: MpcBatchSearchResponse = await response.json();

        // Cache and merge results (batch always uses fuzzy=true)
        for (const [query, cards] of Object.entries(data.results || {})) {
            results[query] = cards;
            if (cards.length > 0) {
                const cacheKey = `${query.toLowerCase()}:fuzzy`;
                await cacheMpcSearch(cacheKey, cardType, cards);
            }
        }

        return results;
    } catch (err) {
        console.error("[MPC Autofill] Batch search error:", err);
        return results;
    }
}

/**
 * Get the full-resolution image URL for an MPC card
 * Uses the existing MPC proxy endpoint
 */
export function getMpcAutofillImageUrl(identifier: string): string {
    return getMpcImageUrl(identifier) || "";
}

/**
 * Extract MPC identifier from an imageId.
 * Handles both formats:
 * - Full URL: "/api/cards/images/mpc?id=abc123" -> "abc123"
 * - Bare identifier after parseImageIdFromUrl: "abc123" -> "abc123"
 * Returns null if not an MPC image.
 */
export function extractMpcIdentifierFromImageId(imageId?: string): string | null {
    if (!imageId) return null;

    // If it contains the full MPC URL path, extract from that
    if (imageId.includes('/api/cards/images/mpc?id=')) {
        const match = imageId.match(/id=([^&]+)/);
        return match ? match[1] : null;
    }

    // If imageId is a bare identifier (alphanumeric, typical MPC format)
    // MPC identifiers are typically 20+ chars of alphanumeric
    if (/^[a-zA-Z0-9_-]{15,}$/.test(imageId)) {
        return imageId;
    }

    // Not an MPC image (e.g., Scryfall URL)
    return null;
}

/**
 * Parse an MPC card name to extract just the base card name.
 * MPC names often include set/collector info like "Forest [THB] {254}" or "Lightning Bolt (M21)".
 * This extracts just "Forest" or "Lightning Bolt".
 * @param mpcName The full MPC card name
 * @param fallback Optional fallback if parsing fails
 * @returns The base card name
 */
export function parseMpcCardName(mpcName: string, fallback?: string): string {
    if (!mpcName) return fallback || "";
    // Match everything before the first bracket, parenthesis, or brace
    const match = mpcName.match(/^([^([{\r\n]+)/);
    return match ? match[1].trim() : (mpcName.trim() || fallback || "");
}
