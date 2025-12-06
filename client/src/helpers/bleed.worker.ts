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

let API_BASE = "";

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

const imageCache = new Map<string, Promise<Blob>>();

self.onmessage = async (e: MessageEvent) => {
  const {
    uuid,
    url,
    bleedEdgeWidth,
    unit,
    apiBase,
    isUserUpload,
    hasBakedBleed,
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

    let blob: Blob;

    // Check cache first
    if (imageCache.has(proxiedUrl)) {
      blob = await imageCache.get(proxiedUrl)!;
    } else {
      const loadPromise = (async () => {
        const response = await fetchWithRetry(proxiedUrl, 3, 250);
        return await response.blob();
      })();
      imageCache.set(proxiedUrl, loadPromise);
      try {
        blob = await loadPromise;
      } catch (e) {
        imageCache.delete(proxiedUrl);
        throw e;
      }
    }

    let imageBitmap = await createImageBitmap(blob);

    if (isUserUpload && hasBakedBleed) {
      const trimmed = await trimBleedFromBitmap(imageBitmap);
      if (trimmed !== imageBitmap) {
        imageBitmap.close();
        imageBitmap = trimmed;
      }
    }

    const result = await addBleedEdge(imageBitmap, bleedEdgeWidth, {
      unit,
      bleedEdgeWidth,
      dpi,
      darkenNearBlack,
    });
    imageBitmap.close(); // Close the bitmap, we only keep the Blob in cache
    self.postMessage({ uuid, ...result });
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
