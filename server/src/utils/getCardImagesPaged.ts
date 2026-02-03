import axios, { type AxiosResponse } from "axios";
import type { CardInfo } from "../../../shared/types.js";
import {
  lookupCardBySetNumber,
  lookupCardByName,
  insertOrUpdateCard,
} from "../db/proxxiedCardLookup.js";
import { debugLog } from "./debug.js";

const SCRYFALL_API = "https://api.scryfall.com/cards/search";

// Optional: a polite UA helps if you get rate-limited
const AX = axios.create({
  headers: { "User-Agent": "Proxxied/1.0 (contact: your-email@example.com)" },
});

// Simple Mutex to serialize requests
class Mutex {
  private mutex = Promise.resolve();

  lock(): Promise<() => void> {
    let unlock: () => void = () => { };
    const nextMutex = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    // The caller gets the unlock function when the *previous* mutex resolves
    const willLock = this.mutex.then(() => unlock);
    // The next caller will wait for *this* mutex (which resolves when unlock is called)
    this.mutex = nextMutex;
    return willLock;
  }
}

const scryfallMutex = new Mutex();
let lastScryfallRequest = 0;

async function delayScryfallRequest() {
  const unlock = await scryfallMutex.lock();
  try {
    const now = Date.now();
    const elapsed = now - lastScryfallRequest;
    if (elapsed < 100) {
      await new Promise((r) => setTimeout(r, 100 - elapsed));
    }
    lastScryfallRequest = Date.now();
  } finally {
    unlock();
  }
}

// In-flight request cache to deduplicate concurrent identical requests
// Using TTL to prevent stale entries from accumulating in long-running servers
interface InFlightEntry {
  promise: Promise<ScryfallApiCard[]>;
  createdAt: number;
}

const inFlightSearches = new Map<string, InFlightEntry>();
const IN_FLIGHT_TTL_MS = 60_000; // 1 minute max
const MAX_IN_FLIGHT_ENTRIES = 500;

/**
 * Deduplicate in-flight searches. If the same search is already in progress,
 * return the existing promise instead of making a duplicate API call.
 * Includes TTL to prevent memory leaks from stale entries.
 */
function deduplicatedSearch(
  cacheKey: string,
  searchFn: () => Promise<ScryfallApiCard[]>
): Promise<ScryfallApiCard[]> {
  const now = Date.now();

  // Cleanup stale entries and enforce max size periodically
  if (inFlightSearches.size > MAX_IN_FLIGHT_ENTRIES / 2) {
    for (const [key, entry] of inFlightSearches.entries()) {
      if (now - entry.createdAt > IN_FLIGHT_TTL_MS) {
        inFlightSearches.delete(key);
      }
    }
  }

  const existing = inFlightSearches.get(cacheKey);
  if (existing && now - existing.createdAt < IN_FLIGHT_TTL_MS) {
    debugLog(`[Scryfall] Deduplicating in-flight request: ${cacheKey}`);
    return existing.promise;
  }

  const promise = searchFn().finally(() => {
    inFlightSearches.delete(cacheKey);
  });

  inFlightSearches.set(cacheKey, { promise, createdAt: now });
  return promise;
}

/** Escape colon in collector numbers like "321a" (safe) */
function escapeColon(s: string | number): string {
  return String(s).replace(/:/g, "\\:");
}

interface ScryfallCardFace {
  name?: string;
  image_uris?: {
    png?: string;
    large?: string;
    normal?: string;
  };
  colors?: string[];
  mana_cost?: string;
  type_line?: string;
}

export interface ScryfallApiCard {
  name?: string;
  oracle_id?: string;
  image_uris?: {
    png?: string;
    large?: string;
    normal?: string;
  };
  card_faces?: ScryfallCardFace[];
  colors?: string[];
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  layout?: string;
  rarity?: string;
  set?: string;
  collector_number?: string;
  lang?: string;
  prints_search_uri?: string;
  // Related cards/tokens from Scryfall
  all_parts?: Array<{
    id?: string;
    component?: string; // "token", "combo_piece", "meld_part", etc.
    name?: string;
    type_line?: string;
    uri?: string;
  }>;
}

