declare const self: DedicatedWorkerGlobalScope;

let API_BASE = "";
const DPI = 300;
const IN = (inches: number) => Math.round(inches * DPI);

function toProxied(url: string) {
  if (!url || !API_BASE) return url;
  if (url.startsWith("data:")) return url;
  const prefix = `${API_BASE}/api/cards/images/proxy?url=`;
  if (url.startsWith(prefix)) return url;
  return `${prefix}${encodeURIComponent(url)}`;
}

function getBleedInPixels(bleedEdgeWidth: number, unit: string): number {
  return unit === "mm" ? IN(bleedEdgeWidth / 25.4) : IN(bleedEdgeWidth);
}

function blackenAllNearBlackPixels(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  threshold: number,
  borderThickness = { top: 48, bottom: 48, left: 48, right: 48 }
) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let y = 0; y < height; y++) {
    const topEdge = y < borderThickness.top;
    const botEdge = y >= height - borderThickness.bottom;
    for (let x = 0; x < width; x++) {
      const leftEdge = x < borderThickness.left;
      const rightEdge = x >= width - borderThickness.right;
      if (!(topEdge || botEdge || leftEdge || rightEdge)) continue;

      const index = (y * width + x) * 4;
      const r = data[index], g = data[index + 1], b = data[index + 2];
      if (r < threshold && g < threshold && b < threshold) {
        data[index] = 0;
        data[index + 1] = 0;
        data[index + 2] = 0;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function getPatchNearCorner(
  sx: number,
  sy: number,
  w: number,
  h: number,
  patchSize: number,
  tempCtx: OffscreenCanvasRenderingContext2D
): { sx: number; sy: number } {
  const candidates = [
    [0, 0],
    [patchSize, 0],
    [0, patchSize],
    [-patchSize, 0],
    [0, -patchSize],
    [patchSize, patchSize],
    [-patchSize, patchSize],
    [patchSize, -patchSize],
    [-patchSize, -patchSize],
  ];

  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));

  for (const [dx, dy] of candidates) {
    const px = clamp(sx + dx, 0, w - patchSize);
    const py = clamp(sy + dy, 0, h - patchSize);
    const data = tempCtx.getImageData(px, py, patchSize, patchSize).data;

    let opaqueCount = 0;
    let notTooWhiteCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a > 10) {
        opaqueCount++;
        if (r < 240 || g < 240 || b < 240) notTooWhiteCount++;
      }
    }
    const total = patchSize * patchSize;
    const opaqueRatio = opaqueCount / total;
    const texturedRatio = opaqueCount ? notTooWhiteCount / opaqueCount : 0;

    if (opaqueRatio >= 0.7 && texturedRatio >= 0.2) return { sx: px, sy: py };
  }

  return {
    sx: Math.max(0, Math.min(w - patchSize, sx)),
    sy: Math.max(0, Math.min(h - patchSize, sy)),
  };
}

function calibratedBleedTrimPxForHeight(h: number) {
    if (h >= 4440) return 156;
    if (h >= 2960) return 104;
    if (h >= 2220) return 78;
    return 72;
}

async function trimExistingBleedIfAny(src: string): Promise<ImageBitmap> {
    const img = await loadImage(src);
    const trim = calibratedBleedTrimPxForHeight(img.height);
    const w = img.width - trim * 2;
    const h = img.height - trim * 2;
    if (w <= 0 || h <= 0) return img;
    return createImageBitmap(img, trim, trim, w, h);
}

async function loadImage(src: string): Promise<ImageBitmap> {
    const response = await fetch(src);
    if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const blob = await response.blob();
    return await createImageBitmap(blob);
}

