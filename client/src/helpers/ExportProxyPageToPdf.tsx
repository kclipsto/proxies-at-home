import jsPDF from "jspdf";
import { API_BASE } from "../constants";
import type { CardOption } from "../types/Card";

const DPI = 600;
// eslint-disable-next-line react-refresh/only-export-components
const IN = (inches: number) => Math.round(inches * DPI);
const MM_TO_IN = (mm: number) => mm / 25.4;
const MM_TO_PX = (mm: number) => IN(MM_TO_IN(mm));

function getLocalBleedImageUrl(originalUrl: string): string {
  return `${API_BASE}/api/cards/images/proxy?url=${encodeURIComponent(originalUrl)}`;
}

function preferPng(url: string) {
  try {
    const u = new URL(url);
    if (
      u.hostname.endsWith("scryfall.io") &&
      u.pathname.match(/\.(jpg|jpeg)$/i)
    ) {
      u.pathname = u.pathname.replace(/\.(jpg|jpeg)$/i, ".png");
      return u.toString();
    }
  } catch (e) {
    console.error("Error in preferPng:", e);
  }
  return url;
}

function bucketDpiFromHeight(h: number): 300 | 600 | 800 | 1200 {
  if (h >= 4440) return 1200;
  if (h >= 2960) return 800;
  if (h >= 2220) return 600;
  return 300;
}
function calibratedBleedTrimPxForHeight(h: number): number {
  const dpi = bucketDpiFromHeight(h);
  if (dpi === 300) return 72;
  if (dpi === 600) return 78;
  if (dpi === 800) return 104;
  return 156;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function trimExistingBleedIfAny(
  src: string,
  bleedTrimPx?: number
): Promise<HTMLImageElement> {
  const img = await loadImage(src);
  const trim = bleedTrimPx ?? calibratedBleedTrimPxForHeight(img.height);

  const w = img.width - trim * 2;
  const h = img.height - trim * 2;
  if (w <= 0 || h <= 0) return img;

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, -trim, -trim);
  const out = new Image();
  out.src = c.toDataURL("image/png");
  await new Promise((r) => (out.onload = r));
  return out;
}

