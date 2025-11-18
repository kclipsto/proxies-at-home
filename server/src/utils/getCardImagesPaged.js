const axios = require("axios");

const SCRYFALL_API = "https://api.scryfall.com/cards/search";

// Optional: a polite UA helps if you get rate-limited
const AX = axios.create({
  headers: { "User-Agent": "Proxxied/1.0 (contact: your-email@example.com)" },
});

// 100ms delay between Scryfall requests (their recommendation)
let lastScryfallRequest = 0;
async function delayScryfallRequest() {
  const now = Date.now();
  const elapsed = now - lastScryfallRequest;
  if (elapsed < 100) {
    await new Promise(r => setTimeout(r, 100 - elapsed));
  }
  lastScryfallRequest = Date.now();
}

/**
 * Core: given a CardInfo { name, set?, number?, language? }, return PNG urls.
 * If set && number => try exact printing (that language); else set+name; else name-only.
 * `unique` can be "art" or "prints".
 */
async function getImagesForCardInfo(
  cardInfo,
  unique = "art",
  language = "en",
  fallbackToEnglish = true
) {
  const { name, set, number } = cardInfo || {};
  const lang = (language || "en").toLowerCase();

  // If we want unique arts, skip set/number entirely (a specific printing has only one art)
  // Only use set/number when unique=prints (getting all printings of a specific card)
  if (unique === "prints" && set && number) {
    // 1) Exact printing: set + collector number + name
    const q = `set:${set} number:${escapeColon(
      number
    )} name:"${name}" include:extras unique:prints lang:${lang}`;
    let urls = await fetchPngsByQuery(q);
    if (!urls.length && fallbackToEnglish && lang !== "en") {
      const qEn = `set:${set} number:${escapeColon(
        number
      )} name:"${name}" include:extras unique:prints lang:en`;
      urls = await fetchPngsByQuery(qEn);
    }
    if (urls.length) return urls;
    // fall through to next strategy if exact failed
  }

  // 2) Set + name (all printings in set for that name)
  // Only use this if unique=prints, otherwise skip to name-only
  if (unique === "prints" && set && !number) {
    const q = `set:${set} name:"${name}" include:extras unique:prints lang:${lang}`;
    let urls = await fetchPngsByQuery(q);
    if (!urls.length && fallbackToEnglish && lang !== "en") {
      const qEn = `set:${set} name:"${name}" include:extras unique:prints lang:en`;
      urls = await fetchPngsByQuery(qEn);
    }
    if (urls.length) return urls;
    // fallback if empty
  }

  // 3) Name-only search - this is the main strategy for unique:art
  const q = `!"${name}" include:extras unique:${unique} lang:${lang}`;
  let urls = await fetchPngsByQuery(q);
  if (!urls.length && fallbackToEnglish && lang !== "en") {
    const qEn = `!"${name}" include:extras unique:${unique} lang:en`;
    urls = await fetchPngsByQuery(qEn);
  }
  return urls;
}

/** Escape colon in collector numbers like "321a" (safe) */
function escapeColon(s) {
  return String(s).replace(/:/g, "\\:");
}

/** Run a Scryfall search and collect PNGs (handles DFC). Paginates. */
async function fetchPngsByQuery(query) {
  const encodedUrl = `${SCRYFALL_API}?q=${encodeURIComponent(query)}`;
  const pngs = [];
  let next = encodedUrl;

  try {
    while (next) {
      await delayScryfallRequest();
      const resp = await AX.get(next);
      const { data, has_more, next_page } = resp.data;

      for (const card of data || []) {
        if (card?.image_uris?.png) {
          pngs.push(card.image_uris.png);
        } else if (Array.isArray(card?.card_faces)) {
          for (const face of card.card_faces) {
            if (face?.image_uris?.png) {
              pngs.push(face.image_uris.png);
            }
          }
        }
      }

      next = has_more ? next_page : null;
    }
  } catch (err) {
    console.warn("[Scryfall] Query failed:", query, err?.message);
  }

  return pngs;
}

async function fetchCardsByQuery(query) {
  const encodedUrl = `${SCRYFALL_API}?q=${encodeURIComponent(query)}`;
  const cards = [];
  let next = encodedUrl;

  try {
    while (next) {
      await delayScryfallRequest();
      const resp = await AX.get(next);
      const { data, has_more, next_page } = resp.data;
      if (data) {
        cards.push(...data);
      }
      next = has_more ? next_page : null;
    }
  } catch (err) {
    console.warn("[Scryfall] Query failed:", query, err?.message);
  }

  return cards;
}

/**
 * Given a CardInfo, find the best matching card data from Scryfall.
 * Returns a single Scryfall card object or null.
 */
async function getCardDataForCardInfo(
  cardInfo,
  language = "en",
  fallbackToEnglish = true
) {
  const { name, set, number } = cardInfo || {};
  const lang = (language || "en").toLowerCase();

  // Strategy 1: Exact printing (set, number, name, lang)
  if (set && number) {
    const q = `set:${set} number:${escapeColon(
      number
    )} name:"${name}" include:extras lang:${lang}`;
    let cards = await fetchCardsByQuery(q);
    if (!cards.length && fallbackToEnglish && lang !== "en") {
      const qEn = `set:${set} number:${escapeColon(
        number
      )} name:"${name}" include:extras lang:en`;
      cards = await fetchCardsByQuery(qEn);
    }
    if (cards.length) return cards[0];
  }

  // Strategy 2: Set + name
  if (set) {
    const q = `set:${set} name:"${name}" include:extras unique:prints lang:${lang}`;
    let cards = await fetchCardsByQuery(q);
    if (!cards.length && fallbackToEnglish && lang !== "en") {
      const qEn = `set:${set} name:"${name}" include:extras unique:prints lang:en`;
      cards = await fetchCardsByQuery(qEn);
    }
    if (cards.length) return cards[0];
  }

  // Strategy 3: Name-only exact match
  const q = `!"${name}" include:extras unique:prints lang:${lang}`;
  let cards = await fetchCardsByQuery(q);
  if (!cards.length && fallbackToEnglish && lang !== "en") {
    const qEn = `!"${name}" include:extras unique:prints lang:en`;
    cards = await fetchCardsByQuery(qEn);
  }
  return cards[0] || null;
}

module.exports.getCardDataForCardInfo = getCardDataForCardInfo;
module.exports.getImagesForCardInfo = getImagesForCardInfo;
module.exports.getScryfallPngImagesForCard = async (cardName, unique = "art", language = "en", fallbackToEnglish = true) => {
  // name-only helper with language support
  const q = `!"${cardName}" include:extras unique:${unique} lang:${(language || "en").toLowerCase()}`;
  let urls = await fetchPngsByQuery(q);
  if (!urls.length && fallbackToEnglish && language !== "en") {
    const qEn = `!"${cardName}" include:extras unique:${unique} lang:en`;
    urls = await fetchPngsByQuery(qEn);
  }
  return urls;
};
module.exports.getScryfallPngImagesForCardPrints = async (name, language = "en", fallbackToEnglish = true) => {
  const q = `!"${name}" include:extras unique:prints lang:${(language || "en").toLowerCase()}`;
  let urls = await fetchPngsByQuery(q);
  if (!urls.length && fallbackToEnglish && language !== "en") {
    const qEn = `!"${name}" include:extras unique:prints lang:en`;
    urls = await fetchPngsByQuery(qEn);
  }
  return urls;
};