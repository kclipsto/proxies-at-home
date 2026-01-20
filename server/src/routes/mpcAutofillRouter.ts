import express, { type Request, type Response } from "express";
import axios from "axios";
import { getCachedMpcSearch, cacheMpcSearch, type MpcCard } from "../db/mpcSearchCache.js";
import { debugLog } from "../utils/debug.js";

const MPC_AUTOFILL_BASE = "https://mpcfill.com";

const mpcAutofillRouter = express.Router();
// Search settings - API requires sourceSettings
// Base settings without fuzzySearch (will be set per-request)
const getSearchSettings = (fuzzySearch: boolean = true) => ({
    searchTypeSettings: {
        filterCardbacks: false,
        fuzzySearch,
    },
    sourceSettings: {
        sources: Array.from({ length: 264 }, (_, i) => [i + 1, true] as [number, boolean]),
    },
    filterSettings: {
        excludesTags: ["NSFW"],
        includesTags: [],
        languages: ["EN"],
        maximumDPI: 1500,
        maximumSize: 30,
        minimumDPI: 0,
    },
});

interface MpcSearchRequest {
    query: string;
    cardType?: "CARD" | "CARDBACK" | "TOKEN";
    fuzzySearch?: boolean;
}

interface MpcBatchSearchRequest {
    queries: string[];
    cardType?: "CARD" | "CARDBACK" | "TOKEN";
}

interface EditorSearchResponse {
    results: Record<string, Record<string, string[]>>;
}

interface CardsResponse {
    results: Record<string, {
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
    }>;
}

