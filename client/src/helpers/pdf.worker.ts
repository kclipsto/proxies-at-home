export {}; 
declare const self: DedicatedWorkerGlobalScope;

const NEAR_BLACK = 16;
const NEAR_WHITE = 239;
const ALPHA_EMPTY = 10;

const IN = (inches: number, dpi: number) => Math.round(inches * dpi);
const MM_TO_IN = (mm: number) => mm / 25.4;
const MM_TO_PX = (mm: number, dpi: number) => IN(MM_TO_IN(mm), dpi);

function getLocalBleedImageUrl(originalUrl: string, apiBase: string) {
    return `${apiBase}/api/cards/images/proxy?url=${encodeURIComponent(originalUrl)}`;
}

function cornerNeedsFill(ctx: OffscreenCanvasRenderingContext2D, x: number, y: number, cornerSize: number) {
    const data = ctx.getImageData(x, y, cornerSize, cornerSize).data;
    const total = cornerSize * cornerSize;
    let empty = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] <= ALPHA_EMPTY) empty++;
    }
    return empty / total >= 0.05;
}

function detectFlatBorderColor(ctx: OffscreenCanvasRenderingContext2D, contentW: number, contentH: number, cornerX: number, cornerY: number, sampleLen: number, strip: number): "black" | "white" | null {
    const leftEdge = cornerX === 0;
    const topEdge = cornerY === 0;
    const rightEdge = cornerX >= contentW - strip;
    const bottomEdge = cornerY >= contentH - strip;

    const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
    if (leftEdge) rects.push({ x: 0, y: cornerY, w: strip, h: Math.min(sampleLen, contentH - cornerY) });
    if (topEdge) rects.push({ x: cornerX, y: 0, w: Math.min(sampleLen, contentW - cornerX), h: strip });
    if (rightEdge) rects.push({ x: contentW - strip, y: Math.max(0, cornerY - (sampleLen - strip)), w: strip, h: Math.min(sampleLen, contentH - (cornerY - (sampleLen - strip))) });
    if (bottomEdge) rects.push({ x: Math.max(0, cornerX - (sampleLen - strip)), y: contentH - strip, w: Math.min(sampleLen, contentW - (cornerX - (sampleLen - strip))), h: strip });

    if (!rects.length) return null;

    let black = 0, white = 0, total = 0;
    for (const r of rects) {
        const { data } = ctx.getImageData(r.x, r.y, r.w, r.h);
        for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            if (a <= ALPHA_EMPTY) continue;
            const R = data[i], G = data[i + 1], B = data[i + 2];
            total++;
            if (R <= NEAR_BLACK && G <= NEAR_BLACK && B <= NEAR_BLACK) black++;
            else if (R >= NEAR_WHITE && G >= NEAR_WHITE && B >= NEAR_WHITE) white++;
        }
    }

    if (total === 0) return null;
    if (black / total >= 0.9) return "black";
    if (white / total >= 0.9) return "white";
    return null;
}

