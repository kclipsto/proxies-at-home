import express, { type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { getCardDataForCardInfo, batchFetchCards } from "../utils/getCardImagesPaged.js";
import { extractTokenParts } from "../utils/tokenUtils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AX = axios.create({
  timeout: 6000, // 6s per outbound request (reduced from 12s)
  headers: { "User-Agent": "Proxxied/1.0 (+contact@example.com)" },
  validateStatus: (s) => s >= 200 && s < 500, // surface 4xx/429 to logic
});

// Separate axios instance for Google Drive/MPC images with longer timeout
const AX_GDRIVE = axios.create({
  timeout: 30000, // 30s for large Google Drive files
  headers: { "User-Agent": "Proxxied/1.0 (+contact@example.com)" },
  validateStatus: (s) => s >= 200 && s < 500,
});

// Improved retry with exponential backoff (reduced retries for faster failure)
async function getWithRetry(url: string, opts: AxiosRequestConfig = {}, tries = 2): Promise<AxiosResponse> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await AX.get(url, opts);
      if (res.status === 429) {
        const wait = Number(res.headers["retry-after"] || 5);
        console.log(`[429] Rate limited. Waiting ${wait}s before retry...`);
        await new Promise(r => setTimeout(r, wait * 1000));
        continue;
      }
      if (res.status >= 200 && res.status < 300) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
      // Exponential backoff: 500ms, 1s (reduced from 1s, 2s, 4s...)
      const backoffMs = Math.min(500 * Math.pow(2, i), 2000);
      const jitter = Math.random() * 250;
      await new Promise(r => setTimeout(r, backoffMs + jitter));
    }
  }
  throw lastErr;
}



// Tiny p-limit (cap parallel Scryfall calls)
function pLimit(concurrency: number) {
  type Task = () => Promise<unknown>;
  type Resolver = (value: unknown) => void;
  type Rejector = (reason?: unknown) => void;

  const q: [Task, Resolver, Rejector][] = [];
  let active = 0;

  const run = async (fn: Task, resolve: Resolver, reject: Rejector) => {
    active++;
    try {
      resolve(await fn());
    }
    catch (e) {
      reject(e);
    }
    finally {
      active--;
      if (q.length) {
        const next = q.shift();
        if (next) {
          const [nextFn, nextRes, nextRej] = next;
          run(nextFn, nextRes, nextRej);
        }
      }
    }
  };
  return <T>(fn: () => Promise<T>) => new Promise<T>((resolve, reject) => {
    const wrappedResolve = resolve as Resolver;
    const wrappedReject = reject as Rejector;
    if (active < concurrency) run(fn, wrappedResolve, wrappedReject);
    else q.push([fn, wrappedResolve, wrappedReject]);
  });
}
// Concurrency limiters:
// - scryfallApiLimit: For Scryfall JSON API calls (card search, collection lookups)
// - imageFetchLimit: For outbound image fetches (Scryfall CDN, Google Drive)
const scryfallApiLimit = pLimit(6);
const imageFetchLimit = pLimit(10);

// -------------------- cache helpers --------------------

const imageRouter = express.Router();

const cacheDir = path.join(__dirname, "..", "..", "data", "cached-images");
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// Cache size management with LRU eviction (12GB limit for Koyeb eLarge 20GB disk)
const MAX_CACHE_SIZE_BYTES = 12 * 1024 * 1024 * 1024; // 12GB (leaves 8GB for system/logs)
let lastCacheCleanup = 0;

// Track in-progress writes to prevent concurrent file corruption
const writeInProgress = new Set<string>();

// In-memory cache of URL→path mappings to avoid fs.existsSync syscalls
import { LRUCache } from "../utils/lruCache.js";
const urlPathCache = new LRUCache<string, string>(5000); // Cache 5000 hot URLs

