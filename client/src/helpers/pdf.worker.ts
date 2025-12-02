import {
    IN,
    MM_TO_PX,
    toProxied,
    trimBleedFromBitmap,
} from "./imageProcessing";
import { generateBleedCanvasWebGL } from "./webglImageProcessing";

export { };
declare const self: DedicatedWorkerGlobalScope;

function getLocalBleedImageUrl(originalUrl: string, apiBase: string) {
    return toProxied(originalUrl, apiBase);
}


/**
 * Create a reusable full-page guides canvas
 */
function createFullPageGuidesCanvas(
    pageW: number, pageH: number, startX: number, startY: number,
    columns: number, rows: number, contentW: number, contentH: number,
    cardW: number, cardH: number, bleedPx: number, guideWidthPx: number,
    spacingPx: number, occupiedCols: Set<number>, occupiedRows: Set<number>,
    cutLineStyle: 'none' | 'edges' | 'full'
): OffscreenCanvas | null {
    if (cutLineStyle === 'none' || guideWidthPx <= 0) return null;

    const canvas = new OffscreenCanvas(pageW, pageH);
    const ctx = canvas.getContext('2d')!;

    const xCuts: number[] = [];
    for (let c = 0; c < columns; c++) {
        if (occupiedCols.has(c)) {
            const cellLeft = startX + c * (cardW + spacingPx);
            xCuts.push(cellLeft + bleedPx);
            xCuts.push(cellLeft + bleedPx + contentW);
        }
    }
    const yCuts: number[] = [];
    for (let r = 0; r < rows; r++) {
        if (occupiedRows.has(r)) {
            const cellTop = startY + r * (cardH + spacingPx);
            yCuts.push(cellTop + bleedPx);
            yCuts.push(cellTop + bleedPx + contentH);
        }
    }

    ctx.fillStyle = "#000000";

    // Draw vertical lines
    for (const x of xCuts) {
        if (cutLineStyle === 'full') {
            ctx.fillRect(x, 0, guideWidthPx, pageH);
        } else {
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

    return canvas;
}

function scaleGuideWidthForDPI(screenPx: number, screenPPI = 96, targetDPI: number) {
    return Math.round((screenPx / screenPPI) * targetDPI);
}

// MTG card corner radius: 2.5mm
const CARD_CORNER_RADIUS_MM = 2.5;

type GuideStyle = 'corners' | 'rounded-corners' | 'solid-rounded-rect' | 'dashed-rounded-rect' | 'solid-squared-rect' | 'dashed-squared-rect' | 'none';

/**
 * Create a reusable guide overlay canvas that can be stamped onto each card
 */
function createGuideCanvas(
    contentW: number,
    contentH: number,
    bleedPx: number,
    guideColor: string,
    guideWidthPx: number,
    dpi: number,
    style: GuideStyle = 'corners',
    placement: 'inside' | 'outside' = 'outside'
): OffscreenCanvas | null {
    if (style === 'none' || guideWidthPx <= 0) return null;

    const cardW = contentW + 2 * bleedPx;
    const cardH = contentH + 2 * bleedPx;
    const canvas = new OffscreenCanvas(cardW, cardH);
    const ctx = canvas.getContext('2d')!;

    const gx = bleedPx;
    const gy = bleedPx;
    const w = Math.max(1, Math.round(guideWidthPx));

    ctx.fillStyle = guideColor;
    ctx.strokeStyle = guideColor;
    ctx.lineWidth = w;

    // Calculate offset based on placement
    // For outside: offset outward by guideWidth (so inner edge touches cut line)
    // For inside: no offset (so outer edge touches cut line)
    // Note: This logic depends on the shape type
    const offset = placement === 'outside' ? -w : 0;

    if (style === 'corners') {
        const len = MM_TO_PX(2, dpi);
        // TL
        ctx.fillRect(gx + offset, gy + offset, w, len);
        ctx.fillRect(gx + offset, gy + offset, len, w);
        // TR
        ctx.fillRect(gx + contentW - len - offset, gy + offset, len, w);
        ctx.fillRect(gx + contentW - w - offset, gy + offset, w, len);
        // BL
        ctx.fillRect(gx + offset, gy + contentH - len - offset, w, len);
        ctx.fillRect(gx + offset, gy + contentH - w - offset, len, w);
        // BR
        ctx.fillRect(gx + contentW - len - offset, gy + contentH - w - offset, len, w);
        ctx.fillRect(gx + contentW - w - offset, gy + contentH - len - offset, w, len);
    } else if (style === 'rounded-corners') {
        const r = MM_TO_PX(CARD_CORNER_RADIUS_MM, dpi);
        // For rounded corners, the offset logic is slightly different because we draw arcs
        // The arc path is at radius + halfWidth
        // If outside: we want inner edge at radius, so path is at radius + halfWidth (offset = 0 relative to corner center)
        // If inside: we want outer edge at radius, so path is at radius - halfWidth??

        // For rounded corners:
        // Arc center C = gx + r + posOffset
        // Arc path radius R = r + w/2
        // Leftmost point of arc path = C - R = gx + r + posOffset - (r + w/2) = gx + posOffset - w/2

        // We want:
        // Outside: path at gx - w/2 (stroke gx-w to gx) => posOffset = 0
        // Inside: path at gx + w/2 (stroke gx to gx+w) => posOffset = w

        const posOffset = placement === 'outside' ? 0 : w;

        ctx.beginPath();
        // TL
        ctx.arc(gx + r + posOffset, gy + r + posOffset, r + w / 2, Math.PI, 1.5 * Math.PI);
        // TR
        ctx.moveTo(gx + contentW - r - posOffset, gy + posOffset);
        ctx.arc(gx + contentW - r - posOffset, gy + r + posOffset, r + w / 2, 1.5 * Math.PI, 2 * Math.PI);
        // BR
        ctx.moveTo(gx + contentW - posOffset, gy + contentH - r - posOffset);
        ctx.arc(gx + contentW - r - posOffset, gy + contentH - r - posOffset, r + w / 2, 0, 0.5 * Math.PI);
        // BL
        ctx.moveTo(gx + r + posOffset, gy + contentH - posOffset);
        ctx.arc(gx + r + posOffset, gy + contentH - r - posOffset, r + w / 2, 0.5 * Math.PI, Math.PI);
        ctx.stroke();
    } else {
        const isSquare = style.includes('squared');
        const isDashed = style.includes('dashed');
        // CSS border-radius is outer edge; canvas stroke is centered on path
        // To match CSS: path radius = cornerRadius + halfWidth (outer = path + w/2)
        const halfWidth = w / 2;
        const cornerRadius = isSquare ? 0 : MM_TO_PX(CARD_CORNER_RADIUS_MM, dpi);

        // For rects:
        // Outside: box is expanded by w on all sides
        // Inside: box is exactly content size
        const rectX = gx + (placement === 'outside' ? -w : 0);
        const rectY = gy + (placement === 'outside' ? -w : 0);
        const rectW = contentW + (placement === 'outside' ? 2 * w : 0);
        const rectH = contentH + (placement === 'outside' ? 2 * w : 0);

        // Radius adjustment:
        // Match SortableCard logic: both inside and outside use the same radius formula
        // Outer edge = cornerRadius + w
        // Path radius = cornerRadius + w/2
        const pathRadius = cornerRadius + halfWidth;

        if (isDashed) {
            const dashLen = MM_TO_PX(2, dpi);
            ctx.setLineDash([dashLen, dashLen]);
        }

        ctx.beginPath();
        ctx.roundRect(rectX + halfWidth, rectY + halfWidth, rectW - w, rectH - w, pathRadius);
        ctx.stroke();
    }

    return canvas;
}




const canvasCache = new Map<string, OffscreenCanvas>();

self.onmessage = async (event: MessageEvent) => {
    try {
        const { pageCards, pageIndex, settings } = event.data;
        const {
            pageWidth, pageHeight, pageSizeUnit, columns, rows, bleedEdge,
            bleedEdgeWidthMm, cardSpacingMm, cardPositionX, cardPositionY, guideColor, guideWidthCssPx, DPI,
            imagesById, API_BASE, darkenNearBlack, cutLineStyle, perCardGuideStyle, guidePlacement
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
        const scaledGuideWidth = scaleGuideWidthForDPI(guideWidthCssPx, 96, DPI);

        // Create reusable guide overlay canvas once
        const guideCanvas = createGuideCanvas(
            contentWidthInPx, contentHeightInPx, bleedPx,
            guideColor, scaledGuideWidth, DPI, perCardGuideStyle ?? 'corners',
            guidePlacement ?? 'outside'
        );

        // Determine occupied rows and columns
        const occupiedCols = new Set<number>();
        const occupiedRows = new Set<number>();
        for (let i = 0; i < pageCards.length; i++) {
            occupiedCols.add(i % columns);
            occupiedRows.add(Math.floor(i / columns));
        }

        // Create and draw full page guides (behind cards)
        const fullPageGuidesCanvas = createFullPageGuidesCanvas(
            pageWidthPx, pageHeightPx, startX, startY, columns, rows,
            contentWidthInPx, contentHeightInPx, cardWidthPx, cardHeightPx,
            bleedPx, scaledGuideWidth, spacingPx, occupiedCols, occupiedRows, cutLineStyle
        );
        if (fullPageGuidesCanvas) {
            ctx.drawImage(fullPageGuidesCanvas, 0, 0);
        }

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
                    let cleanupTimeout: ReturnType<typeof setTimeout> | null = null;

                    if (src?.startsWith("blob:")) {
                        // Safety net: auto-revoke after 5 minutes if something goes wrong
                        cleanupTimeout = setTimeout(() => {
                            console.warn("Auto-revoking blob URL (safety net):", src);
                            URL.revokeObjectURL(src!);
                        }, 5 * 60 * 1000);
                    }

                    try {
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
                            // Fetch image
                            if (!card.isUserUpload) {
                                src = getLocalBleedImageUrl(src, API_BASE);
                            }

                            const response = await fetch(src);
                            const blob = await response.blob();
                            let img = await createImageBitmap(blob);

                            // Trim bleed if needed
                            if (card.isUserUpload && card.hasBakedBleed) {
                                const trimmed = await trimBleedFromBitmap(img);
                                if (trimmed !== img) {
                                    img.close();
                                    img = trimmed;
                                }
                            }

                            // Generate bleed using WebGL
                            finalCardCanvas = await generateBleedCanvasWebGL(img, bleedEdgeWidthMm, {
                                unit: 'mm',
                                dpi: DPI,
                                darkenNearBlack,
                            });

                            img.close();
                        }

                        // Cache the result if we have an ID
                        if (cacheKey && finalCardCanvas instanceof OffscreenCanvas) {
                            canvasCache.set(cacheKey, finalCardCanvas);
                        }
                    } finally {
                        if (cleanupTimeout) clearTimeout(cleanupTimeout);
                        if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
                    }
                }
            }

            ctx.drawImage(finalCardCanvas, x, y, cardWidthPx, cardHeightPx);
            if (finalCardCanvas instanceof ImageBitmap) {
                finalCardCanvas.close();
            }

            // Stamp the pre-rendered guide overlay
            if (guideCanvas) {
                ctx.drawImage(guideCanvas, x, y);
            }

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

