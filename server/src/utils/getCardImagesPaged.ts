import axios, { type AxiosResponse } from "axios";
import type { CardInfo } from "../../../shared/types.js";

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
      await new Promise(r => setTimeout(r, 100 - elapsed));
    }
    lastScryfallRequest = Date.now();
  } finally {
    unlock();
  }
}

/** Escape colon in collector numbers like "321a" (safe) */
function escapeColon(s: string | number): string {
  return String(s).replace(/:/g, "\\:");
}

interface ScryfallCardFace {
  name?: string;
  image_uris?: {
    png?: string;
  };
  colors?: string[];
  mana_cost?: string;
}

export interface ScryfallApiCard {
  name?: string;
  image_uris?: {
    png?: string;
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
  const results: T[] = [];
  let next: string | null = encodedUrl;

  try {
    while (next) {
      await delayScryfallRequest();
      // Explicitly cast the response to avoid circular inference issues with 'next'
      const resp: AxiosResponse<ScryfallResponse> = await AX.get<ScryfallResponse>(next);
      const { data, has_more, next_page } = resp.data;

      if (data) {
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
 * Much faster than individual searches - up to 75 cards per request.
 * Returns a Map keyed by a normalized identifier for easy lookup.
 * 
 * For non-English languages, fetches localized versions after the initial batch.
 */
export async function batchFetchCards(
  cardInfos: CardInfo[],
  language: string = "en"
): Promise<Map<string, ScryfallApiCard>> {
  const results = new Map<string, ScryfallApiCard>();
  if (!cardInfos || cardInfos.length === 0) return results;

  const lang = language.toLowerCase();
  const batches = chunkArray(cardInfos, 75);

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    await delayScryfallRequest();

    const identifiers = batch.map(ci => {
      // Build identifier based on available info
      // Priority: set+number > name+set > name only
      if (ci.set && ci.number) {
        return { set: ci.set.toLowerCase(), collector_number: String(ci.number) };
      } else if (ci.set) {
        return { name: ci.name, set: ci.set.toLowerCase() };
      } else {
        return { name: ci.name };
      }
    });

    try {
      const response = await AX.post<CollectionResponse>(
        'https://api.scryfall.com/cards/collection',
        { identifiers }
      );

      if (response.data?.data) {
        for (let i = 0; i < response.data.data.length; i++) {
          const card = response.data.data[i];
          if (!card.name) continue; // Skip cards without name

          // Store by lowercase name for lookup
          const key = card.name.toLowerCase();
          results.set(key, card);

          // Also store by set+number if available for precise lookups
          if (card.set && card.collector_number) {
            const setNumKey = `${card.set.toLowerCase()}:${card.collector_number}`;
            results.set(setNumKey, card);
          }

          // Store by individual face names for DFCs (double-faced cards)
          // This allows lookups by front face name (e.g., "Bala Ged Recovery")
          // to find the full card ("Bala Ged Recovery // Bala Ged Sanctuary")
          if (card.card_faces && Array.isArray(card.card_faces)) {
            for (const face of card.card_faces) {
              if (face.name) {
                const faceKey = face.name.toLowerCase();
                // Only set if not already present (prefer full name match)
                if (!results.has(faceKey)) {
                  results.set(faceKey, card);
                }
              }
            }
          }
        }
      }


    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Scryfall Batch] Batch ${batchIdx + 1} failed:`, msg);
    }
  }



  // For non-English, fetch localized versions in parallel
  if (lang !== "en" && results.size > 0) {
    // Get unique cards by set+number (to avoid duplicate fetches)
    const uniqueCards = new Map<string, ScryfallApiCard>();
    for (const card of results.values()) {
      if (card.set && card.collector_number) {
        const key = `${card.set}:${card.collector_number}`;
        if (!uniqueCards.has(key)) {
          uniqueCards.set(key, card);
        }
      }
    }

    // Fetch localized versions sequentially with proper rate limiting
    for (const [key, card] of uniqueCards.entries()) {
      await delayScryfallRequest();
      try {
        // GET /cards/:set/:number/:lang
        const url = `https://api.scryfall.com/cards/${card.set}/${card.collector_number}/${lang}`;
        const response = await AX.get<ScryfallApiCard>(url);

        if (response.data && response.data.image_uris?.png) {
          // Replace English card with localized version
          const nameKey = response.data.name?.toLowerCase();
          if (nameKey) results.set(nameKey, response.data);
          results.set(key, response.data);
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
  // Try set+number first (most specific)
  if (cardInfo.set && cardInfo.number) {
    const setNumKey = `${cardInfo.set.toLowerCase()}:${cardInfo.number}`;
    const exact = batchResults.get(setNumKey);
    if (exact) return exact;
  }

  // Fall back to name lookup
  return batchResults.get(cardInfo.name.toLowerCase());
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
  let results = await searchFn(q);

  if (!results.length && fallbackToEnglish && lang !== "en") {
    const qEn = queryBuilder("en");
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
    return searchScryfallWithFallback(fetchPngsByQuery, queryTemplate, language, fallbackToEnglish);
  };

  // 1) Exact printing: set + collector number + name
  if (unique === "prints" && set && number) {
    const results = await executeStrategy((lang) =>
      `set:${set} number:${escapeColon(number)} name:"${name}" include:extras unique:prints lang:${lang}`
    );
    if (results.length) return results;
  }

  // 2) Set + name (all printings in set for that name)
  if (unique === "prints" && set && !number) {
    const results = await executeStrategy((lang) =>
      `set:${set} name:"${name}" include:extras unique:prints lang:${lang}`
    );
    if (results.length) return results;
  }

  // 3) Name-only search - this is the main strategy for unique:art
  return executeStrategy((lang) =>
    `!"${name}" include:extras unique:${unique} lang:${lang}`
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
  const { name, set, number } = cardInfo || {};

  const executeStrategy = (queryTemplate: (lang: string) => string) => {
    return searchScryfallWithFallback(fetchCardsByQuery, queryTemplate, language, fallbackToEnglish);
  };

  // 1) Exact printing - when user specifies set AND number
  // This takes priority regardless of unique parameter
  if (set && number) {
    const results = await executeStrategy((lang) =>
      `set:${set} number:${escapeColon(number)} name:"${name}" include:extras unique:prints lang:${lang}`
    );
    if (results.length) return results;
    // If no results with exact match, fall through to broader search
  }

  // 2) Set + name - when user specifies set but not number
  if (set && !number) {
    const results = await executeStrategy((lang) =>
      `set:${set} name:"${name}" include:extras unique:prints lang:${lang}`
    );
    if (results.length) return results;
    // If no results with set filter, fall through to name-only
  }

  // 3) Name-only search - get all arts/prints based on unique parameter
  const results = await executeStrategy((lang) =>
    `!"${name}" include:extras unique:${unique} lang:${lang}`
  );

  // Prioritize non-art-series cards
  // Art series cards often have CMC 0 and type "Card", which is not useful for metadata
  results.sort((a, b) => {
    const aIsArt = a.layout === "art_series";
    const bIsArt = b.layout === "art_series";
    if (aIsArt && !bIsArt) return 1;
    if (!aIsArt && bIsArt) return -1;
    return 0;
  });

  return results;
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
  const { name, set, number } = cardInfo || {};
  if (!name) return null;

  const executeStrategy = (queryTemplate: (lang: string) => string) => {
    return searchScryfallWithFallback(fetchCardsByQuery, queryTemplate, language, fallbackToEnglish);
  };

  // Strategy 1: Exact printing (set, number, name, lang)
  if (set && number) {
    const cards = await executeStrategy((lang) =>
      `set:${set} number:${escapeColon(number)} name:"${name}" include:extras lang:${lang}`
    );
    if (cards.length) return cards[0];
  }

  // Strategy 2: Set + name
  if (set) {
    const cards = await executeStrategy((lang) =>
      `set:${set} name:"${name}" include:extras unique:prints lang:${lang}`
    );
    if (cards.length) return cards[0];
  }

  // Strategy 3: Name-only exact match
  // We use unique:art to get different art options, and order:released to prefer newer cards
  const cards = await executeStrategy((lang) =>
    `!"${name}" include:extras unique:art order:released lang:${lang}`
  );
  return cards[0] || null;
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