declare const self: DedicatedWorkerGlobalScope;

import {
  MM_TO_PX,
  toProxied,
  getBleedInPixels,
  trimBleedFromBitmap,
  fetchWithRetry,
  blackenAllNearBlackPixels,
} from "./imageProcessing";
import { applyJFA } from "./jfa";
import { db } from "../db";

let API_BASE = "";

// Cache TTL: 7 days
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Extract a stable cache key from a URL.
 * - MPC URLs: use the Google Drive id parameter (e.g., "mpc:abc123")
 * - Scryfall URLs: use the path without query params (e.g., "scry:/front/a/b/12345.png")
 * - Other URLs: use as-is
 */
function getCacheKey(url: string): string {
  try {
    const parsed = new URL(url);

    // MPC Google Drive URLs: /api/cards/images/mpc?id=...
    if (parsed.pathname.includes('/api/cards/images/mpc')) {
      const id = parsed.searchParams.get('id');
      if (id) return `mpc:${id}`;
    }

    // Scryfall URLs: use path (stable across hosts)
    if (parsed.hostname.includes('scryfall.io') || parsed.hostname.includes('scryfall.com')) {
      return `scry:${parsed.pathname}`;
    }

    // Proxy URLs: extract the original URL from the query param
    if (parsed.pathname.includes('/api/cards/images/proxy')) {
      const originalUrl = parsed.searchParams.get('url');
      if (originalUrl) return getCacheKey(originalUrl); // Recursive call to normalize
    }

    // Default: use the full URL
    return url;
  } catch {
    // If URL parsing fails, use as-is
    return url;
  }
}

/**
 * Resize an image WITHOUT generating new bleed.
 * Used for 'existing' mode where the image already has bleed built in.
 * We resize to match the expected dimensions (card + specified bleed width)
 * and report the correct bleed width for cut guide placement.
 */
async function resizeWithoutBleed(
  img: ImageBitmap,
  bleedWidthMm: number,
  opts?: { unit?: 'mm' | 'in'; dpi?: number }
): Promise<{
  exportBlob: Blob;
  exportDpi: number;
  exportBleedWidth: number;
  displayBlob: Blob;
  displayDpi: number;
  displayBleedWidth: number;
}> {
  const dpi = opts?.dpi ?? 300;
  const unit = opts?.unit ?? 'mm';

  // Standard MTG card dimensions: 63x88mm
  const cardWidthMm = 63;
  const cardHeightMm = 88;

  // Calculate bleed in pixels
  const bleedPx = Math.round(getBleedInPixels(bleedWidthMm, unit, dpi));

  // Calculate total dimensions including bleed
  const exportWidth = MM_TO_PX(cardWidthMm, dpi) + bleedPx * 2;
  const exportHeight = MM_TO_PX(cardHeightMm, dpi) + bleedPx * 2;

  // Create export canvas and resize image to fit
  const exportCanvas = new OffscreenCanvas(exportWidth, exportHeight);
  const exportCtx = exportCanvas.getContext('2d')!;
  exportCtx.imageSmoothingQuality = 'high';
  exportCtx.drawImage(img, 0, 0, exportWidth, exportHeight);

  // Create display canvas (same DPI for fallback worker)
  const displayCanvas = new OffscreenCanvas(exportWidth, exportHeight);
  const displayCtx = displayCanvas.getContext('2d')!;
  displayCtx.imageSmoothingQuality = 'high';
  displayCtx.drawImage(img, 0, 0, exportWidth, exportHeight);

  // Convert to blobs
  const exportBlob = await exportCanvas.convertToBlob({ type: 'image/png' });
  const displayBlob = await displayCanvas.convertToBlob({ type: 'image/png' });

  return {
    exportBlob,
    exportDpi: dpi,
    exportBleedWidth: bleedWidthMm,
    displayBlob,
    displayDpi: dpi,
    displayBleedWidth: bleedWidthMm,
  };
}

async function addBleedEdge(
  img: ImageBitmap,
  bleedOverride?: number,
  opts?: { unit?: "mm" | "in"; bleedEdgeWidth?: number; dpi?: number; darkenNearBlack?: boolean }
): Promise<{
  exportBlob: Blob;
  exportDpi: number;
  exportBleedWidth: number;
  displayBlob: Blob;
  displayDpi: number;
  displayBleedWidth: number;
}> {
  const exportDpi = opts?.dpi ?? 300;
  const exportBleedWidth = bleedOverride ?? opts?.bleedEdgeWidth ?? 0;

  const displayDpi = 300;
  const displayBleedWidth = exportBleedWidth;

  // Generate high-resolution canvas for export
  const highResCanvas = await generateBleedCanvas(img, exportBleedWidth, { ...opts, dpi: exportDpi });
  const exportBlob = await highResCanvas.convertToBlob({ type: "image/png" });

  // Generate low-resolution canvas for display by downscaling
  const displayWidth = (highResCanvas.width / exportDpi) * displayDpi;
  const displayHeight = (highResCanvas.height / exportDpi) * displayDpi;
  const lowResCanvas = new OffscreenCanvas(displayWidth, displayHeight);
  const lowResCtx = lowResCanvas.getContext("2d")!;
  lowResCtx.imageSmoothingQuality = "high";
  lowResCtx.drawImage(highResCanvas, 0, 0, displayWidth, displayHeight);
  const displayBlob = await lowResCanvas.convertToBlob({ type: "image/png" });

  return {
    exportBlob,
    exportDpi,
    exportBleedWidth,
    displayBlob,
    displayDpi,
    displayBleedWidth,
  };
}