function blackenAllNearBlackPixels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  threshold: number,
  borderThickness = { top: 192, bottom: 800, left: 96, right: 96 },
  targetDpi = DPI
) {
  const scale = targetDpi / 300;
  const bt = {
    top: Math.round(borderThickness.top * scale),
    bottom: Math.round(borderThickness.bottom * scale),
    left: Math.round(borderThickness.left * scale),
    right: Math.round(borderThickness.right * scale),
  };

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let y = 0; y < height; y++) {
    const inY = y < bt.top || y >= height - bt.bottom;
    for (let x = 0; x < width; x++) {
      const inX = x < bt.left || x >= width - bt.right;
      if (!(inY || inX)) continue;

      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (r < threshold && g < threshold && b < threshold) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function drawEdgeStubs(
  ctx: CanvasRenderingContext2D,
  pageW: number,
  pageH: number,
  startX: number,
  startY: number,
  columns: number,
  rows: number,
  contentW: number,
  contentH: number,
  cardW: number,
  cardH: number,
  bleedPx: number,
  guideWidthPx: number
) {
  const xCuts: number[] = [];
  for (let c = 0; c < columns; c++) {
    const cellLeft = startX + c * cardW;
    xCuts.push(cellLeft + bleedPx);
    xCuts.push(cellLeft + bleedPx + contentW);
  }

  const yCuts: number[] = [];
  for (let r = 0; r < rows; r++) {
    const cellTop = startY + r * cardH;
    yCuts.push(cellTop + bleedPx);
    yCuts.push(cellTop + bleedPx + contentH);
  }

  const topStubH = startY + bleedPx;
  const botStubH = startY + bleedPx;
  const leftStubW = startX + bleedPx;
  const rightStubW = startX + bleedPx;

  ctx.save();
  ctx.fillStyle = "#000000";

  for (const x of xCuts) {
    ctx.fillRect(x, 0, guideWidthPx, topStubH);
    ctx.fillRect(x, pageH - botStubH, guideWidthPx, botStubH);
  }
  for (const y of yCuts) {
    ctx.fillRect(0, y, leftStubW, guideWidthPx);
    ctx.fillRect(pageW - rightStubW, y, rightStubW, guideWidthPx);
  }

  ctx.restore();
}

async function buildCardWithBleed(
  src: string,
  bleedPx: number,
  opts: { isUserUpload: boolean; hasBakedBleed?: boolean }
): Promise<HTMLCanvasElement> {
  const contentW = MM_TO_PX(63.5);
  const contentH = MM_TO_PX(88.9);
  const finalW = contentW + bleedPx * 2;
  const finalH = contentH + bleedPx * 2;

  const baseImg =
    opts.isUserUpload && opts.hasBakedBleed
      ? await trimExistingBleedIfAny(src) // uses calibrated buckets 72/78/104/156
      : await loadImage(src);

  const aspect = baseImg.width / baseImg.height;
  const targetAspect = contentW / contentH;
  let drawW = contentW,
    drawH = contentH,
    offX = 0,
    offY = 0;
  if (aspect > targetAspect) {
    drawH = contentH;
    drawW = Math.round(baseImg.width * (contentH / baseImg.height));
    offX = Math.round((drawW - contentW) / 2);
  } else {
    drawW = contentW;
    drawH = Math.round(baseImg.height * (contentW / baseImg.width));
    offY = Math.round((drawH - contentH) / 2);
  }

  // Base canvas at content size
  const base = document.createElement("canvas");
  base.width = contentW;
  base.height = contentH;
  const bctx = base.getContext("2d")!;
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(baseImg, -offX, -offY, drawW, drawH);

  // Corner fill logic (preview parity)
  const cornerSize = 60;
  const sampleInset = 20;
  const blackThreshold = 30;

  const fillIfLight = (r: number, g: number, b: number, a: number) =>
    a === 0 || (r > 200 && g > 200 && b > 200);

  const averageColor = (
    sx: number,
    sy: number,
    w: number,
    h: number
  ): string => {
    const clampedX = Math.max(0, Math.min(contentW - w, sx));
    const clampedY = Math.max(0, Math.min(contentH - h, sy));
    const data = bctx.getImageData(clampedX, clampedY, w, h).data;
    let r = 0,
      g = 0,
      b = 0,
      count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a === 0) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }
    if (count === 0) return "rgb(0,0,0)";
    r = Math.round(r / count);
    g = Math.round(g / count);
    b = Math.round(b / count);
    return `rgb(${r}, ${g}, ${b})`;
  };

  const corners = [
    { x: 0, y: 0 },
    { x: contentW - cornerSize, y: 0 },
    { x: 0, y: contentH - cornerSize },
    { x: contentW - cornerSize, y: contentH - cornerSize },
  ];
  corners.forEach(({ x, y }) => {
    const data = bctx.getImageData(x, y, cornerSize, cornerSize).data;
    let shouldFill = false;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2],
        a = data[i + 3];
      if (fillIfLight(r, g, b, a)) {
        shouldFill = true;
        break;
      }
    }
    if (shouldFill) {
      const sx = x < contentW / 2 ? sampleInset : contentW - sampleInset - 10;
      const sy = y < contentH / 2 ? sampleInset : contentH - sampleInset - 10;
      bctx.fillStyle = averageColor(sx, sy, 10, 10);
      bctx.fillRect(x, y, cornerSize, cornerSize);
    }
  });

  // Scale blackening borders by OUTPUT DPI
  blackenAllNearBlackPixels(
    bctx,
    contentW,
    contentH,
    blackThreshold,
    undefined,
    DPI
  );

  const out = document.createElement("canvas");
  out.width = finalW;
  out.height = finalH;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(base, bleedPx, bleedPx);

  if (bleedPx > 0) {
    const mostlyBlack = (() => {
      const edge = bctx.getImageData(0, 0, 1, contentH).data;
      let blackCount = 0;
      for (let i = 0; i < contentH; i++) {
        const idx = i * 4;
        const r = edge[idx],
          g = edge[idx + 1],
          b = edge[idx + 2];
        if (r < blackThreshold && g < blackThreshold && b < blackThreshold)
          blackCount++;
      }
      return blackCount / contentH > 0.7;
    })();

    if (mostlyBlack) {
      const slice = Math.min(8, Math.floor(contentW / 100));
      ctx.drawImage(base, 0, 0, slice, contentH, 0, bleedPx, bleedPx, contentH);
      ctx.drawImage(
        base,
        contentW - slice,
        0,
        slice,
        contentH,
        contentW + bleedPx,
        bleedPx,
        bleedPx,
        contentH
      );
      ctx.drawImage(base, 0, 0, contentW, slice, bleedPx, 0, contentW, bleedPx);
      ctx.drawImage(
        base,
        0,
        contentH - slice,
        contentW,
        slice,
        bleedPx,
        contentH + bleedPx,
        contentW,
        bleedPx
      );

      ctx.drawImage(base, 0, 0, slice, slice, 0, 0, bleedPx, bleedPx);
      ctx.drawImage(
        base,
        contentW - slice,
        0,
        slice,
        slice,
        contentW + bleedPx,
        0,
        bleedPx,
        bleedPx
      );
      ctx.drawImage(
        base,
        0,
        contentH - slice,
        slice,
        slice,
        0,
        contentH + bleedPx,
        bleedPx,
        bleedPx
      );
      ctx.drawImage(
        base,
        contentW - slice,
        contentH - slice,
        slice,
        slice,
        contentW + bleedPx,
        contentH + bleedPx,
        bleedPx,
        bleedPx
      );
    } else {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(
        base,
        0,
        0,
        bleedPx,
        contentH,
        -bleedPx,
        bleedPx,
        bleedPx,
        contentH
      );
      ctx.restore();

      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(
        base,
        contentW - bleedPx,
        0,
        bleedPx,
        contentH,
        -(contentW + 2 * bleedPx),
        bleedPx,
        bleedPx,
        contentH
      );
      ctx.restore();

      ctx.save();
      ctx.scale(1, -1);
      ctx.drawImage(
        base,
        0,
        0,
        contentW,
        bleedPx,
        bleedPx,
        -bleedPx,
        contentW,
        bleedPx
      );
      ctx.restore();

      ctx.save();
      ctx.scale(1, -1);
      ctx.drawImage(
        base,
        0,
        contentH - bleedPx,
        contentW,
        bleedPx,
        bleedPx,
        -(contentH + 2 * bleedPx),
        contentW,
        bleedPx
      );
      ctx.restore();

      ctx.save();
      ctx.scale(-1, -1);
      ctx.drawImage(
        base,
        0,
        0,
        bleedPx,
        bleedPx,
        -bleedPx,
        -bleedPx,
        bleedPx,
        bleedPx
      );
      ctx.restore();

      ctx.save();
      ctx.scale(-1, -1);
      ctx.drawImage(
        base,
        contentW - bleedPx,
        0,
        bleedPx,
        bleedPx,
        -(contentW + 2 * bleedPx),
        -bleedPx,
        bleedPx,
        bleedPx
      );
      ctx.restore();

      ctx.save();
      ctx.scale(-1, -1);
      ctx.drawImage(
        base,
        0,
        contentH - bleedPx,
        bleedPx,
        bleedPx,
        -bleedPx,
        -(contentH + 2 * bleedPx),
        bleedPx,
        bleedPx
      );
      ctx.restore();

      ctx.save();
      ctx.scale(-1, -1);
      ctx.drawImage(
        base,
        contentW - bleedPx,
        contentH - bleedPx,
        bleedPx,
        bleedPx,
        -(contentW + 2 * bleedPx),
        -(contentH + 2 * bleedPx),
        bleedPx,
        bleedPx
      );
      ctx.restore();
    }
  }

  return out;
}