async function checkAndCleanCache() {
  const now = Date.now();
  // Only check every 5 minutes to avoid excessive disk I/O
  if (now - lastCacheCleanup < 5 * 60 * 1000) return;
  lastCacheCleanup = now;

  try {
    // Use async filesystem operations to avoid blocking event loop
    const files = await fs.promises.readdir(cacheDir);
    const fileStats: { path: string; atime: number; size: number }[] = [];
    let totalSize = 0;

    for (const file of files) {
      const filePath = path.join(cacheDir, file);
      try {
        const stats = await fs.promises.stat(filePath);
        if (stats.isFile()) {
          fileStats.push({ path: filePath, atime: stats.atimeMs, size: stats.size });
          totalSize += stats.size;
        }
      } catch {
        // File might have been deleted, skip it
        continue;
      }
    }

    if (totalSize > MAX_CACHE_SIZE_BYTES) {
      console.log(`[CACHE] Size ${(totalSize / 1024 / 1024 / 1024).toFixed(2)}GB exceeds 12GB limit. Cleaning...`);

      fileStats.sort((a, b) => a.atime - b.atime);

      let removedSize = 0;
      let removedCount = 0;
      // Remove oldest files until we're under 10GB (leave 2GB buffer)
      const targetSize = 10 * 1024 * 1024 * 1024;

      for (const file of fileStats) {
        if (totalSize - removedSize < targetSize) break;
        try {
          await fs.promises.unlink(file.path);
          removedSize += file.size;
          removedCount++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[CACHE] Failed to delete ${file.path}:`, msg);
        }
      }

      console.log(`[CACHE] Removed ${removedCount} files (${(removedSize / 1024 / 1024 / 1024).toFixed(2)}GB)`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CACHE] Cleanup error:", msg);
  }
}

// Make a stable cache filename from the FULL raw URL (path + query)
function cachePathFromUrl(originalUrl: string) {
  const hash = crypto.createHash("sha1").update(originalUrl).digest("hex");

  // try to preserve the real extension; default to .png
  let ext = ".png";
  try {
    const u = new URL(originalUrl);
    const m = u.pathname.match(/\.(png|jpg|jpeg|webp)$/i);
    if (m) ext = m[0].toLowerCase();
  } catch {
    // ignore; keep .png
  }
  return path.join(cacheDir, `${hash}${ext}`);
}

// -------------------- API: batch enrich cards --------------------
interface EnrichRequestBody {
  cards: Array<{ name: string; set?: string; number?: string; isToken?: boolean }>;
}

interface EnrichedCard {
  name: string;
  set?: string;
  number?: string;
  colors?: string[];
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  rarity?: string;
  lang?: string;
  layout?: string;
  card_faces?: Array<{
    name: string;
    type_line?: string;
    mana_cost?: string;
    colors?: string[];
    image_uris?: {
      large?: string;
      normal?: string;
      png?: string;
    };
  }>;
  token_parts?: Array<{
    id?: string;
    name: string;
    type_line?: string;
    uri?: string;
  }>;
}

/**
 * Extract enriched metadata from a Scryfall API card
 */
function extractEnrichedCard(
  card: { name: string; set?: string; number?: string },
  data: import("../utils/getCardImagesPaged.js").ScryfallApiCard
): EnrichedCard {
  // Extract colors from card_faces for DFCs
  let colors = data.colors;
  let mana_cost = data.mana_cost;

  if ((!colors || !mana_cost) && data.card_faces && data.card_faces.length > 0) {
    if (!colors) colors = data.card_faces[0].colors;
    if (!mana_cost) mana_cost = data.card_faces[0].mana_cost;
  }

  // Extract token parts
  const token_parts = extractTokenParts(data);

  return {
    name: data.name ?? card.name, // Use canonical Scryfall name, fall back to query name
    set: data.set || card.set,
    number: data.collector_number || card.number,
    colors,
    mana_cost,
    cmc: data.cmc,
    type_line: data.type_line,
    rarity: data.rarity,
    lang: data.lang,
    layout: data.layout,
    card_faces: data.card_faces?.map(f => ({
      name: f.name || "",
      type_line: f.type_line,
      mana_cost: f.mana_cost,
      colors: f.colors,
      image_uris: f.image_uris,
    })),
    token_parts, // Include token parts in enrichment response
  };
}

imageRouter.post("/enrich", async (req: Request<unknown, unknown, EnrichRequestBody>, res: Response) => {
  const cards = Array.isArray(req.body.cards) ? req.body.cards : [];

  if (cards.length === 0) {
    return res.json([]);
  }

  if (cards.length > 100) {
    return res.status(400).json({ error: "Maximum 100 cards per batch" });
  }

  try {
    // Step 1: Use Collection API for fast batch lookup
    const cardInfos = cards.map(c => ({
      name: c.name,
      set: c.set,
      number: c.number,
    }));

    const batchResults = await batchFetchCards(cardInfos, "en");

    // Step 2: Map results back to original cards
    const results: (EnrichedCard | null)[] = [];
    const notFoundCards: Array<{ index: number; card: { name: string; set?: string; number?: string; isToken?: boolean } }> = [];

    // Helper to normalize names for loose matching (remove punctuation, lowercase)
    const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];

      // Try to find in batch results
      let found: import("../utils/getCardImagesPaged.js").ScryfallApiCard | undefined;

      // Try set+number first
      if (card.set && card.number) {
        const setNumKey = `${card.set.toLowerCase()}:${card.number}`;
        found = batchResults.get(setNumKey);
      }

      // Fall back to name lookup
      if (!found) {
        found = batchResults.get(card.name.toLowerCase());
      }

      // Validate that found card name loosely matches query name
      // This catches cases where MPC names differ from Scryfall (e.g., "Conjurers Closet" vs "Conjurer's Closet")
      if (found && found.name) {
        const queryNorm = normalizeName(card.name);
        const foundNorm = normalizeName(found.name);
        // Also check DFC face names
        const faceNames = found.card_faces?.map(f => normalizeName(f.name || '')) || [];
        if (foundNorm !== queryNorm && !faceNames.includes(queryNorm)) {
          // Name doesn't match - treat as not found to trigger individual search
          found = undefined;
        }
      }

      if (found) {
        results[i] = extractEnrichedCard(card, found);
      } else {
        results[i] = null; // Placeholder
        notFoundCards.push({ index: i, card });
      }
    }

    // Step 3: Fallback to search API for not_found cards
    if (notFoundCards.length > 0) {
      await Promise.all(
        notFoundCards.map(({ index, card }) =>
          scryfallApiLimit(async () => {
            const timeout = new Promise<null>((_, rej) =>
              setTimeout(() => rej(new Error("scryfall-timeout")), 20000)
            );
            const task = (async (): Promise<EnrichedCard | null> => {
              const data = await getCardDataForCardInfo({
                name: card.name,
                set: card.set,
                number: card.number,
                isToken: card.isToken,
              });
              if (data) {
                return extractEnrichedCard(card, data);
              }
              return null;
            })();

            try {
              const result = await Promise.race([task, timeout]);
              results[index] = result;
            } catch {
              console.warn(`[Enrich] Timeout for card: ${card.name}`);
              results[index] = null;
            }
          })
        )
      );
    }

    return res.json(results);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Enrich] Error:", msg);
    return res.status(500).json({ error: "Failed to enrich cards." });
  }
});

// -------------------- API: fetch token parts for cards --------------------
interface TokensRequestBody {
  cards: Array<{ name: string; set?: string; number?: string }>;
}

interface TokenPart {
  id?: string;
  name: string;
  type_line?: string;
  uri?: string;
}

interface CardTokenResponse {
  name: string;
  token_parts?: TokenPart[];
}

imageRouter.post("/tokens", async (req: Request<unknown, unknown, TokensRequestBody>, res: Response) => {
  const cards = Array.isArray(req.body.cards) ? req.body.cards : [];

  if (cards.length === 0) {
    return res.json([]);
  }

  if (cards.length > 100) {
    return res.status(400).json({ error: "Maximum 100 cards per batch" });
  }

  try {
    // Use Collection API for fast batch lookup
    const cardInfos = cards.map(c => ({
      name: c.name,
      set: c.set,
      number: c.number,
    }));

    const batchResults = await batchFetchCards(cardInfos, "en");

    // Map results back with token_parts
    const results: CardTokenResponse[] = [];

    for (const card of cards) {
      // Try to find in batch results
      let found: import("../utils/getCardImagesPaged.js").ScryfallApiCard | undefined;

      // Try set+number first
      if (card.set && card.number) {
        const setNumKey = `${card.set.toLowerCase()}:${card.number}`;
        found = batchResults.get(setNumKey);
      }

      // Fall back to name lookup
      if (!found) {
        found = batchResults.get(card.name.toLowerCase());
      }

      if (found) {
        const tokenParts = extractTokenParts(found);
        results.push({
          name: found.name || card.name,
          token_parts: tokenParts, // Return [] if empty
        });
      } else {
        results.push({ name: card.name });
      }
    }

    return res.json(results);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Tokens] Error:", msg);
    return res.status(500).json({ error: "Failed to fetch token data." });
  }
});

// -------------------- proxy (cached) --------------------
imageRouter.get("/proxy", async (req: Request, res: Response) => {
  const url = req.query.url;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing or invalid ?url" });
  }

  const originalUrl = (() => {
    try { return decodeURIComponent(url); } catch { return url; }
  })();

  const localPath = cachePathFromUrl(originalUrl);

  // Check cache size periodically
  checkAndCleanCache().catch((err: unknown) => console.error("[CACHE] Cleanup failed:", err));

  try {
    // Fast path: check in-memory cache first to avoid fs.existsSync syscall
    const cachedPath = urlPathCache.get(originalUrl);
    if (cachedPath && fs.existsSync(cachedPath)) {
      const now = new Date();
      fs.promises.utimes(cachedPath, now, now).catch(() => { /* ignore */ });
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.sendFile(cachedPath);
    }

    // Fallback to disk check
    if (fs.existsSync(localPath)) {
      // Update access time for LRU (fire-and-forget, don't block response)
      const now = new Date();
      fs.promises.utimes(localPath, now, now).catch(() => { /* ignore */ });
      urlPathCache.set(originalUrl, localPath); // Add to in-memory cache
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.sendFile(localPath);
    }

    // Wait for any in-progress write to the same path to complete
    if (writeInProgress.has(localPath)) {
      await new Promise(r => setTimeout(r, 100));
      if (fs.existsSync(localPath)) {
        urlPathCache.set(originalUrl, localPath);
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return res.sendFile(localPath);
      }
    }

    // Mark path as being written to prevent concurrent corruption
    writeInProgress.add(localPath);

    try {
      // Fix for relative URLs (e.g. from client proxying to itself)
      const fetchUrl = originalUrl.startsWith("/")
        ? `http://127.0.0.1:${process.env.PORT || 3001}${originalUrl}`
        : originalUrl;

      // Use imageFetchLimit to prevent overwhelming server with concurrent fetches
      const response = await imageFetchLimit(() => getWithRetry(fetchUrl, { responseType: "arraybuffer" }));

      if (response.status >= 400 || !response.data) {
        return res.status(502).json({ error: "Upstream error", status: response.status });
      }
      if (response.data.length === 0) {
        return res.status(502).json({ error: "Upstream is a 0-byte image" });
      }

      const ct = String(response.headers["content-type"] || "").toLowerCase();
      if (!ct.startsWith("image/")) {
        return res.status(502).json({ error: "Upstream not image", ct });
      }

      // Write to cache
      await fs.promises.writeFile(localPath, Buffer.from(response.data));
      urlPathCache.set(originalUrl, localPath); // Update in-memory cache

      res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.sendFile(localPath);
    } finally {
      writeInProgress.delete(localPath);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Proxy error:", { message: msg, from: originalUrl });
    return res.status(502).json({ error: "Failed to download image", from: originalUrl });
  }
});

// -------------------- MPC Google Drive proxy (cached) --------------------

imageRouter.get("/mpc", async (req: Request, res: Response) => {
  const id = String(req.query.id || "").trim();
  const size = String(req.query.size || "full").toLowerCase();
  if (!id) return res.status(400).send("Missing id");

  // Use same cache infrastructure as /proxy
  const cacheKey = `gdrive_${id}_${size}`;
  let localPath = path.join(cacheDir, cacheKey);

  // Check cache first
  try {
    if (fs.existsSync(localPath)) {
      const now = new Date();
      fs.promises.utimes(localPath, now, now).catch(() => { /* ignore */ });
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.sendFile(localPath);
    }
  } catch {
    // Cache check failed, proceed to fetch
  }

  // URL candidates to try (in order of preference)
  // Google Drive direct download is preferred but often fails due to:
  // - Access restrictions
  // - Virus scan interstitials for large files
  // - Rate limiting
  // MPC Autofill CDN is more reliable as a fallback
  const candidates: string[] = [];

  if (size === "full") {
    // Try Google Drive URLs - include confirm=t to bypass virus scan interstitials
    // Order: confirm URL first (bypasses interstitial), then regular URLs as fallback
    candidates.push(`https://drive.google.com/uc?export=download&confirm=t&id=${encodeURIComponent(id)}`);
    candidates.push(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`);
    candidates.push(`https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`);
    // Fallback to MPC Autofill CDN large size (lower quality but more reliable)
    candidates.push(`https://img.mpcautofill.com/${id}-large-google_drive`);
  } else {
    // For thumbnails (small, large), use MPC Autofill CDN (more reliable)
    candidates.push(`https://img.mpcautofill.com/${id}-${size}-google_drive`);
  }

  // Use imageFetchLimit to prevent overwhelming server with concurrent fetches
  let lastError: string | undefined;
  try {
    const result = await imageFetchLimit(async () => {
      for (const url of candidates) {
        try {
          // Use AX_GDRIVE with longer timeout for large Google Drive files
          const r = await AX_GDRIVE.get(url, {
            responseType: "arraybuffer",
            maxRedirects: 5,
          });

          const ct = (r.headers["content-type"] || "").toLowerCase();
          if (!ct.startsWith("image/")) {
            lastError = `Non-image response from ${url}: ${ct}`;
            continue; // Not an image (HTML interstitial), try next candidate
          }

          // If we fell back to the MPC CDN "large" image while requesting "full",
          // save it as "large" so we don't pollute the "full" cache slot with lower res.
          if (size === "full" && url.includes("-large-google_drive")) {
            localPath = path.join(cacheDir, `gdrive_${id}_large`);
          }

          // Cache the image
          await fs.promises.writeFile(localPath, Buffer.from(r.data));
          return { contentType: ct };
        } catch (err) {
          // Log each failed candidate for debugging
          const msg = err instanceof Error ? err.message : String(err);
          lastError = `Failed to fetch ${url}: ${msg}`;
        }
      }
      return null;
    });

    if (result) {
      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.sendFile(localPath);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Google Drive fetch error:", { message: msg, id, lastError });
  }

  // Log the final failure reason if we have one
  if (lastError) {
    console.error("MPC image proxy failed:", { id, size, lastError });
  }

  return res.status(502).send("Could not fetch MPC image");
});

// -------------------- Builtin cardback images --------------------
// Serves cardback images from the server to reduce client bundle size

const CARDBACK_MAP: Record<string, string> = {
  'mtg': 'mtg.png',
  'proxxied': 'proxxied.png',
  'classic-dots': 'classic-dots.png',
};

const cardbacksDir = resolveCardbacksDir();

function resolveCardbacksDir(): string {
  const candidates = [
    // 1. Standard structure (src/routes -> src -> server -> cardbacks)
    path.join(__dirname, "..", "..", "cardbacks"),
    // 2. Deeper nesting (if dist structure varies)
    path.join(__dirname, "..", "..", "..", "cardbacks"),
    // 3. Process root fallback (often reliable in Docker)
    path.join(process.cwd(), "cardbacks"),
    // 4. Production build specific fallback
    path.join(process.cwd(), "dist", "server", "cardbacks"),
    // 5. Monorepo root fallback
    path.join(process.cwd(), "server", "cardbacks"),
  ];

  console.log("[Cardbacks] Resolving directory...");
  console.log(`[Cardbacks] __dirname: ${__dirname}`);
  console.log(`[Cardbacks] CWD: ${process.cwd()}`);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log(`[Cardbacks] Found valid directory: ${candidate}`);
      // Verify it actually has images
      try {
        const files = fs.readdirSync(candidate);
        if (files.some(f => f.endsWith(".png"))) {
          return candidate;
        }
        console.warn(`[Cardbacks] Directory exists but has no PNGs: ${candidate}`);
      } catch (e) {
        console.warn(`[Cardbacks] Error reading directory ${candidate}:`, e);
      }
    }
  }

  console.error("[Cardbacks] FATAL: Could not find cardbacks directory in candidates:", candidates);
  // Fallback to strict relative path even if check failed, so we see the original error behavior
  return path.join(__dirname, "..", "..", "cardbacks");
}

imageRouter.get("/cardback/:id", (req: Request, res: Response) => {
  const id = req.params.id;
  const filename = CARDBACK_MAP[id];

  if (!filename) {
    return res.status(404).send("Unknown cardback ID");
  }

  const filePath = path.join(cardbacksDir, filename);

  if (!fs.existsSync(filePath)) {
    console.error(`Cardback file not found: ${filePath}`);
    return res.status(404).send("Cardback image not found");
  }

  // Set aggressive cache headers - these images never change
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("Content-Type", "image/png");
  return res.sendFile(filePath);
});

export { imageRouter };