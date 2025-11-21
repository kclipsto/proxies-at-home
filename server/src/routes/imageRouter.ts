import express, { type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import multer from "multer";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { getImagesForCardInfo } from "../utils/getCardImagesPaged.js";
import { normalizeCardInfos } from "../utils/cardUtils.js";
import type { CardInfo } from "../../../shared/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- add under your existing requires ---
const AX = axios.create({
  timeout: 12000, // 12s per outbound request
  headers: { "User-Agent": "Proxxied/1.0 (+contact@example.com)" },
  validateStatus: (s) => s >= 200 && s < 500, // surface 4xx/429 to logic
});

// Improved retry with exponential backoff
async function getWithRetry(url: string, opts: AxiosRequestConfig = {}, tries = 5): Promise<AxiosResponse> {
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
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s
      const backoffMs = Math.min(1000 * Math.pow(2, i), 16000);
      const jitter = Math.random() * 500;
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
const limit = pLimit(6); // Re-upped for multi-user load

// -------------------- cache helpers --------------------

const imageRouter = express.Router();

const cacheDir = path.join(__dirname, "..", "cached-images");
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir);
}

// Cache size management with LRU eviction (12GB limit for Koyeb eLarge 20GB disk)
const MAX_CACHE_SIZE_BYTES = 12 * 1024 * 1024 * 1024; // 12GB (leaves 8GB for system/logs)
let lastCacheCleanup = 0;

async function checkAndCleanCache() {
  const now = Date.now();
  // Only check every 5 minutes to avoid excessive disk I/O
  if (now - lastCacheCleanup < 5 * 60 * 1000) return;
  lastCacheCleanup = now;

  try {
    const files = fs.readdirSync(cacheDir);
    const fileStats: { path: string; atime: number; size: number }[] = [];
    let totalSize = 0;

    for (const file of files) {
      const filePath = path.join(cacheDir, file);
      try {
        const stats = fs.statSync(filePath);
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
          fs.unlinkSync(file.path);
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

const uploadDir = path.join(__dirname, "..", "uploaded-images");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

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

// -------------------- API: fetch images for cards --------------------

interface ImageRequestBody {
  cardQueries?: CardInfo[];
  cardNames?: string[];
  cardArt?: string;
  language?: string;
  fallbackToEnglish?: boolean;
}

imageRouter.post("/", async (req: Request<unknown, unknown, ImageRequestBody>, res: Response) => {
  const cardQueries = Array.isArray(req.body.cardQueries) ? req.body.cardQueries : null;
  const cardNames = Array.isArray(req.body.cardNames) ? req.body.cardNames : null;

  const unique = req.body.cardArt || "art";
  const language = (req.body.language || "en").toLowerCase();
  const fallbackToEnglish =
    typeof req.body.fallbackToEnglish === "boolean" ? req.body.fallbackToEnglish : true;

  if (!cardQueries && !cardNames) {
    return res.status(400).json({ error: "Provide cardQueries (preferred) or cardNames." });
  }

  const infos = normalizeCardInfos(cardQueries, cardNames, language);

  const started = Date.now();

  try {
    const results = await Promise.all(
      infos.map((ci) =>
        limit(async () => {
          // 20s safety timeout per card so one slow POP can’t hang everything
          const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("scryfall-timeout")), 20000));
          const task = (async () => {
            const imageUrls = await getImagesForCardInfo(ci, unique, ci.language, fallbackToEnglish);
            return {
              name: ci.name,
              set: ci.set,
              number: ci.number,
              imageUrls,
              language: ci.language,
            };
          })();
          try {
            return await Promise.race([task, timeout]);
          } catch {
            // On timeout/error, return empty list (UI won’t spin forever)
            return { name: ci.name, set: ci.set, number: ci.number, imageUrls: [], language: ci.language };
          }
        })
      )
    );

    return res.json(results);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Fetch error:", msg);
    return res.status(500).json({ error: "Failed to fetch images from Scryfall." });
  } finally {
    console.log(`[POST /images] ${infos.length} cards in ${Date.now() - started}ms`);
  }
});

imageRouter.post("/images-stream", async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const cardQueries: CardInfo[] = Array.isArray(req.body.cardQueries)
    ? req.body.cardQueries
    : [];

  const unique = req.body.cardArt || "art";
  const language = (req.body.language || "en").toLowerCase();
  const fallbackToEnglish =
    typeof req.body.fallbackToEnglish === "boolean"
      ? req.body.fallbackToEnglish
      : true;

  const infos = normalizeCardInfos(cardQueries, null, language);

  const total = infos.length;
  let count = 0;

  for (const ci of infos) {
    try {
      const imageUrls = await getImagesForCardInfo(
        ci,
        unique,
        ci.language,
        fallbackToEnglish
      );
      const card = {
        name: ci.name,
        set: ci.set,
        number: ci.number,
        imageUrls,
        language: ci.language,
      };
      res.write(`event: card\ndata: ${JSON.stringify(card)}\n\n`);
    } catch (e: unknown) {
      console.error(`[SSE] failed to fetch ${ci.name}:`, e);
      // Send an error event for this card
      res.write(
        `event: card-error\ndata: ${JSON.stringify({ name: ci.name })}\n\n`
      );
    } finally {
      count++;
      res.write(
        `event: progress\ndata: ${JSON.stringify({ progress: count, total })}\n\n`
      );
    }
  }

  res.write("event: end\ndata: Stream ended\n\n");
  res.end();
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
    if (fs.existsSync(localPath)) {
      // Update access time for LRU
      try {
        const now = new Date();
        fs.utimesSync(localPath, now, now);
      } catch {
        // Ignore access time update errors
      }
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.sendFile(localPath);
    }

    const response = await getWithRetry(originalUrl, { responseType: "arraybuffer", timeout: 12000 }, 3);
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

    fs.writeFileSync(localPath, Buffer.from(response.data));

    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.sendFile(localPath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Proxy error:", { message: msg, from: originalUrl });
    return res.status(502).json({ error: "Failed to download image", from: originalUrl });
  }
});