function scaleGuideWidthForDPI(
  screenPx: number,
  screenPPI = 96,
  targetDPI = DPI
): number {
  return Math.round((screenPx / screenPPI) * targetDPI);
}

// Draw the same 2mm corner L-guides rendered in preview
function drawCornerGuides(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  contentW: number,
  contentH: number,
  bleedPx: number,
  guideColor: string,
  guideWidthPx: number
) {
  const guideLenPx = MM_TO_PX(2);
  const gx = x + bleedPx;
  const gy = y + bleedPx;

  ctx.save();
  ctx.fillStyle = guideColor;

  // TL
  ctx.fillRect(gx, gy, guideWidthPx, guideLenPx);
  ctx.fillRect(gx, gy, guideLenPx, guideWidthPx);
  // TR
  ctx.fillRect(gx + contentW, gy, guideWidthPx, guideLenPx);
  ctx.fillRect(
    gx + contentW - guideLenPx + guideWidthPx,
    gy,
    guideLenPx,
    guideWidthPx
  );
  // BL
  ctx.fillRect(
    gx,
    gy + contentH - guideLenPx + guideWidthPx,
    guideWidthPx,
    guideLenPx
  );
  ctx.fillRect(gx, gy + contentH, guideLenPx, guideWidthPx);
  // BR
  ctx.fillRect(
    gx + contentW,
    gy + contentH - guideLenPx + guideWidthPx,
    guideWidthPx,
    guideLenPx
  );
  ctx.fillRect(
    gx + contentW - guideLenPx + guideWidthPx,
    gy + contentH,
    guideLenPx,
    guideWidthPx
  );

  ctx.restore();
}

