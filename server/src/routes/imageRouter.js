const express = require("express");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const multer = require("multer");
const crypto = require("crypto");

const {
  getScryfallPngImagesForCard,
  getImagesForCardInfo,
  getScryfallPngImagesForCardPrints,
} = require("../utils/getCardImagesPaged");

// --- add under your existing requires ---
const AX = axios.create({
  timeout: 12000,                                  // 12s per outbound request
  headers: { "User-Agent": "Proxxied/1.0 (+contact@example.com)" },
  validateStatus: (s) => s >= 200 && s < 500,      // surface 4xx/429 to logic
});

// Light retry for 429 / transient errors
async function getWithRetry(url, opts = {}, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await AX.get(url, opts);
      if (res.status === 429) {
        const wait = Number(res.headers["retry-after"] || 2);
        await new Promise(r => setTimeout(r, wait * 1000));
        continue;
      }
      if (res.status >= 200 && res.status < 300) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

// Tiny p-limit (cap parallel Scryfall calls)
function pLimit(concurrency) {
  const q = [];
  let active = 0;
  const run = async (fn, resolve, reject) => {
    active++;
    try { resolve(await fn()); }
    catch (e) { reject(e); }
    finally {
      active--;
      if (q.length) {
        const [fn, res, rej] = q.shift();
        run(fn, res, rej);
      }
    }
  };
  return (fn) => new Promise((resolve, reject) => {
    if (active < concurrency) run(fn, resolve, reject);
    else q.push([fn, resolve, reject]);
  });
}
const limit = pLimit(6); // 6 at a time is a safe default

// -------------------- cache helpers --------------------

const imageRouter = express.Router();

const cacheDir = path.join(__dirname, "..", "cached-images");
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir);
}

const uploadDir = path.join(__dirname, "..", "uploaded-images");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

// Make a stable cache filename from the FULL raw URL (path + query)
function cachePathFromUrl(originalUrl) {
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

imageRouter.post("/", async (req, res) => {
  const cardQueries = Array.isArray(req.body.cardQueries) ? req.body.cardQueries : null;
  const cardNames = Array.isArray(req.body.cardNames) ? req.body.cardNames : null;

  const unique = req.body.cardArt || "art";
  const language = (req.body.language || "en").toLowerCase();
  const fallbackToEnglish =
    typeof req.body.fallbackToEnglish === "boolean" ? req.body.fallbackToEnglish : true;

  if (!cardQueries && !cardNames) {
    return res.status(400).json({ error: "Provide cardQueries (preferred) or cardNames." });
  }

  const infos = cardQueries
    ? cardQueries.map((q) => ({
      name: q.name,
      set: q.set,
      number: q.number,
      language: (q.language || language || "en").toLowerCase(),
    }))
    : cardNames.map((name) => ({ name, language }));

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
  } catch (err) {
    console.error("Fetch error:", err?.message);
    return res.status(500).json({ error: "Failed to fetch images from Scryfall." });
  } finally {
    console.log(`[POST /images] ${infos.length} cards in ${Date.now() - started}ms`);
  }
});

imageRouter.post("/images-stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const cardQueries = Array.isArray(req.body.cardQueries)
    ? req.body.cardQueries
    : [];

  const unique = req.body.cardArt || "art";
  const language = (req.body.language || "en").toLowerCase();
  const fallbackToEnglish =
    typeof req.body.fallbackToEnglish === "boolean"
      ? req.body.fallbackToEnglish
      : true;

  const infos = cardQueries.map((q) => ({
    name: q.name,
    set: q.set,
    number: q.number,
    language: (q.language || language || "en").toLowerCase(),
  }));

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
    } catch (e) {
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

imageRouter.get("/proxy", async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing or invalid ?url" });
  }

  const originalUrl = (() => {
    try { return decodeURIComponent(url); } catch { return url; }
  })();

  const localPath = cachePathFromUrl(originalUrl);

  try {
    if (fs.existsSync(localPath)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.sendFile(localPath);
    }

    const response = await getWithRetry(originalUrl, { responseType: "arraybuffer", timeout: 12000 }, 3);
    if (response.status >= 400 || !response.data) {
      return res.status(502).json({ error: "Upstream error", status: response.status });
    }

    const ct = String(response.headers["content-type"] || "").toLowerCase();
    if (!ct.startsWith("image/")) {
      return res.status(502).json({ error: "Upstream not image", ct });
    }

    fs.writeFileSync(localPath, Buffer.from(response.data));

    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.sendFile(localPath);
  } catch (err) {
    console.error("Proxy error:", { message: err.message, from: originalUrl });
    return res.status(502).json({ error: "Failed to download image", from: originalUrl });
  }
});

// -------------------- maintenance & uploads --------------------

imageRouter.delete("/", (req, res) => {
  const started = Date.now();
  fs.readdir(cacheDir, (err, files) => {
    if (err) {
      console.error("Error reading cache directory:", err.message);
      return res.status(500).json({ error: "Failed to read cache directory" });
    }

    // Respond right away so the client UI never looks stuck
    res.json({ message: "Cached images clearing started.", count: files.length });

    if (!files.length) {
      console.log(`[DELETE /images] no files (0ms)`);
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

imageRouter.post("/upload", upload.array("images"), (req, res) => {
  return res.json({
    uploaded: req.files.map((file) => ({
      name: file.originalname,
      path: file.filename,
    })),
  });
});

imageRouter.get("/diag", (req, res) => {
  res.json({
    ok: true,
    now: new Date().toISOString(),
    ua: req.headers["user-agent"],
    origin: req.headers.origin || null,
    ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
  });
});

// -------------------- Google Drive helper --------------------

imageRouter.get("/front", async (req, res) => {
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
    } catch (_) {
      // try next candidate
    }
  }

  return res.status(502).send("Could not fetch Google Drive image");
});

module.exports = { imageRouter };