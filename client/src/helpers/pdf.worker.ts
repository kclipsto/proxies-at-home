import {
    IN,
    MM_TO_PX,
    toProxied,
    loadImage,
    trimExistingBleedIfAny,
    blackenAllNearBlackPixels,
} from "./imageProcessing";
import { applyJFA } from "./jfa";

export { };
declare const self: DedicatedWorkerGlobalScope;

function getLocalBleedImageUrl(originalUrl: string, apiBase: string) {
    return toProxied(originalUrl, apiBase);
}


function drawFullPageGuides(ctx: OffscreenCanvasRenderingContext2D, pageW: number, pageH: number, startX: number, startY: number, columns: number, rows: number, contentW: number, contentH: number, cardW: number, cardH: number, bleedPx: number, guideWidthPx: number, spacingPx = 0, occupiedCols?: Set<number>, occupiedRows?: Set<number>, cutLineStyle: 'none' | 'edges' | 'full' = 'full') {
    if (cutLineStyle === 'none') return;
    const xCuts: number[] = [];
    for (let c = 0; c < columns; c++) {
        if (!occupiedCols || occupiedCols.has(c)) {
            const cellLeft = startX + c * (cardW + spacingPx);
            xCuts.push(cellLeft + bleedPx);
            xCuts.push(cellLeft + bleedPx + contentW);
        }
    }
    const yCuts: number[] = [];
    for (let r = 0; r < rows; r++) {
        if (!occupiedRows || occupiedRows.has(r)) {
            const cellTop = startY + r * (cardH + spacingPx);
            yCuts.push(cellTop + bleedPx);
            yCuts.push(cellTop + bleedPx + contentH);
        }
    }

    ctx.save();
    ctx.fillStyle = "#000000";

    // Draw vertical lines
    for (const x of xCuts) {
        if (cutLineStyle === 'full') {
            ctx.fillRect(x, 0, guideWidthPx, pageH);
        } else {
            // Edges only
            if (startY > 0) {
                ctx.fillRect(x, 0, guideWidthPx, startY);
            }
            const botStubStart = startY + rows * cardH + (rows - 1) * spacingPx;
            const botStubH = pageH - botStubStart;
            if (botStubH > 0) {
                ctx.fillRect(x, botStubStart, guideWidthPx, botStubH);
            }
        }
    }

    // Draw horizontal lines
    for (const y of yCuts) {
        if (cutLineStyle === 'full') {
            ctx.fillRect(0, y, pageW, guideWidthPx);
        } else {
            // Edges only
            if (startX > 0) {
                ctx.fillRect(0, y, startX, guideWidthPx);
            }
            const rightStubStart = startX + columns * cardW + (columns - 1) * spacingPx;
            const rightStubW = pageW - rightStubStart;
            if (rightStubW > 0) {
                ctx.fillRect(rightStubStart, y, rightStubW, guideWidthPx);
            }
        }
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


async function buildCardWithBleed(
    src: string,
    bleedPx: number,
    contentWidthPx: number,
    contentHeightPx: number,
    opts: { isUserUpload: boolean; hasBakedBleed?: boolean },
    darkenNearBlack?: boolean
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

    // Create a canvas for the content + bleed area
    const canvas = new OffscreenCanvas(finalW, finalH);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    // Draw the image centered in the content area (offset by bleedPx)
    // We draw it at (bleedPx - offX, bleedPx - offY) with size (drawW, drawH)
    // This places the "content" part of the image in the "content" part of the canvas
    ctx.drawImage(baseImg, bleedPx - offX, bleedPx - offY, drawW, drawH);
    baseImg.close();

    if (bleedPx > 0 || darkenNearBlack) {
        const imageData = ctx.getImageData(0, 0, finalW, finalH);

        if (bleedPx > 0) {
            applyJFA(imageData);
        }

        if (darkenNearBlack) {
            const blackThreshold = 30;
            blackenAllNearBlackPixels(imageData, blackThreshold);
        }

        ctx.putImageData(imageData, 0, 0);
    }

    return canvas;
}

const canvasCache = new Map<string, OffscreenCanvas>();

self.onmessage = async (event: MessageEvent) => {
    try {
        const { pageCards, pageIndex, settings } = event.data;
        const {
            pageWidth, pageHeight, pageSizeUnit, columns, rows, bleedEdge,
            bleedEdgeWidthMm, cardSpacingMm, cardPositionX, cardPositionY, guideColor, guideWidthPx, DPI,
            imagesById, API_BASE, darkenNearBlack, cutLineStyle
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

        // Determine occupied rows and columns
        const occupiedCols = new Set<number>();
        const occupiedRows = new Set<number>();
        for (let i = 0; i < pageCards.length; i++) {
            occupiedCols.add(i % columns);
            occupiedRows.add(Math.floor(i / columns));
        }

        // Draw full page guides (behind cards)
        drawFullPageGuides(ctx, pageWidthPx, pageHeightPx, startX, startY, columns, rows, contentWidthInPx, contentHeightInPx, cardWidthPx, cardHeightPx, bleedPx, scaledGuideWidth, spacingPx, occupiedCols, occupiedRows, cutLineStyle);

        for (const [idx, card] of pageCards.entries()) {
            const col = idx % columns;
            const row = Math.floor(idx / columns);
            const x = startX + col * (cardWidthPx + spacingPx);
            const y = startY + row * (cardHeightPx + spacingPx);

            let finalCardCanvas: OffscreenCanvas | ImageBitmap;
            const imageInfo = card.imageId ? imagesById.get(card.imageId) : undefined;

            // Select appropriate blob based on darkenNearBlack setting
            const selectedExportBlob = darkenNearBlack ? imageInfo?.exportBlobDarkened : imageInfo?.exportBlob;

            const isCacheValid =
                selectedExportBlob &&
                imageInfo?.exportDpi === DPI &&
                imageInfo?.exportBleedWidth === bleedEdgeWidthMm;

            if (isCacheValid) {
                finalCardCanvas = await createImageBitmap(selectedExportBlob!);
            } else {
                // Check in-memory cache for processed canvas
                const cacheKey = card.imageId;
                if (cacheKey && canvasCache.has(cacheKey)) {
                    finalCardCanvas = canvasCache.get(cacheKey)!;
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
                        finalCardCanvas = await buildCardWithBleed(src, bleedPx, contentWidthInPx, contentHeightInPx, {
                            isUserUpload: !!card.isUserUpload,
                            hasBakedBleed: !!card.hasBakedBleed,
                        }, darkenNearBlack);
                        if (src.startsWith("blob:")) URL.revokeObjectURL(src);
                    }

                    // Cache the result if we have an ID
                    if (cacheKey && finalCardCanvas instanceof OffscreenCanvas) {
                        canvasCache.set(cacheKey, finalCardCanvas);
                    }
                }
            }

            ctx.drawImage(finalCardCanvas, x, y, cardWidthPx, cardHeightPx);
            if (finalCardCanvas instanceof ImageBitmap) {
                finalCardCanvas.close();
            }

            drawCornerGuides(ctx, x, y, contentWidthInPx, contentHeightInPx, bleedPx, guideColor, scaledGuideWidth, DPI);

            imagesProcessed++;
            self.postMessage({ type: 'progress', pageIndex, imagesProcessed });
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