// POST EXPORT — matches preview layout exactly
export async function exportProxyPagesToPdf(opts: {
  cards: CardOption[];
  originalSelectedImages: Record<string, string>;
  bleedEdge: boolean;
  bleedEdgeWidthMm: number;
  guideColor: string;
  guideWidthPx: number;
  pageWidthInches: number;
  pageHeightInches: number;
  pdfPageColor?: string;
  columns: number;
  rows: number;
}) {
  const {
    cards,
    originalSelectedImages,
    bleedEdge,
    bleedEdgeWidthMm,
    guideColor,
    guideWidthPx,
    pageWidthInches,
    pageHeightInches,
    pdfPageColor = "#FFFFFF",
    columns,
    rows,
  } = opts;

  // Canvas size (pixels at DPI) — used for high-res page render
  const pageW = IN(pageWidthInches);
  const pageH = IN(pageHeightInches);

  // Card + bleed in pixels (at DPI)
  const contentW = MM_TO_PX(63);
  const contentH = MM_TO_PX(88);
  const bleedPx = bleedEdge ? MM_TO_PX(bleedEdgeWidthMm) : 0;
  const cardW = contentW + 2 * bleedPx;
  const cardH = contentH + 2 * bleedPx;

  // Grid + centering
  const perPage = Math.max(1, columns * rows);
  const gridW = columns * cardW;
  const gridH = rows * cardH;
  const startX = Math.round((pageW - gridW) / 2);
  const startY = Math.round((pageH - gridH) / 2);

  const pages: CardOption[][] = [];
  for (let i = 0; i < cards.length; i += perPage) {
    pages.push(cards.slice(i, i + perPage));
  }
  if (pages.length === 0) pages.push([]);

  const pdf = new jsPDF({
    orientation: pageW >= pageH ? "landscape" : "portrait",
    unit: "mm",
    format: [pageWidthInches * 25.4, pageHeightInches * 25.4],
    compress: true,
  });

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const pageCards = pages[pageIndex];

    const canvas = document.createElement("canvas");
    canvas.width = pageW;
    canvas.height = pageH;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = pdfPageColor;
    ctx.fillRect(0, 0, pageW, pageH);

    for (let idx = 0; idx < pageCards.length; idx++) {
      const card = pageCards[idx];
      const col = idx % columns;
      const row = Math.floor(idx / columns);
      const x = startX + col * cardW;
      const y = startY + row * cardH;

      let src = originalSelectedImages[card.uuid] ?? card.imageUrls?.[0] ?? "";
      if (!card.isUserUpload) src = getLocalBleedImageUrl(preferPng(src));

      const cardCanvas = await buildCardWithBleed(src, bleedPx, {
        isUserUpload: !!card.isUserUpload,
        hasBakedBleed: !!card.hasBakedBleed,
      });
      ctx.drawImage(cardCanvas, x, y);

      if (bleedEdge) {
        const scaledGuideWidth = scaleGuideWidthForDPI(guideWidthPx, 96, DPI);
        drawCornerGuides(
          ctx,
          x,
          y,
          contentW,
          contentH,
          bleedPx,
          guideColor,
          scaledGuideWidth
        );
        drawEdgeStubs(
          ctx,
          pageW,
          pageH,
          startX,
          startY,
          columns,
          rows,
          contentW,
          contentH,
          cardW,
          cardH,
          bleedPx,
          scaledGuideWidth
        );
      }
    }

    const pageImg = canvas.toDataURL("image/jpeg", 0.95);
    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(
      pageImg,
      "JPEG",
      0,
      0,
      pageWidthInches * 25.4,
      pageHeightInches * 25.4
    );
  }

  pdf.save(`proxxies_${new Date().toISOString().slice(0, 10)}.pdf`);
}