async function addBleedEdge(
  img: ImageBitmap,
  bleedOverride?: number,
  opts?: { unit?: "mm" | "in"; bleedEdgeWidth?: number }
): Promise<Blob> {
  const targetCardWidth = 744; // 2.48" * 300
  const targetCardHeight = 1040; // 3.47" * 300
  const bleed = Math.round(
    getBleedInPixels(bleedOverride ?? opts?.bleedEdgeWidth ?? 0, opts?.unit ?? "mm")
  );

  const finalWidth = targetCardWidth + bleed * 2;
  const finalHeight = targetCardHeight + bleed * 2;

  const blackThreshold = 30;
  const blackToleranceRatio = 0.7;

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
    return await temp.convertToBlob({ type: "image/png" });
  }

  const cornerSize = 30;
  const sampleInset = 10;
  const patchSize = 20;
  const applySoftBlur = true;

  const ALPHA_EMPTY = 10;
  function cornerNeedsFill(
    ctx2: OffscreenCanvasRenderingContext2D,
    x: number,
    y: number,
    size: number
  ) {
    const data = ctx2.getImageData(x, y, size, size).data;
    const total = size * size;
    let empty = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] <= ALPHA_EMPTY) empty++;
    return empty / total >= 0.05;
  }

  const cornerCoords = [
    { x: 0, y: 0 },
    { x: temp.width - cornerSize, y: 0 },
    { x: 0, y: temp.height - cornerSize },
    { x: temp.width - cornerSize, y: temp.height - cornerSize },
  ];

  cornerCoords.forEach(({ x, y }) => {
    if (!cornerNeedsFill(ctx2d, x, y, cornerSize)) return;

    const baseSx =
      x < temp.width / 2 ? sampleInset : temp.width - sampleInset - patchSize;
    const baseSy =
      y < temp.height / 2 ? sampleInset : temp.height - sampleInset - patchSize;

    const { sx, sy } = getPatchNearCorner(
      baseSx,
      baseSy,
      temp.width,
      temp.height,
      patchSize,
      ctx2d
    );

    ctx2d.save();
    ctx2d.globalCompositeOperation = "destination-over";
    ctx2d.filter = applySoftBlur ? "blur(0.6px)" : "none";
    ctx2d.imageSmoothingEnabled = true;

    ctx2d.drawImage(temp, sx, sy, patchSize, patchSize, x, y, cornerSize, cornerSize);

    ctx2d.restore();
  });

  blackenAllNearBlackPixels(ctx2d, targetCardWidth, targetCardHeight, blackThreshold);

  const edgeData = ctx2d.getImageData(0, 0, 1, targetCardHeight).data;
  let blackCount = 0;
  for (let i = 0; i < targetCardHeight; i++) {
    const r = edgeData[i * 4], g = edgeData[i * 4 + 1], b = edgeData[i * 4 + 2];
    if (r < blackThreshold && g < blackThreshold && b < blackThreshold) blackCount++;
  }
  const isMostlyBlack = blackCount / targetCardHeight > blackToleranceRatio;

  ctx.drawImage(temp, bleed, bleed);

  if (isMostlyBlack) {
    const slice = Math.max(8, Math.min(bleed, 64));
    ctx.drawImage(temp, 0, 0, slice, targetCardHeight, 0, bleed, bleed, targetCardHeight);
    ctx.drawImage(temp, targetCardWidth - slice, 0, slice, targetCardHeight, targetCardWidth + bleed, bleed, bleed, targetCardHeight);
    ctx.drawImage(temp, 0, 0, targetCardWidth, slice, bleed, 0, targetCardWidth, bleed);
    ctx.drawImage(temp, 0, targetCardHeight - slice, targetCardWidth, slice, bleed, targetCardHeight + bleed, targetCardWidth, bleed);
    ctx.drawImage(temp, 0, 0, slice, slice, 0, 0, bleed, bleed);
    ctx.drawImage(temp, targetCardWidth - slice, 0, slice, slice, targetCardWidth + bleed, 0, bleed, bleed);
    ctx.drawImage(temp, 0, targetCardHeight - slice, slice, slice, 0, targetCardHeight + bleed, bleed, bleed);
    ctx.drawImage(temp, targetCardWidth - slice, targetCardHeight - slice, slice, slice, targetCardWidth + bleed, targetCardHeight + bleed, bleed, bleed);
  } else {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(temp, 0, 0, bleed, targetCardHeight, -bleed, bleed, bleed, targetCardHeight);
    ctx.restore();

    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(temp, targetCardWidth - bleed, 0, bleed, targetCardHeight, -(targetCardWidth + bleed * 2), bleed, bleed, targetCardHeight);
    ctx.restore();

    ctx.save();
    ctx.scale(1, -1);
    ctx.drawImage(temp, 0, 0, targetCardWidth, bleed, bleed, -bleed, targetCardWidth, bleed);
    ctx.restore();

    ctx.save();
    ctx.scale(1, -1);
    ctx.drawImage(temp, 0, targetCardHeight - bleed, targetCardWidth, bleed, bleed, -(targetCardHeight + bleed * 2), targetCardWidth, bleed);
    ctx.restore();

    ctx.save();
    ctx.scale(-1, -1);
    ctx.drawImage(temp, 0, 0, bleed, bleed, -bleed, -bleed, bleed, bleed);
    ctx.restore();

    ctx.save();
    ctx.scale(-1, -1);
    ctx.drawImage(temp, targetCardWidth - bleed, 0, bleed, bleed, -(targetCardWidth + bleed * 2), -bleed, bleed, bleed);
    ctx.restore();

    ctx.save();
    ctx.scale(-1, -1);
    ctx.drawImage(temp, 0, targetCardHeight - bleed, bleed, bleed, -bleed, -(targetCardHeight + bleed * 2), bleed, bleed);
    ctx.restore();

    ctx.save();
    ctx.scale(-1, -1);
    ctx.drawImage(temp, targetCardWidth - bleed, targetCardHeight - bleed, bleed, bleed, -(targetCardWidth + bleed * 2), -(targetCardHeight + bleed * 2), bleed, bleed);
    ctx.restore();
  }

  return await canvas.convertToBlob({ type: "image/png" });
}

self.onmessage = async (e: MessageEvent) => {
  const { uuid, url, bleedEdgeWidth, unit, apiBase, isUserUpload, hasBakedBleed } = e.data;
  API_BASE = apiBase; // Set the API_BASE for the worker

  try {
    const proxiedUrl = url.startsWith("http") ? toProxied(url) : url;
    
    let imageBitmap: ImageBitmap;
    if (isUserUpload && hasBakedBleed && !url.startsWith("data:")) {
        imageBitmap = await trimExistingBleedIfAny(proxiedUrl);
    } else {
        imageBitmap = await loadImage(proxiedUrl);
    }

    const processedBlob = await addBleedEdge(imageBitmap, bleedEdgeWidth, { unit, bleedEdgeWidth });
    imageBitmap.close(); // Release memory

    self.postMessage({ uuid, processedBlob });
  } catch (error: any) {
    self.postMessage({ uuid, error: error.message });
  }
};