async function loadImage(src: string): Promise<ImageBitmap> {
    const resp = await fetch(src, { mode: "cors", credentials: "omit" });
    if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status} for URL ${src}`);
    const blob = await resp.blob();
    return createImageBitmap(blob);
}

function bucketDpiFromHeight(h: number) {
    if (h >= 4440) return 1200;
    if (h >= 2960) return 800;
    if (h >= 2220) return 600;
    return 300;
}

function calibratedBleedTrimPxForHeight(h: number) {
    const dpi = bucketDpiFromHeight(h);
    if (dpi === 300) return 72;
    if (dpi === 600) return 78;
    if (dpi === 800) return 104;
    return 156;
}

async function trimExistingBleedIfAny(src: string, bleedTrimPx?: number): Promise<ImageBitmap> {
    const img = await loadImage(src);
    const trim = bleedTrimPx ?? calibratedBleedTrimPxForHeight(img.height);
    const w = img.width - trim * 2;
    const h = img.height - trim * 2;
    if (w <= 0 || h <= 0) return img;
    const newImg = await createImageBitmap(img, trim, trim, w, h);
    img.close();
    return newImg;
}

function blackenAllNearBlackPixels(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, threshold: number, dpi: number) {
    const borderThickness = { top: 48, bottom: 48, left: 48, right: 48 };
    const scale = dpi / 300;
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
            const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
            if (r < threshold && g < threshold && b < threshold) {
                data[i] = 0;
                data[i + 1] = 0;
                data[i + 2] = 0;
            }
        }
    }
    ctx.putImageData(imageData, 0, 0);
}

function drawEdgeStubs(ctx: OffscreenCanvasRenderingContext2D, pageW: number, pageH: number, startX: number, startY: number, columns: number, rows: number, contentW: number, contentH: number, cardW: number, cardH: number, bleedPx: number, guideWidthPx: number, spacingPx = 0) {
    const xCuts: number[] = [];
    for (let c = 0; c < columns; c++) {
        const cellLeft = startX + c * (cardW + spacingPx);
        xCuts.push(cellLeft + bleedPx);
        xCuts.push(cellLeft + bleedPx + contentW);
    }
    const yCuts: number[] = [];
    for (let r = 0; r < rows; r++) {
        const cellTop = startY + r * (cardH + spacingPx);
        yCuts.push(cellTop + bleedPx);
        yCuts.push(cellTop + bleedPx + contentH);
    }
    const topStubH = startY;
    const botStubH = pageH - (startY + rows * cardH + (rows - 1) * spacingPx);
    const leftStubW = startX;
    const rightStubW = pageW - (startX + columns * cardW + (columns - 1) * spacingPx);
    ctx.save();
    ctx.fillStyle = "#000000";
    for (const x of xCuts) {
        if (topStubH > 0) ctx.fillRect(x, 0, guideWidthPx, topStubH);
        if (botStubH > 0) ctx.fillRect(x, pageH - botStubH, guideWidthPx, botStubH);
    }
    for (const y of yCuts) {
        if (leftStubW > 0) ctx.fillRect(0, y, leftStubW, guideWidthPx);
        if (rightStubW > 0) ctx.fillRect(pageW - rightStubW, y, rightStubW, guideWidthPx);
    }
    ctx.restore();
}

function scaleGuideWidthForDPI(screenPx: number, screenPPI = 96, targetDPI: number) {
    return Math.round((screenPx / screenPPI) * targetDPI);
}

function drawCornerGuides(ctx: OffscreenCanvasRenderingContext2D, x: number, y: number, contentW: number, contentH: number, bleedPx: number, guideColor: string, guideWidthPx: number, dpi: number) {
    const guideLenPx = MM_TO_PX(2, dpi);
    const gx = x + bleedPx;
    const gy = y + bleedPx;
    ctx.save();
    ctx.fillStyle = guideColor;
    // TL
    ctx.fillRect(gx, gy, guideWidthPx, guideLenPx);
    ctx.fillRect(gx, gy, guideLenPx, guideWidthPx);
    // TR
    ctx.fillRect(gx + contentW - guideLenPx, gy, guideLenPx, guideWidthPx);
    ctx.fillRect(gx + contentW, gy, guideWidthPx, guideLenPx);
    // BL
    ctx.fillRect(gx, gy + contentH - guideLenPx, guideWidthPx, guideLenPx);
    ctx.fillRect(gx, gy + contentH, guideLenPx, guideWidthPx);
    // BR
    ctx.fillRect(gx + contentW - guideLenPx, gy + contentH, guideLenPx, guideWidthPx);
    ctx.fillRect(gx + contentW, gy + contentH - guideLenPx, guideWidthPx, guideLenPx);
    ctx.restore();
}

function getPatchNearCorner(seedX: number, seedY: number) {
    return { sx: seedX, sy: seedY };
}


async function buildCardWithBleed(
    src: string,
    bleedPx: number,
    contentWidthPx: number,
    contentHeightPx: number,
    dpi: number,
    opts: { isUserUpload: boolean; hasBakedBleed?: boolean }
): Promise<OffscreenCanvas> {
    const finalW = contentWidthPx + bleedPx * 2;
    const finalH = contentHeightPx + bleedPx * 2;

    const baseImg = opts.isUserUpload && opts.hasBakedBleed ?
        await trimExistingBleedIfAny(src) :
        await loadImage(src);

    const aspect = baseImg.width / baseImg.height;
    const targetAspect = contentWidthPx / contentHeightPx;
    let drawW = contentWidthPx, drawH = contentHeightPx, offX = 0, offY = 0;
    if (aspect > targetAspect) {
        drawW = Math.round(baseImg.width * (contentHeightPx / baseImg.height));
        offX = Math.round((drawW - contentWidthPx) / 2);
    } else {
        drawH = Math.round(baseImg.height * (contentWidthPx / baseImg.width));
        offY = Math.round((drawH - contentHeightPx) / 2);
    }

    const base = new OffscreenCanvas(contentWidthPx, contentHeightPx);
    const bctx = base.getContext("2d", { willReadFrequently: true })!;
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = "high";
    bctx.drawImage(baseImg, -offX, -offY, drawW, drawH);
    baseImg.close();

    const dpiFactor = dpi / 300;
    const cornerSize = Math.round(30 * dpiFactor);
    const sampleInset = Math.round(10 * dpiFactor);
    const patchSize = Math.round(20 * dpiFactor);
    const blurPx = Math.max(1, Math.round(1.5 * dpiFactor));
    const blackThreshold = 30;

    function drawFeatheredPatch(dst: OffscreenCanvasRenderingContext2D, sx: number, sy: number, tx: number, ty: number, dw: number, dh: number) {
        const buf = new OffscreenCanvas(dw, dh);
        const bctx2 = buf.getContext("2d")!;
        bctx2.imageSmoothingEnabled = true;
        bctx2.imageSmoothingQuality = "high";
        bctx2.drawImage(dst.canvas, sx, sy, dw, dh, 0, 0, dw, dh);
        dst.save();
        dst.imageSmoothingEnabled = true;
        dst.imageSmoothingQuality = "high";
        dst.filter = `blur(${blurPx}px)`;
        dst.globalAlpha = 0.85;
        dst.drawImage(buf, tx, ty, dw, dh);
        dst.filter = "none";
        dst.globalAlpha = 0.9;
        dst.drawImage(buf, tx, ty, dw, dh);
        dst.globalAlpha = 1;
        dst.restore();
    }
    const corners = [{ x: 0, y: 0 }, { x: contentWidthPx - cornerSize, y: 0 }, { x: 0, y: contentHeightPx - cornerSize }, { x: contentWidthPx - cornerSize, y: contentHeightPx - cornerSize }, ];
    for (const { x, y } of corners) {
        if (!cornerNeedsFill(bctx, x, y, cornerSize)) continue;
        const flat = detectFlatBorderColor(bctx, contentWidthPx, contentHeightPx, x, y, Math.round(40 * dpiFactor), Math.round(6 * dpiFactor));
        if (flat) {
            bctx.save();
            bctx.globalCompositeOperation = "destination-over";
            bctx.fillStyle = flat === "black" ? "#000000" : "#FFFFFF";
            bctx.fillRect(x, y, cornerSize, cornerSize);
            bctx.restore();
            continue;
        }
        const seedX = x < contentWidthPx / 2 ? sampleInset : contentWidthPx - sampleInset - patchSize;
        const seedY = y < contentHeightPx / 2 ? sampleInset : contentHeightPx - sampleInset - patchSize;
        const { sx, sy } = getPatchNearCorner(seedX, seedY);
        bctx.save();
        bctx.globalCompositeOperation = "destination-over";
        for (let ty = y; ty < y + cornerSize; ty += patchSize) {
            for (let tx = x; tx < x + cornerSize; tx += patchSize) {
                const dw = Math.min(patchSize, x + cornerSize - tx);
                const dh = Math.min(patchSize, y + cornerSize - ty);
                const jx = sx + Math.floor((Math.random() - 0.5) * (patchSize * 0.25));
                const jy = sy + Math.floor((Math.random() - 0.5) * (patchSize * 0.25));
                const csx = Math.max(0, Math.min(contentWidthPx - dw, jx));
                const csy = Math.max(0, Math.min(contentHeightPx - dh, jy));
                drawFeatheredPatch(bctx, csx, csy, tx, ty, dw, dh);
            }
        }
        bctx.restore();
    }
    blackenAllNearBlackPixels(bctx, contentWidthPx, contentHeightPx, blackThreshold, dpi);
    const out = new OffscreenCanvas(finalW, finalH);
    const ctx = out.getContext("2d")!;
    ctx.drawImage(base, bleedPx, bleedPx);
    if (bleedPx > 0) {
        const slice = Math.min(8, Math.floor(contentWidthPx / 100));
        ctx.drawImage(base, 0, 0, slice, contentHeightPx, 0, bleedPx, bleedPx, contentHeightPx);
        ctx.drawImage(base, contentWidthPx - slice, 0, slice, contentHeightPx, contentWidthPx + bleedPx, bleedPx, bleedPx, contentHeightPx);
        ctx.drawImage(base, 0, 0, contentWidthPx, slice, bleedPx, 0, contentWidthPx, bleedPx);
        ctx.drawImage(base, 0, contentHeightPx - slice, contentWidthPx, slice, bleedPx, contentHeightPx + bleedPx, contentWidthPx, bleedPx);
        ctx.drawImage(base, 0, 0, slice, slice, 0, 0, bleedPx, bleedPx);
        ctx.drawImage(base, contentWidthPx - slice, 0, slice, slice, contentWidthPx + bleedPx, 0, bleedPx, bleedPx);
        ctx.drawImage(base, 0, contentHeightPx - slice, slice, slice, 0, contentHeightPx + bleedPx, bleedPx, bleedPx);
        ctx.drawImage(base, contentWidthPx - slice, contentHeightPx - slice, slice, slice, contentWidthPx + bleedPx, contentHeightPx + bleedPx, bleedPx, bleedPx);
    }
    return out;
}

self.onmessage = async (event: MessageEvent) => {
    try {
        const { pageCards, pageIndex, settings } = event.data;
        const {
            pageWidth, pageHeight, pageSizeUnit, columns, rows, bleedEdge,
            bleedEdgeWidthMm, cardSpacingMm, cardPositionX, cardPositionY, guideColor, guideWidthPx, DPI,
            imagesById, API_BASE
        } = settings;

        const pageWidthPx = pageSizeUnit === "in" ? IN(pageWidth, DPI) : MM_TO_PX(pageWidth, DPI);
        const pageHeightPx = pageSizeUnit === "in" ? IN(pageHeight, DPI) : MM_TO_PX(pageHeight, DPI);
        const contentWidthInPx = MM_TO_PX(63, DPI);
        const contentHeightInPx = MM_TO_PX(88, DPI);
        const bleedPx = bleedEdge ? MM_TO_PX(bleedEdgeWidthMm, DPI) : 0;
        const cardWidthPx = contentWidthInPx + 2 * bleedPx;
        const cardHeightPx = contentHeightInPx + 2 * bleedPx;
        const spacingPx = MM_TO_PX(cardSpacingMm || 0, DPI);
        const gridWidthPx = columns * cardWidthPx + Math.max(0, columns - 1) * spacingPx;
        const gridHeightPx = rows * cardHeightPx + Math.max(0, rows - 1) * spacingPx;
        const positionOffsetXPx = MM_TO_PX(cardPositionX || 0, DPI);
        const positionOffsetYPx = MM_TO_PX(cardPositionY || 0, DPI);
        const startX = Math.round((pageWidthPx - gridWidthPx) / 2) + positionOffsetXPx;
        const startY = Math.round((pageHeightPx - gridHeightPx) / 2) + positionOffsetYPx;

        const canvas = new OffscreenCanvas(pageWidthPx, pageHeightPx);
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, pageWidthPx, pageHeightPx);

        let imagesProcessed = 0;
        const scaledGuideWidth = scaleGuideWidthForDPI(guideWidthPx, 96, DPI);

        for (const [idx, card] of pageCards.entries()) {
            const col = idx % columns;
            const row = Math.floor(idx / columns);
            const x = startX + col * (cardWidthPx + spacingPx);
            const y = startY + row * (cardHeightPx + spacingPx);
    
            let finalCardCanvas: OffscreenCanvas | ImageBitmap;
            const imageInfo = card.imageId ? imagesById.get(card.imageId) : undefined;

            const isCacheValid = 
                imageInfo?.exportBlob &&
                imageInfo?.exportDpi === DPI &&
                imageInfo?.exportBleedWidth === bleedEdgeWidthMm;

            if (isCacheValid) {
                finalCardCanvas = await createImageBitmap(imageInfo.exportBlob!);
            } else {
                let src = imageInfo?.originalBlob ? URL.createObjectURL(imageInfo.originalBlob) : imageInfo?.sourceUrl;
        
                if (!src) {
                    const cardWidthWithBleed = contentWidthInPx + 2 * bleedPx;
                    const cardHeightWithBleed = contentHeightInPx + 2 * bleedPx;
                    const placeholderCanvas = new OffscreenCanvas(cardWidthWithBleed, cardHeightWithBleed);
                    const cardCtx = placeholderCanvas.getContext('2d')!;
                    cardCtx.fillStyle = 'white';
                    cardCtx.fillRect(0, 0, cardWidthWithBleed, cardHeightWithBleed);
                    cardCtx.strokeStyle = 'red';
                    cardCtx.lineWidth = 5;
                    cardCtx.strokeRect(bleedPx, bleedPx, contentWidthInPx, contentHeightInPx);
                    cardCtx.fillStyle = 'red';
                    cardCtx.font = '30px sans-serif';
                    cardCtx.textAlign = 'center';
                    cardCtx.fillText('Image not found', cardWidthWithBleed / 2, cardHeightWithBleed / 2);
                    finalCardCanvas = placeholderCanvas;
                } else {
                    if (!card.isUserUpload) {
                        src = getLocalBleedImageUrl(src, API_BASE);
                    }
                    finalCardCanvas = await buildCardWithBleed(src, bleedPx, contentWidthInPx, contentHeightInPx, DPI, {
                        isUserUpload: !!card.isUserUpload,
                        hasBakedBleed: !!card.hasBakedBleed,
                    });
                    if (src.startsWith("blob:")) URL.revokeObjectURL(src);
                }
            }
    
            ctx.drawImage(finalCardCanvas, x, y, cardWidthPx, cardHeightPx);
            if (finalCardCanvas instanceof ImageBitmap) {
                finalCardCanvas.close();
            }

            if (bleedEdge) {
                drawCornerGuides(ctx, x, y, contentWidthInPx, contentHeightInPx, bleedPx, guideColor, scaledGuideWidth, DPI);
            }

            imagesProcessed++;
            self.postMessage({ type: 'progress', pageIndex, imagesProcessed });
        }

        if (bleedEdge) {
            drawEdgeStubs(ctx, pageWidthPx, pageHeightPx, startX, startY, columns, rows, contentWidthInPx, contentHeightInPx, cardWidthPx, cardHeightPx, bleedPx, scaledGuideWidth, spacingPx);
        }

        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.98 });
        if (blob) {
            const url = URL.createObjectURL(blob);
            self.postMessage({ type: 'result', url, pageIndex });
        } else {
            self.postMessage({ error: 'Failed to create blob' });
        }

    } catch (error: unknown) {
        console.error("Error in PDF worker process:", error);
        if (error instanceof Error) {
            self.postMessage({ error: error.message, stack: error.stack, pageIndex: event.data.pageIndex });
        } else {
            self.postMessage({ error: "An unknown error occurred in the PDF worker.", pageIndex: event.data.pageIndex });
        }
    }
};