interface ScryfallResponse {
  data: ScryfallApiCard[];
  has_more: boolean;
  next_page: string | null;
}

/**
 * Generic helper to handle Scryfall pagination.
 * @param query The Scryfall search query string.
 * @param extractor Function to extract desired data from each ScryfallCard.
 */
async function fetchAllPages<T>(
  query: string,
  extractor: (card: ScryfallApiCard) => T[]
): Promise<T[]> {
  const encodedUrl = `${SCRYFALL_API}?q=${encodeURIComponent(query)}`;
  debugLog(`[Scryfall] fetchAllPages URL: ${encodedUrl}`);
  const results: T[] = [];
  let next: string | null = encodedUrl;

  try {
    while (next) {
      await delayScryfallRequest();
      // Explicitly cast the response to avoid circular inference issues with 'next'
      const resp: AxiosResponse<ScryfallResponse> =
        await AX.get<ScryfallResponse>(next);
      const { data, has_more, next_page } = resp.data;

      if (data) {
        debugLog(
          `[Scryfall] Page returned ${data.length} cards:`,
          data.slice(0, 3).map((c) => c.name)
        );
        for (const card of data) {
          results.push(...extractor(card));
        }
      }

      next = has_more ? next_page : null;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[Scryfall] Query failed:", query, msg);
  }

  return results;
}

/** Run a Scryfall search and collect PNGs (handles DFC). Paginates. */
async function fetchPngsByQuery(query: string): Promise<string[]> {
  return fetchAllPages(query, (card) => {
    const pngs: string[] = [];
    if (card?.image_uris?.png) {
      pngs.push(card.image_uris.png);
    } else if (Array.isArray(card?.card_faces)) {
      for (const face of card.card_faces) {
        if (face?.image_uris?.png) {
          pngs.push(face.image_uris.png);
        }
      }
    }
    return pngs;
  });
}

async function fetchCardsByQuery(query: string): Promise<ScryfallApiCard[]> {
  return fetchAllPages(query, (card) => [card]);
}

/** Split array into chunks of given size */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

interface CollectionResponse {
  data: ScryfallApiCard[];
  not_found: Array<{ name?: string; set?: string; collector_number?: string }>;
}

/**
 * Batch fetch cards using Scryfall's /cards/collection endpoint.
 * Checks local Proxxied DB first, only fetches missing cards from Scryfall.
 * Caches Scryfall results to DB asynchronously.
 */
export async function batchFetchCards(
  cardInfos: CardInfo[],
  language: string = "en"
): Promise<Map<string, ScryfallApiCard>> {
  const results = new Map<string, ScryfallApiCard>();
  if (!cardInfos || cardInfos.length === 0) return results;

  const lang = language.toLowerCase();

  debugLog(
    `[batchFetchCards] Starting batch fetch for ${cardInfos.length} cards, lang=${lang}`
  );

  // Step 1: Check local DB first for all cards
  const cardsToFetch: CardInfo[] = [];

  for (const ci of cardInfos) {
    // For set+number lookups, language doesn't matter (the printing determines the language)
    // For name lookups, use the requested language
    const local =
      ci.set && ci.number
        ? lookupCardBySetNumber(ci.set, ci.number, lang)
        : lookupCardByName(ci.name, lang);

    if (local && local.name) {
      // Found in local DB
      debugLog(
        `[batchFetchCards] Cache HIT for "${ci.name}" -> "${local.name}" (${local.set}:${local.collector_number})`
      );
      const key = local.name.toLowerCase();
      results.set(key, local);

      if (local.set && local.collector_number) {
        const setNumKey = `${local.set.toLowerCase()}:${local.collector_number}`;
        results.set(setNumKey, local);
      }

      // Store by face names for DFCs
      if (local.card_faces && Array.isArray(local.card_faces)) {
        for (const face of local.card_faces) {
          if (face.name) {
            const faceKey = face.name.toLowerCase();
            if (!results.has(faceKey)) {
              results.set(faceKey, local);
            }
          }
        }
      }
    } else {
      // Not found locally, need to fetch from Scryfall
      debugLog(
        `[batchFetchCards] Cache MISS for "${ci.name}" (set=${ci.set}, num=${ci.number})`
      );
      cardsToFetch.push(ci);
    }
  }

  // Step 2: Fetch missing cards from Scryfall
  debugLog(
    `[batchFetchCards] ${results.size} from cache, ${cardsToFetch.length} to fetch from Scryfall`
  );

  // Split tokens from regular cards - tokens need individual search with type:token filter
  // because the /cards/collection API doesn't support type filters
  const tokenCards = cardsToFetch.filter((ci) => ci.isToken);
  const regularCards = cardsToFetch.filter((ci) => !ci.isToken);

  // Fetch tokens using batched OR queries (much faster than individual searches)
  // The /cards/collection API doesn't support type filters, so we use search API with OR
  if (tokenCards.length > 0) {
    debugLog(
      `[batchFetchCards] Fetching ${tokenCards.length} tokens with batched OR queries`
    );

    // Build batches of token names for OR queries
    // Keep query length reasonable (~800 chars max to be safe with Scryfall limits)
    const TOKEN_BATCH_SIZE = 15; // ~15 tokens per query
    const tokenBatches: CardInfo[][] = [];
    for (let i = 0; i < tokenCards.length; i += TOKEN_BATCH_SIZE) {
      tokenBatches.push(tokenCards.slice(i, i + TOKEN_BATCH_SIZE));
    }

    const fetchTokenBatch = async (batch: CardInfo[]): Promise<void> => {
      try {
        await delayScryfallRequest();

        // Build OR query: (name:"Token A" OR name:"Token B") type:token include:extras
        const orClauses = batch
          .map((ci) => `name:"${ci.name.replace(/"/g, '\\"')}"`)
          .join(" OR ");
        const q = `(${orClauses}) type:token include:extras`;
        debugLog(
          `[batchFetchCards] Token batch query (${batch.length} tokens): ${q.substring(0, 100)}...`
        );

        const response = await AX.get<ScryfallResponse>(
          "https://api.scryfall.com/cards/search",
          {
            params: { q, unique: "prints" },
          }
        );

        if (response.data?.data) {
          for (const card of response.data.data) {
            if (!card.name) continue;
            debugLog(
              `[batchFetchCards] Token found: "${card.name}" (${card.set}:${card.collector_number})`
            );

            const key = card.name.toLowerCase();
            // Only store if not already in results (first match wins)
            if (!results.has(key)) {
              results.set(key, card);
              insertOrUpdateCard(card);
            }
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        debugLog(`[batchFetchCards] Token batch search failed: ${msg}`);

        // Fallback: if batch query fails (e.g., too long), try individual queries
        if (batch.length > 1) {
          debugLog(
            `[batchFetchCards] Falling back to individual token queries`
          );
          for (const ci of batch) {
            try {
              await delayScryfallRequest();
              const q = `!"${ci.name}" type:token include:extras`;
              const response = await AX.get<ScryfallResponse>(
                "https://api.scryfall.com/cards/search",
                {
                  params: { q, unique: "prints" },
                }
              );
              if (response.data?.data?.[0]) {
                const card = response.data.data[0];
                if (card.name) {
                  results.set(card.name.toLowerCase(), card);
                  results.set(ci.name.toLowerCase(), card);
                  insertOrUpdateCard(card);
                }
              }
            } catch {
              debugLog(
                `[batchFetchCards] Individual token search also failed for "${ci.name}"`
              );
            }
          }
        }
      }
    };

    // Process token batches sequentially (each batch is one API call)
    for (const batch of tokenBatches) {
      await fetchTokenBatch(batch);
    }
  }

  // Fetch regular cards via collection API (for speed)
  if (regularCards.length > 0) {
    const batches = chunkArray(regularCards, 75);

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      await delayScryfallRequest();

      const identifiers = batch.map((ci) => {
        if (ci.set && ci.number) {
          return {
            set: ci.set.toLowerCase(),
            collector_number: String(ci.number),
          };
        } else if (ci.set) {
          return { name: ci.name, set: ci.set.toLowerCase() };
        } else {
          return { name: ci.name };
        }
      });

      try {
        const response = await AX.post<CollectionResponse>(
          "https://api.scryfall.com/cards/collection",
          { identifiers }
        );

        if (response.data?.data) {
          debugLog(
            `[batchFetchCards] Scryfall batch ${batchIdx + 1} returned ${response.data.data.length} cards`
          );
          for (const card of response.data.data) {
            if (!card.name) continue;
            debugLog(
              `[batchFetchCards] Scryfall returned: "${card.name}" (${card.set}:${card.collector_number})`
            );

            // Store by lowercase name for lookup
            const key = card.name.toLowerCase();
            results.set(key, card);

            // Store by set+number if available
            if (card.set && card.collector_number) {
              const setNumKey = `${card.set.toLowerCase()}:${card.collector_number}`;
              results.set(setNumKey, card);
            }

            // Store by face names for DFCs
            if (card.card_faces && Array.isArray(card.card_faces)) {
              for (const face of card.card_faces) {
                if (face.name) {
                  const faceKey = face.name.toLowerCase();
                  if (!results.has(faceKey)) {
                    results.set(faceKey, card);
                  }
                }
              }
            }

            // Cache to DB asynchronously (fire-and-forget)
            insertOrUpdateCard(card);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Scryfall Batch] Batch ${batchIdx + 1} failed:`, msg);
      }
    }
  }

  // Step 3: For non-English, fetch localized versions
  if (lang !== "en" && results.size > 0) {
    const uniqueCards = new Map<string, ScryfallApiCard>();
    for (const card of results.values()) {
      if (card.set && card.collector_number) {
        const key = `${card.set}:${card.collector_number}`;
        if (!uniqueCards.has(key)) {
          uniqueCards.set(key, card);
        }
      }
    }

    for (const [key, card] of uniqueCards.entries()) {
      // Optimization: If we already have the card in the requested language, skip fetch
      if (card.lang === lang) {
        debugLog(`[batchFetchCards] Skipping localization for "${card.name}" (already have ${lang})`);
        continue;
      }

      await delayScryfallRequest();
      try {
        const url = `https://api.scryfall.com/cards/${card.set}/${card.collector_number}/${lang}`;
        const response = await AX.get<ScryfallApiCard>(url);

        if (response.data && response.data.image_uris?.png) {
          const nameKey = response.data.name?.toLowerCase();
          if (nameKey) results.set(nameKey, response.data);
          results.set(key, response.data);

          // Cache localized version to DB
          insertOrUpdateCard(response.data);
        }
      } catch {
        // Localized version not available, keep English
      }
    }
  }

  return results;
}

/**
 * Look up a card from the batch results map.
 * Tries set+number first, then name+set, then name only.
 */
export function lookupCardFromBatch(
  batchResults: Map<string, ScryfallApiCard>,
  cardInfo: CardInfo
): ScryfallApiCard | undefined {
  debugLog(
    `[lookupCardFromBatch] Looking for "${cardInfo.name}" (set=${cardInfo.set}, num=${cardInfo.number})`
  );
  debugLog(
    `[lookupCardFromBatch] Batch has ${batchResults.size} entries, keys:`,
    Array.from(batchResults.keys()).slice(0, 10)
  );

  // Try set+number first (most specific)
  if (cardInfo.set && cardInfo.number) {
    const setNumKey = `${cardInfo.set.toLowerCase()}:${cardInfo.number}`;
    const exact = batchResults.get(setNumKey);
    if (exact) {
      debugLog(`[lookupCardFromBatch] Found by set+number: "${exact.name}"`);
      return exact;
    }
  }

  // Fall back to name lookup
  const nameKey = cardInfo.name.toLowerCase();
  const byName = batchResults.get(nameKey);
  debugLog(
    `[lookupCardFromBatch] Name key "${nameKey}" -> ${byName ? `"${byName.name}"` : "NOT FOUND"}`
  );
  return byName;
}

/**
 * Generic helper to execute a search strategy with language fallback.
 * @param searchFn Function to execute the search (returns a list of results).
 * @param queryBuilder Function to build the query string given a language.
 * @param language The preferred language.
 * @param fallbackToEnglish Whether to fallback to English if the preferred language fails.
 */
async function searchScryfallWithFallback<T>(
  searchFn: (query: string) => Promise<T[]>,
  queryBuilder: (lang: string) => string,
  language: string,
  fallbackToEnglish: boolean
): Promise<T[]> {
  const lang = (language || "en").toLowerCase();
  const q = queryBuilder(lang);
  debugLog(`[Scryfall] Query: ${q}`);
  let results = await searchFn(q);
  debugLog(`[Scryfall] Results: ${results.length}`);

  if (!results.length && fallbackToEnglish && lang !== "en") {
    const qEn = queryBuilder("en");
    debugLog(`[Scryfall] Fallback query: ${qEn}`);
    results = await searchFn(qEn);
  }

  return results;
}

/**
 * Core: given a CardInfo { name, set?, number?, language? }, return PNG urls.
 * If set && number => try exact printing (that language); else set+name; else name-only.
 * `unique` can be "art" or "prints".
 */
export async function getImagesForCardInfo(
  cardInfo: CardInfo,
  unique = "art",
  language = "en",
  fallbackToEnglish = true
): Promise<string[]> {
  const { name, set, number } = cardInfo || {};

  // Helper to build query based on strategy
  const executeStrategy = (queryTemplate: (lang: string) => string) => {
    return searchScryfallWithFallback(
      fetchPngsByQuery,
      queryTemplate,
      language,
      fallbackToEnglish
    );
  };

  // 1) Exact printing: set + collector number + name
  if (unique === "prints" && set && number) {
    const results = await executeStrategy(
      (lang) =>
        `set:${set} number:${escapeColon(number)} name:"${name}" include:extras unique:prints lang:${lang}`
    );
    if (results.length) return results;
  }

  // 2) Set + name (all printings in set for that name)
  if (unique === "prints" && set && !number) {
    const results = await executeStrategy(
      (lang) =>
        `set:${set} name:"${name}" include:extras unique:prints lang:${lang}`
    );
    if (results.length) return results;
  }

  // 3) Name-only search - this is the main strategy for unique:art
  return executeStrategy(
    (lang) => `!"${name}" include:extras unique:${unique} lang:${lang}`
  );
}

/**
 * Returns full card data (including images and metadata) for a CardInfo.
 */
export async function getCardsWithImagesForCardInfo(
  cardInfo: CardInfo,
  unique = "art",
  language = "en",
  fallbackToEnglish = true
): Promise<ScryfallApiCard[]> {
  const { name, set, number, isToken } = cardInfo || {};

  // Create cache key for request deduplication
  const cacheKey = `cards:${name}:${set || ""}:${number || ""}:${unique}:${language}:${isToken || false}`;

  return deduplicatedSearch(cacheKey, async () => {
    // Add type:token filter for explicit token searches
    const typeFilter = isToken ? " type:token" : "";

    const executeStrategy = (queryTemplate: (lang: string) => string) => {
      return searchScryfallWithFallback(
        fetchCardsByQuery,
        queryTemplate,
        language,
        fallbackToEnglish
      );
    };

    // 1) Exact printing - when user specifies set AND number
    // This takes priority regardless of unique parameter
    if (set && number) {
      const results = await executeStrategy(
        (lang) =>
          `set:${set} number:${escapeColon(number)} name:"${name}"${typeFilter} include:extras unique:prints lang:${lang}`
      );
      if (results.length) return results;
      // If no results with exact match, fall through to broader search
    }

    // 2) Set + name - when user specifies set but not number
    if (set && !number) {
      const results = await executeStrategy(
        (lang) =>
          `set:${set} name:"${name}"${typeFilter} include:extras unique:prints lang:${lang}`
      );
      if (results.length) return results;
      // If no results with set filter, fall through to name-only
    }

    // 3) Name-only search - get all arts/prints based on unique parameter
    const results = await executeStrategy(
      (lang) =>
        `!"${name}"${typeFilter} include:extras unique:${unique} lang:${lang}`
    );

    // Score and sort results to prioritize best matches
    const queryLower = name.toLowerCase();

    const scoreCard = (card: ScryfallApiCard): number => {
      let score = 0;
      const cardName = card.name?.toLowerCase() || "";

      // Exact full name match (highest priority)
      if (cardName === queryLower) {
        score += 100;
      }
      // DFC: query matches one of the faces
      else if (cardName.includes(" // ")) {
        const [front, back] = cardName.split(" // ").map((s) => s.trim());
        if (front === queryLower || back === queryLower) {
          score += 90;
        }
      }
      // Query is DFC format, card matches one face
      else if (queryLower.includes(" // ")) {
        const [front, back] = queryLower.split(" // ").map((s) => s.trim());
        if (cardName === front || cardName === back) {
          score += 90;
        }
      }

      // Deprioritize art_series (often have wrong metadata)
      if (card.layout === "art_series") {
        score -= 50;
      }

      return score;
    };

    results.sort((a, b) => scoreCard(b) - scoreCard(a));

    debugLog(
      `[Scryfall] Sorted results for "${name}":`,
      results.slice(0, 3).map((c) => `${c.name} (score: ${scoreCard(c)})`)
    );

    return results;
  });
}

/**
 * Given a CardInfo, find the best matching card data from Scryfall.
 * Returns a single Scryfall card object or null.
 */
export async function getCardDataForCardInfo(
  cardInfo: CardInfo,
  language = "en",
  fallbackToEnglish = true
): Promise<ScryfallApiCard | null> {
  const { name, set, number, isToken } = cardInfo || {};
  if (!name) return null;

  // Add type:token filter for explicit token searches
  const tokenFilter = isToken ? " type:token" : "";

  const executeStrategy = (queryTemplate: (lang: string) => string) => {
    return searchScryfallWithFallback(
      fetchCardsByQuery,
      queryTemplate,
      language,
      fallbackToEnglish
    );
  };

  // Strategy 1: Exact printing (set, number, name, lang)
  if (set && number) {
    const cards = await executeStrategy(
      (lang) =>
        `set:${set} number:${escapeColon(number)} name:"${name}" include:extras lang:${lang}`
    );
    if (cards.length) return cards[0];
  }

  // Strategy 2: Set + name
  if (set) {
    const cards = await executeStrategy(
      (lang) =>
        `set:${set} name:"${name}" include:extras unique:prints lang:${lang}`
    );
    if (cards.length) return cards[0];
  }

  // Helper to filter out Art Series cards (they have type_line: "Card // Card" and cmc: 0)
  const isRealCard = (card: ScryfallApiCard) => {
    if (card.type_line === "Card // Card") return false;
    if (
      card.set?.startsWith("ac") &&
      card.rarity === "common" &&
      card.cmc === 0
    )
      return false;
    return true;
  };

  // Strategy 3: Name-only exact match
  // DO NOT use include:extras here - it matches Art Series cards with cmc:0, type:"Card // Card"
  // We use unique:art to get different art options, and order:released to prefer newer cards
  const exactCards = await executeStrategy(
    (lang) => `!"${name}" unique:art order:released lang:${lang}${tokenFilter}`
  );
  const realExactCards = exactCards.filter(isRealCard);
  if (realExactCards.length) return realExactCards[0];

  // Strategy 4: Fuzzy name search (for MPC names with missing punctuation like "Conjurers Closet")
  // Uses name: operator which does partial/fuzzy matching
  // DO NOT use include:extras - it matches Art Series cards
  const fuzzyCards = await executeStrategy(
    (lang) =>
      `name:"${name}" unique:art order:released lang:${lang}${tokenFilter}`
  );
  const realFuzzyCards = fuzzyCards.filter(isRealCard);
  return realFuzzyCards[0] || null;
}

export async function getScryfallPngImagesForCard(
  cardName: string,
  unique = "art",
  language = "en",
  fallbackToEnglish = true
): Promise<string[]> {
  return searchScryfallWithFallback(
    fetchPngsByQuery,
    (lang) => `!"${cardName}" include:extras unique:${unique} lang:${lang}`,
    language,
    fallbackToEnglish
  );
}

export async function getScryfallPngImagesForCardPrints(
  name: string,
  language = "en",
  fallbackToEnglish = true
): Promise<string[]> {
  return searchScryfallWithFallback(
    fetchPngsByQuery,
    (lang) => `!"${name}" include:extras unique:prints lang:${lang}`,
    language,
    fallbackToEnglish
  );
}
