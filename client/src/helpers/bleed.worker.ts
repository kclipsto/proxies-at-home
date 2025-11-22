declare const self: DedicatedWorkerGlobalScope;

import {
  IN,
  toProxied,
  getBleedInPixels,
  trimExistingBleedIfAny,
  loadImage,
  blackenAllNearBlackPixels,
  getPatchNearCorner,
} from "./imageProcessing";

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
  const targetCardWidth = IN(2.48, dpi);
  const targetCardHeight = IN(3.47, dpi);
  const bleed = Math.round(
    getBleedInPixels(
      bleedWidth,
      opts?.unit ?? "mm",
      dpi
    )
  );

  const finalWidth = targetCardWidth + bleed * 2;
  const finalHeight = targetCardHeight + bleed * 2;

  const canvas = new OffscreenCanvas(finalWidth, finalHeight);
  const ctx = canvas.getContext("2d")!;

  const temp = new OffscreenCanvas(targetCardWidth, targetCardHeight);

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

  const ctx2d = temp.getContext("2d", { willReadFrequently: true })!;
  ctx2d.drawImage(img, -offsetX, -offsetY, drawWidth, drawHeight);

  if (bleed === 0) {
    if (opts?.darkenNearBlack) {
      const blackThreshold = 30;
      blackenAllNearBlackPixels(ctx2d, targetCardWidth, targetCardHeight, blackThreshold);
    }
    return temp;
  }

  const dpiFactor = dpi / 300;
  const cornerSize = Math.round(30 * dpiFactor);
  const sampleInset = Math.round(10 * dpiFactor);
  const patchSize = Math.round(20 * dpiFactor);
  const blurPx = Math.max(1, Math.round(1.5 * dpiFactor));
  const blackThreshold = 30;

  function drawFeatheredPatch(
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    dw: number,
    dh: number
  ) {
    const buf = new OffscreenCanvas(dw, dh);
    const bctx = buf.getContext("2d")!;
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = "high";
    bctx.drawImage(temp, sx, sy, dw, dh, 0, 0, dw, dh);

    ctx2d.save();
    ctx2d.imageSmoothingEnabled = true;
    ctx2d.imageSmoothingQuality = "high";
    ctx2d.filter = `blur(${blurPx}px)`;
    ctx2d.globalAlpha = 0.85;
    ctx2d.drawImage(buf, tx, ty, dw, dh);
    ctx2d.filter = "none";
    ctx2d.globalAlpha = 0.9;
    ctx2d.drawImage(buf, tx, ty, dw, dh);
    ctx2d.globalAlpha = 1;
    ctx2d.restore();
  }

  const corners = [
    { x: 0, y: 0 },
    { x: targetCardWidth - cornerSize, y: 0 },
    { x: 0, y: targetCardHeight - cornerSize },
    { x: targetCardWidth - cornerSize, y: targetCardHeight - cornerSize },
  ];

  for (const { x, y } of corners) {
    const seedX =
      x < targetCardWidth / 2
        ? sampleInset
        : targetCardWidth - sampleInset - patchSize * 2;
    const seedY =
      y < targetCardHeight / 2
        ? sampleInset
        : targetCardHeight - sampleInset - patchSize * 2;

    const { sx, sy } = getPatchNearCorner(
      ctx2d,
      seedX,
      seedY,
      patchSize,
    );

    ctx2d.save();
    ctx2d.globalCompositeOperation = "destination-over";
    for (let ty = y; ty < y + cornerSize; ty += patchSize) {
      for (let tx = x; tx < x + cornerSize; tx += patchSize) {
        const dw = Math.min(patchSize, x + cornerSize - tx);
        const dh = Math.min(patchSize, y + cornerSize - ty);
        const jx = sx + Math.floor((Math.random() - 0.5) * (patchSize * 0.25));
        const jy = sy + Math.floor((Math.random() - 0.5) * (patchSize * 0.25));
        const csx = Math.max(0, Math.min(targetCardWidth - dw, jx));
        const csy = Math.max(0, Math.min(targetCardHeight - dh, jy));
        drawFeatheredPatch(csx, csy, tx, ty, dw, dh);
      }
    }
    ctx2d.restore();
  }

  if (opts?.darkenNearBlack) {
    blackenAllNearBlackPixels(ctx2d, targetCardWidth, targetCardHeight, blackThreshold);
  }

  ctx.drawImage(temp, bleed, bleed);

  if (bleed > 0) {
    const slice = Math.min(8, Math.floor(targetCardWidth / 100));
    ctx.drawImage(temp, 0, 0, slice, targetCardHeight, 0, bleed, bleed, targetCardHeight);
    ctx.drawImage(temp, targetCardWidth - slice, 0, slice, targetCardHeight, targetCardWidth + bleed, bleed, bleed, targetCardHeight);
    ctx.drawImage(temp, 0, 0, targetCardWidth, slice, bleed, 0, targetCardWidth, bleed);
    ctx.drawImage(temp, 0, targetCardHeight - slice, targetCardWidth, slice, bleed, targetCardHeight + bleed, targetCardWidth, bleed);
    ctx.drawImage(temp, 0, 0, slice, slice, 0, 0, bleed, bleed);
    ctx.drawImage(temp, targetCardWidth - slice, 0, slice, slice, targetCardWidth + bleed, 0, bleed, bleed);
    ctx.drawImage(temp, 0, targetCardHeight - slice, slice, slice, 0, targetCardHeight + bleed, bleed, bleed);
    ctx.drawImage(temp, targetCardWidth - slice, targetCardHeight - slice, slice, slice, targetCardWidth + bleed, targetCardHeight + bleed, bleed, bleed);
  }

  return canvas;
}

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

    let imageBitmap: ImageBitmap;
    if (isUserUpload && hasBakedBleed) {
      imageBitmap = await trimExistingBleedIfAny(proxiedUrl);
    } else {
      imageBitmap = await loadImage(proxiedUrl);
    }

    const result = await addBleedEdge(imageBitmap, bleedEdgeWidth, {
      unit,
      bleedEdgeWidth,
      dpi,
      darkenNearBlack,
    });
    imageBitmap.close(); // Release memory

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