// Helper to fetch cards in batches with retry on 5xx errors
async function fetchCardsData(identifiers: string[]): Promise<Record<string, MpcCard>> {
    const BATCH_SIZE = 1000;
    const MAX_RETRIES = 3;
    const cardMap: Record<string, MpcCard> = {};

    for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
        const batch = identifiers.slice(i, i + BATCH_SIZE);
        let lastError: Error | null = null;

        // Retry with exponential backoff for 5xx errors
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const cardsResponse = await axios.post<CardsResponse>(
                    `${MPC_AUTOFILL_BASE}/2/cards/`,
                    { cardIdentifiers: batch },
                    {
                        headers: { "Content-Type": "application/json" },
                        timeout: 30000,
                    }
                );

                Object.values(cardsResponse.data.results || {}).forEach(card => {
                    if (card) {
                        cardMap[card.identifier] = {
                            identifier: card.identifier,
                            name: card.name,
                            smallThumbnailUrl: card.smallThumbnailUrl,
                            mediumThumbnailUrl: card.mediumThumbnailUrl,
                            dpi: card.dpi,
                            tags: card.tags || [],
                            sourceName: card.sourceName,
                            source: card.source,
                            extension: card.extension,
                            size: card.size,
                        };
                    }
                });
                break; // Success - exit retry loop
            } catch (err: unknown) {
                lastError = err instanceof Error ? err : new Error(String(err));
                const axiosError = err as { response?: { status?: number } };
                const status = axiosError?.response?.status || 0;

                // Only retry on 5xx server errors
                if (status >= 500 && attempt < MAX_RETRIES) {
                    const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
                    console.warn(`[MPC] 5xx error (${status}), retrying in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                } else {
                    throw lastError;
                }
            }
        }
    }
    return cardMap;
}

/**
 * Combined search endpoint that:
 * 1. Calls MPC Autofill /2/editorSearch/ to get identifiers
 * 2. Calls /2/cards/ to get full card data
 * 3. Returns combined results
 */
mpcAutofillRouter.post("/search", async (req: Request<unknown, unknown, MpcSearchRequest>, res: Response) => {
    const { query, cardType = "CARD", fuzzySearch = true } = req.body;

    if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Missing or invalid query" });
    }

    try {
        const normalizedQuery = query.toLowerCase().trim();
        // Include fuzzy setting in cache key
        const cacheKey = `${normalizedQuery}:${fuzzySearch ? 'fuzzy' : 'exact'}`;

        // Check server cache first
        const cached = getCachedMpcSearch(cacheKey, cardType);
        if (cached) {
            debugLog(`[MPC Autofill] Cache HIT for "${query}" fuzzy=${fuzzySearch} (${cached.length} cards)`);
            return res.json({ cards: cached, fromCache: true });
        }

        debugLog(`[MPC Autofill] Cache MISS for "${query}" fuzzy=${fuzzySearch}, fetching from API...`);

        // Step 1: Search for card identifiers
        const searchResponse = await axios.post<EditorSearchResponse>(
            `${MPC_AUTOFILL_BASE}/2/editorSearch/`,
            {
                queries: [{ query: query.toLowerCase(), cardType }],
                searchSettings: getSearchSettings(fuzzySearch),
            },
            {
                headers: { "Content-Type": "application/json" },
                timeout: 15000,
            }
        );

        // Extract identifiers from response
        // Response format: { results: { "query": { "CARD": ["id1", "id2", ...] } } }
        const identifiers: string[] = [];
        const results = searchResponse.data.results;
        const queryLower = query.toLowerCase();

        if (results) {
            // Try exact match first
            if (results[queryLower]?.[cardType]) {
                identifiers.push(...results[queryLower][cardType]);
            } else if (results[query]?.[cardType]) {
                identifiers.push(...results[query][cardType]);
            } else {
                // Try any key that matches
                for (const [, value] of Object.entries(results)) {
                    if (value[cardType]) {
                        identifiers.push(...value[cardType]);
                        break;
                    }
                }
            }
        }

        debugLog(`[MPC Autofill] Found ${identifiers.length} identifiers`);

        if (identifiers.length === 0) {
            return res.json({ cards: [] });
        }

        // Step 2: Fetch full card data in batches (API limit: 1000 per request)
        const BATCH_SIZE = 1000;
        const allCards: MpcCard[] = [];

        for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
            const batch = identifiers.slice(i, i + BATCH_SIZE);
            const cardsResponse = await axios.post<CardsResponse>(
                `${MPC_AUTOFILL_BASE}/2/cards/`,
                { cardIdentifiers: batch },
                {
                    headers: { "Content-Type": "application/json" },
                    timeout: 30000,
                }
            );

            // Transform and add cards from this batch
            const batchCards = batch
                .map((id: string) => cardsResponse.data.results[id])
                .filter((card): card is NonNullable<typeof card> => card !== undefined)
                .map((card) => ({
                    identifier: card.identifier,
                    name: card.name,
                    smallThumbnailUrl: card.smallThumbnailUrl,
                    mediumThumbnailUrl: card.mediumThumbnailUrl,
                    dpi: card.dpi,
                    tags: card.tags || [],
                    sourceName: card.sourceName,
                    source: card.source,
                    extension: card.extension,
                    size: card.size,
                }));
            allCards.push(...batchCards);
        }

        // Store in cache
        cacheMpcSearch(cacheKey, cardType, allCards);

        debugLog(`[MPC Autofill] Cached ${allCards.length} cards for "${query}" fuzzy=${fuzzySearch}`);
        return res.json({ cards: allCards, fromCache: false });
    } catch (err: unknown) {
        // Enhanced error logging for axios errors
        if (axios.isAxiosError(err)) {
            console.error("[MPC Autofill] Search error:", {
                status: err.response?.status,
                statusText: err.response?.statusText,
                data: err.response?.data,
                message: err.message,
                url: err.config?.url,
            });
            return res.status(502).json({
                error: "Failed to search MPC Autofill",
                details: `${err.response?.status || 'unknown'}: ${err.message}`
            });
        }
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[MPC Autofill] Search error:", msg);
        return res.status(502).json({ error: "Failed to search MPC Autofill", details: msg });
    }
});

/**
 * Batch search endpoint
 */
mpcAutofillRouter.post("/batch-search", async (req: Request<unknown, unknown, MpcBatchSearchRequest>, res: Response) => {
    const { queries, cardType = "CARD" } = req.body;

    if (!queries || !Array.isArray(queries) || queries.length === 0) {
        return res.status(400).json({ error: "Missing or invalid queries array" });
    }

    try {
        const finalResults: Record<string, MpcCard[]> = {};
        const uncachedQueries: string[] = [];

        // Check server cache first for each query (batch always uses fuzzy=true)
        for (const q of queries) {
            const cacheKey = `${q.toLowerCase().trim()}:fuzzy`;
            const cached = getCachedMpcSearch(cacheKey, cardType);
            if (cached) {
                finalResults[q] = cached;
            } else {
                uncachedQueries.push(q);
            }
        }

        const cacheHits = queries.length - uncachedQueries.length;
        if (cacheHits > 0) {
            debugLog(`[MPC Autofill] Batch: ${cacheHits} cache hits, ${uncachedQueries.length} misses`);
        }

        if (uncachedQueries.length === 0) {
            return res.json({ results: finalResults });
        }

        debugLog(`[MPC Autofill] Batch fetching ${uncachedQueries.length} uncached queries, type: ${cardType}`);

        // Step 1: Search for card identifiers (only uncached queries)
        const searchResponse = await axios.post<EditorSearchResponse>(
            `${MPC_AUTOFILL_BASE}/2/editorSearch/`,
            {
                queries: uncachedQueries.map(q => ({ query: q.toLowerCase(), cardType })),
                searchSettings: getSearchSettings(true), // Always fuzzy for batch imports
            },
            {
                headers: { "Content-Type": "application/json" },
                timeout: 30000,
            }
        );

        // Map queries to identifiers
        const queryToIds: Record<string, string[]> = {};
        const allIdentifiers = new Set<string>();

        const results = searchResponse.data.results || {};
        const resultsLower = Object.fromEntries(
            Object.entries(results).map(([k, v]) => [k.toLowerCase(), v])
        );

        uncachedQueries.forEach(q => {
            const qLower = q.toLowerCase();
            const ids: string[] = [];

            // Try match in results
            const match = resultsLower[qLower];
            if (match && match[cardType]) {
                ids.push(...match[cardType]);
            }

            if (ids.length > 0) {
                queryToIds[q] = ids; // Use original query as key
                ids.forEach(id => allIdentifiers.add(id));
            }
        });

        debugLog(`[MPC Autofill] Found ${allIdentifiers.size} unique identifiers across ${Object.keys(queryToIds).length} matched queries`);

        if (allIdentifiers.size === 0) {
            return res.json({ results: finalResults });
        }

        // Step 2: Fetch full card data
        const cardMap = await fetchCardsData(Array.from(allIdentifiers));

        // Step 3: Construct response mapping query -> cards and cache results
        Object.entries(queryToIds).forEach(([query, ids]) => {
            const cards = ids
                .map(id => cardMap[id])
                .filter((c): c is MpcCard => c !== undefined);
            finalResults[query] = cards;

            // Cache the results for this query
            if (cards.length > 0) {
                const cacheKey = `${query.toLowerCase().trim()}:fuzzy`;
                cacheMpcSearch(cacheKey, cardType, cards);
            }
        });

        return res.json({ results: finalResults });

    } catch (err: unknown) {
        // Enhanced error logging for axios errors
        if (axios.isAxiosError(err)) {
            console.error("[MPC Autofill] Batch Search error:", {
                status: err.response?.status,
                message: err.message,
            });
            return res.status(502).json({
                error: "Failed to batch search MPC Autofill",
                details: `${err.response?.status || 'unknown'}: ${err.message}`
            });
        }
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[MPC Autofill] Batch Search error:", msg);
        return res.status(502).json({ error: "Failed to batch search MPC Autofill", details: msg });
    }
});

export { mpcAutofillRouter };
