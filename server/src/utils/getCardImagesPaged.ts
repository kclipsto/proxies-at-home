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
  image_uris?: {
    png?: string;
  };
  colors?: string[];
  mana_cost?: string;
}

export interface ScryfallApiCard {
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

  // 1) Exact printing
  if (unique === "prints" && set && number) {
    const results = await executeStrategy((lang) =>
      `set:${set} number:${escapeColon(number)} name:"${name}" include:extras unique:prints lang:${lang}`
    );
    if (results.length) return results;
  }

  // 2) Set + name
  if (unique === "prints" && set && !number) {
    const results = await executeStrategy((lang) =>
      `set:${set} name:"${name}" include:extras unique:prints lang:${lang}`
    );
    if (results.length) return results;
  }

  // 3) Name-only
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