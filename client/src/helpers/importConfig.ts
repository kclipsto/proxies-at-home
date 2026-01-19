/**
 * Centralized configuration for import operations.
 * Rationale documented for each constant.
 */
export const IMPORT_CONFIG = {
    /**
     * MPC search batching. MPC Autofill API has no documented rate limit,
     * but 50 provides good parallelism without overwhelming the server.
     */
    MPC_SEARCH_CHUNK_SIZE: 50,

    /**
     * Token enrichment batching. Matches server-side token lookup API
     * which processes this many cards per request efficiently.
     */
    TOKEN_ENRICH_CHUNK_SIZE: 100,

    /**
     * Scryfall Collection API limit. Scryfall documents max 75 identifiers
     * per /cards/collection request.
     * @see https://scryfall.com/docs/api/cards/collection
     */
    SCRYFALL_COLLECTION_BATCH_SIZE: 75,

    /**
     * Parallel image fetching. Browser connection limit is typically 6-8
     * per domain, so 10 provides good parallelism with some queueing.
     */
    PARALLEL_IMAGE_FETCH_SIZE: 10,

    /**
     * Scryfall rate limiting delay in ms. Scryfall asks for 50-100ms
     * between requests. We use 100ms for safety margin.
     * @see https://scryfall.com/docs/api
     */
    SCRYFALL_RATE_LIMIT_MS: 100,

    /**
     * In-flight request cache TTL in ms. Prevents stale promises from
     * accumulating in long-running server instances.
     */
    IN_FLIGHT_CACHE_TTL_MS: 60_000,

    /**
     * Maximum in-flight cache entries before cleanup is triggered.
     */
    MAX_IN_FLIGHT_ENTRIES: 500,
} as const;

export type ImportConfigKey = keyof typeof IMPORT_CONFIG;