// -------------------- maintenance & uploads --------------------

imageRouter.delete("/", (_req: Request, res: Response) => {
  const started = Date.now();
  fs.readdir(cacheDir, (err, files) => {
    if (err) {
      console.error("Error reading cache directory:", err.message);
      return res.status(500).json({ error: "Failed to read cache directory" });
    }

    // Respond right away so the client UI never looks stuck
    res.json({ message: "Cached images clearing started.", count: files.length });

    if (!files.length) {
      console.log("[DELETE /images] no files (0ms)");
      return;
    }

    let remaining = files.length;
    for (const file of files) {
      const filePath = path.join(cacheDir, file);
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) console.warn(`Failed to delete ${filePath}:`, unlinkErr.message);
        if (--remaining === 0) {
          console.log(`[DELETE /images] removed ${files.length} in ${Date.now() - started}ms`);
        }
      });
    }
  });
});

imageRouter.post("/upload", upload.array("images"), (req: Request, res: Response) => {
  return res.json({
    uploaded: (req.files as Express.Multer.File[]).map((file) => ({
      name: file.originalname,
      path: file.filename,
    })),
  });
});

imageRouter.get("/diag", (req: Request, res: Response) => {
  res.json({
    ok: true,
    now: new Date().toISOString(),
    ua: req.headers["user-agent"],
    origin: req.headers.origin || null,
    ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
  });
});

// -------------------- Google Drive helper --------------------

imageRouter.get("/front", async (req: Request, res: Response) => {
  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).send("Missing id");

  // Try a couple of GDrive URL shapes; only accept image/* responses
  const candidates = [
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`,
    `https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`,
    `https://drive.google.com/open?id=${encodeURIComponent(id)}`,
  ];

  for (const url of candidates) {
    try {
      const r = await axios.get(url, {
        responseType: "stream",
        maxRedirects: 5,
        headers: { "User-Agent": "Mozilla/5.0" },
        validateStatus: () => true,
      });

      const ct = (r.headers["content-type"] || "").toLowerCase();
      // Only pipe if GDrive actually gave us an image
      if (!ct.startsWith("image/")) {
        // Not an image (likely HTML interstitial); try next candidate
        continue;
      }

      res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return r.data.pipe(res);
    } catch {
      // try next candidate
    }
  }

  return res.status(502).send("Could not fetch Google Drive image");
});

export { imageRouter };