import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { CardOption } from "../../../shared/types";
import { API_BASE } from "@/constants";
import type { Image } from "@/db";

function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[/?%*:|"<>]/g, "_")
      .replace(/\s+/g, " ")
      .trim() || "card"
  );
}

function getLocalBleedImageUrl(originalUrl: string) {
  return `${API_BASE}/api/cards/images/proxy?url=${encodeURIComponent(
    originalUrl
  )}`;
}

// Scryfall thumbs sometimes come as .jpg; prefer .png for fewer artifacts
function preferPng(url:string) {
  try {
    const u = new URL(url);
    if (
      u.hostname.endsWith("scryfall.io") &&
      u.pathname.match(/\.(jpg|jpeg)$/i)
    ) {
      u.pathname = u.pathname.replace(/\.(jpg|jpeg)$/i, ".png");
      return u.toString();
    }
  } catch {
    /* noop */
  }
  return url;
}

type ExportOpts = {
  cards: CardOption[];
  images: Image[];
  fileBaseName?: string; // default: card_images_YYYY-MM-DD
  concurrency?: number; // default: 6
};

export async function ExportImagesZip(opts: ExportOpts) {
  const { cards, images, fileBaseName, concurrency = 6 } = opts;

  const zip = new JSZip();
  const usedNames = new Map<string, number>();
  const imagesById = new Map(images.map((img) => [img.id, img]));

  // Build a work list that resolves the best URL for each card
  const tasks = cards.map((c, i) => {
    const image = c.imageId ? imagesById.get(c.imageId) : undefined;

    let url = image?.sourceUrl || "";

    if (!url) {
      return async () => null; // empty slot
    }

    // If it’s not a user upload, run it through the proxy to get the bleed version
    if (!c.isUserUpload) {
      url = getLocalBleedImageUrl(preferPng(url));
    }

    const baseName = sanitizeFilename(c.name || `Card ${i + 1}`);
    const idx = String(i + 1).padStart(3, "0");

    return async () => {
      try {
        const res = await fetch(url, { mode: "cors", credentials: "omit" });
        if (!res.ok) {
          console.warn(`[Export skipped] Could not fetch: ${url}`);
          return null;
        }
        const blob = await res.blob();

        // de-dupe filenames per printed order
        const count = (usedNames.get(baseName) ?? 0) + 1;
        usedNames.set(baseName, count);
        const suffix = count > 1 ? ` (${count})` : "";

        // Try to keep the right extension if we know it; default to .png
        const ext =
          blob.type === "image/jpeg"
            ? "jpg"
            : blob.type === "image/webp"
            ? "webp"
            : "png";

        const filename = `${idx} - ${baseName}${suffix}.${ext}`;
        zip.file(filename, blob);
        return true;
      } catch (err) {
        console.warn(`[Export skipped] Error fetching ${url}`, err);
        return null;
      }
    };
  });

  // Simple concurrency limiter
  async function runWithConcurrency<T>(
    jobs: Array<() => Promise<T>>,
    limit: number
  ) {
    const results: T[] = [];
    let next = 0;

    async function worker() {
      while (next < jobs.length) {
        const cur = next++;
        results[cur] = await jobs[cur]();
      }
    }

    const workers = Array.from({ length: Math.max(1, limit) }, worker);
    await Promise.all(workers);
    return results;
  }

  await runWithConcurrency(tasks, concurrency);

  const date = new Date().toISOString().slice(0, 10);
  const outName = `${fileBaseName || "card_images"}_${date}.zip`;
  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, outName);
}