async function generateBleedCanvas(
  img: ImageBitmap,
  bleedWidth: number,
  opts: { unit?: "mm" | "in"; dpi?: number; darkenNearBlack?: boolean }
): Promise<OffscreenCanvas> {
  const dpi = opts?.dpi ?? 300;
  const targetCardWidth = MM_TO_PX(63, dpi);  // Standard MTG card width: 63mm
  const targetCardHeight = MM_TO_PX(88, dpi); // Standard MTG card height: 88mm
  const bleed = Math.round(
    getBleedInPixels(
      bleedWidth,
      opts?.unit ?? "mm",
      dpi
    )
  );

  // If no bleed is requested, just return the resized image
  if (bleed === 0) {
    const temp = new OffscreenCanvas(targetCardWidth, targetCardHeight);
    const ctx2d = temp.getContext("2d", { willReadFrequently: true })!;

    const aspectRatio = img.width / img.height;
    const targetAspect = targetCardWidth / targetCardHeight;

    let drawWidth = targetCardWidth;
    let drawHeight = targetCardHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (aspectRatio > targetAspect) {
      drawHeight = targetCardHeight;
      drawWidth = img.width * (targetCardHeight / img.height);
      offsetX = (drawWidth - targetCardWidth) / 2;
    } else {
      drawWidth = targetCardWidth;
      drawHeight = img.height * (targetCardWidth / img.width);
      offsetY = (drawHeight - targetCardHeight) / 2;
    }

    ctx2d.drawImage(img, -offsetX, -offsetY, drawWidth, drawHeight);

    if (opts?.darkenNearBlack) {
      const blackThreshold = 30;
      const imageData = ctx2d.getImageData(0, 0, targetCardWidth, targetCardHeight);
      blackenAllNearBlackPixels(imageData, blackThreshold);
      ctx2d.putImageData(imageData, 0, 0);
    }
    return temp;
  }

  const finalWidth = targetCardWidth + bleed * 2;
  const finalHeight = targetCardHeight + bleed * 2;

  const canvas = new OffscreenCanvas(finalWidth, finalHeight);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  // Draw the image centered in the bleed canvas
  const aspectRatio = img.width / img.height;
  const targetAspect = targetCardWidth / targetCardHeight;

  let drawWidth = targetCardWidth;
  let drawHeight = targetCardHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (aspectRatio > targetAspect) {
    drawHeight = targetCardHeight;
    drawWidth = img.width * (targetCardHeight / img.height);
    offsetX = (drawWidth - targetCardWidth) / 2;
  } else {
    drawWidth = targetCardWidth;
    drawHeight = img.height * (targetCardWidth / img.width);
    offsetY = (drawHeight - targetCardHeight) / 2;
  }

  // Draw the image centered in the bleed canvas
  ctx.drawImage(img, bleed - offsetX, bleed - offsetY, drawWidth, drawHeight);

  // Get image data for JFA processing
  const imageData = ctx.getImageData(0, 0, finalWidth, finalHeight);

  // Apply darkenNearBlack if needed
  if (opts?.darkenNearBlack) {
    const blackThreshold = 30;
    blackenAllNearBlackPixels(imageData, blackThreshold);
  }

  applyJFA(imageData);
  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

// In-flight requests map to prevent duplicate fetches within a session
const inflightRequests = new Map<string, Promise<Blob>>();

self.onmessage = async (e: MessageEvent) => {
  const {
    uuid,
    url,
    bleedEdgeWidth,
    unit,
    apiBase,
    hasBuiltInBleed,
    bleedMode,
    existingBleedMm,
    dpi,
    darkenNearBlack,
  } = e.data;
  API_BASE = apiBase; // Set the API_BASE for the worker

  if (typeof OffscreenCanvas === "undefined") {
    self.postMessage({ uuid, error: "OffscreenCanvas is not supported in this environment." });
    return;
  }

  try {
    const proxiedUrl = url.startsWith("http") ? toProxied(url, API_BASE) : url;
    // Use stable cache key for better hit rate across sessions and environments
    const cacheKey = getCacheKey(url.startsWith("http") ? url : proxiedUrl);

    let blob: Blob | undefined;
    let cacheHit = false;

    // 1. Check persistent IndexedDB cache first (for http URLs including MPC)
    if (url.startsWith("http") || url.includes("/api/cards/images/")) {
      try {
        const cached = await db.imageCache.get(cacheKey);
        if (cached) {
          // Check 7-day TTL (soft expiry based on last access)
          if ((Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
            blob = cached.blob;
            cacheHit = true;
            // LRU: touch the timestamp
            db.imageCache.update(cacheKey, { cachedAt: Date.now() }).catch(() => { });
          }
        }
      } catch {
        // IndexedDB error - proceed without cache
      }
    }

    // 2. If not cached, check in-flight requests or fetch
    if (!cacheHit) {
      if (inflightRequests.has(proxiedUrl)) {
        blob = await inflightRequests.get(proxiedUrl)!;
      } else {
        const loadPromise = (async () => {
          const response = await fetchWithRetry(proxiedUrl, 3, 250);
          return await response.blob();
        })();
        inflightRequests.set(proxiedUrl, loadPromise);
        try {
          blob = await loadPromise;

          // 3. Store in persistent cache (for http URLs including MPC)
          if (url.startsWith("http") || url.includes("/api/cards/images/")) {
            try {
              await db.imageCache.put({
                url: cacheKey,
                blob,
                cachedAt: Date.now(),
                size: blob.size,
              });
            } catch {
              // IndexedDB error - proceed without caching
            }
          }
        } catch (fetchError) {
          inflightRequests.delete(proxiedUrl);
          throw fetchError;
        } finally {
          // Clean up in-flight after a delay to handle concurrent requests
          setTimeout(() => inflightRequests.delete(proxiedUrl), 1000);
        }
      }
    }

    // Determine how to handle the image based on bleed mode
    // blob is guaranteed to be set at this point by the control flow above
    let imageBitmap = await createImageBitmap(blob!);

    if (bleedMode === 'existing') {
      // Use existing bleed as-is - no trimming needed
    } else if (bleedMode === 'none') {
      // No bleed processing - use image as-is
    } else if (bleedMode === 'generate') {
      // Smart bleed handling for images with existing bleed
      if (hasBuiltInBleed && existingBleedMm !== undefined && existingBleedMm > 0) {
        // Convert target bleed to mm for comparison
        const targetBleedMm = unit === 'in' ? bleedEdgeWidth * 25.4 : bleedEdgeWidth;
        const cardHeightMm = 88;
        const pxPerMm = imageBitmap.height / (cardHeightMm + existingBleedMm * 2);

        if (targetBleedMm <= existingBleedMm) {
          // Target is less than or equal to existing - just trim to target, no generation needed
          const trimAmount = existingBleedMm - targetBleedMm;
          if (trimAmount > 0.01) { // Only trim if meaningful difference
            const trimPx = Math.round(trimAmount * pxPerMm);
            const trimmed = await trimBleedFromBitmap(imageBitmap, trimPx);
            if (trimmed !== imageBitmap) {
              imageBitmap.close();
              imageBitmap = trimmed;
            }
          }
          // Use 'existing' mode rendering path
          const result = await resizeWithoutBleed(imageBitmap, targetBleedMm, {
            unit: 'mm',
            dpi,
          });
          imageBitmap.close();
          self.postMessage({ uuid, imageCacheHit: cacheHit, ...result });
          return; // Early return - no generation needed
        } else {
          // Target is more than existing - trim all existing bleed and regenerate at full target
          const trimPx = Math.round(existingBleedMm * pxPerMm);
          const trimmed = await trimBleedFromBitmap(imageBitmap, trimPx);
          if (trimmed !== imageBitmap) {
            imageBitmap.close();
            imageBitmap = trimmed;
          }
        }
      } else if (hasBuiltInBleed) {
        // hasBuiltInBleed but no existingBleedMm specified - use calibrated MPC bleed trim
        const trimmed = await trimBleedFromBitmap(imageBitmap);
        if (trimmed !== imageBitmap) {
          imageBitmap.close();
          imageBitmap = trimmed;
        }
      }
    } else if (hasBuiltInBleed) {
      // Legacy fallback for undefined bleedMode with built in bleed - use calibrated trim
      const trimmed = await trimBleedFromBitmap(imageBitmap);
      if (trimmed !== imageBitmap) {
        imageBitmap.close();
        imageBitmap = trimmed;
      }
    }

    let result;

    if (bleedMode === 'existing') {
      // For existing mode, use existingBleedMm (the bleed already in the image)
      const existingBleed = existingBleedMm ?? 3.175; // Default to 1/8 inch if not specified
      result = await resizeWithoutBleed(imageBitmap, existingBleed, {
        unit: 'mm', // existingBleedMm is always in mm
        dpi,
      });
    } else if (bleedMode === 'none') {
      // For 'none' mode, resize to card size without any bleed
      result = await resizeWithoutBleed(imageBitmap, 0, {
        unit: 'mm',
        dpi,
      });
    } else {
      // For generate mode (and legacy), run bleed generation
      result = await addBleedEdge(imageBitmap, bleedEdgeWidth, {
        unit,
        bleedEdgeWidth,
        dpi,
        darkenNearBlack,
      });
    }
    imageBitmap.close(); // Close the bitmap, we only keep the Blob in cache
    self.postMessage({ uuid, imageCacheHit: cacheHit, ...result });
  } catch (error: unknown) {
    if (error instanceof Error) {
      self.postMessage({ uuid, error: error.message });
    } else {
      self.postMessage({
        uuid,
        error: "An unknown error occurred in the bleed worker.",
      });
    }
  }
};
