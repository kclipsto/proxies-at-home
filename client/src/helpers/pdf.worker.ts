import {
    IN,
    MM_TO_PX,
    toProxied,
    trimBleedFromBitmap,
} from "./imageProcessing";
import { generateBleedCanvasWebGL } from "./webglImageProcessing";
import { getCardTargetBleed, computeCardLayouts, computeGridDimensions } from "./layout";
import { getEffectiveBleedMode, getEffectiveExistingBleedMm } from "./imageSpecs";
import type { CardOption } from "../../../shared/types";

export { };
declare const self: DedicatedWorkerGlobalScope;

function getLocalBleedImageUrl(originalUrl: string, apiBase: string) {
    return toProxied(originalUrl, apiBase);
}


/**
 * Create a reusable full-page guides canvas with per-card layout support
 */
type LayoutInfo = {
    cardWidthPx: number;
    cardHeightPx: number;
    bleedPx: number;
};

function createFullPageGuidesCanvas(
    pageW: number, pageH: number,
    startX: number, startY: number,
    columns: number,
    cardLayouts: LayoutInfo[],
    colWidths: number[], rowHeights: number[],
    colOffsets: number[], rowOffsets: number[],
    contentWidthPx: number, contentHeightPx: number,
    spacingPx: number, guideWidthPx: number,
    cutLineStyle: 'none' | 'edges' | 'full'
): OffscreenCanvas | null {
    if (cutLineStyle === 'none' || guideWidthPx <= 0 || cardLayouts.length === 0) return null;

    const canvas = new OffscreenCanvas(pageW, pageH);
    const ctx = canvas.getContext('2d')!;

    // Use Sets to collect unique cut positions
    const xCuts = new Set<number>();
    const yCuts = new Set<number>();

    // For each card, calculate its cut positions
    cardLayouts.forEach((layout, idx) => {
        const col = idx % columns;
        const row = Math.floor(idx / columns);

        if (col >= colWidths.length || row >= rowHeights.length) return;

        const slotX = startX + colOffsets[col];
        const slotY = startY + rowOffsets[row];
        const slotWidth = colWidths[col];
        const slotHeight = rowHeights[row];

        // Card is centered within slot
        const cardX = slotX + (slotWidth - layout.cardWidthPx) / 2;
        const cardY = slotY + (slotHeight - layout.cardHeightPx) / 2;

        // Cut positions are at bleed edge (inset from card edge by bleedPx)
        const leftCut = cardX + layout.bleedPx;
        const rightCut = cardX + layout.bleedPx + contentWidthPx;
        const topCut = cardY + layout.bleedPx;
        const bottomCut = cardY + layout.bleedPx + contentHeightPx;

        xCuts.add(leftCut);
        xCuts.add(rightCut);
        yCuts.add(topCut);
        yCuts.add(bottomCut);
    });

    // Calculate grid bounds for edge-style lines
    const gridWidthPx = colWidths.reduce((sum, w) => sum + w, 0) + Math.max(0, colWidths.length - 1) * spacingPx;
    const gridHeightPx = rowHeights.reduce((sum, h) => sum + h, 0) + Math.max(0, rowHeights.length - 1) * spacingPx;

    ctx.fillStyle = "#000000";

    // Draw vertical lines
    for (const x of xCuts) {
        if (cutLineStyle === 'full') {
            ctx.fillRect(x, 0, guideWidthPx, pageH);
        } else {
            // Edges only - stubs at top and bottom
            if (startY > 0) {
                ctx.fillRect(x, 0, guideWidthPx, startY);
            }
            const botStubStart = startY + gridHeightPx;
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
            // Edges only - stubs at left and right
            if (startX > 0) {
                ctx.fillRect(0, y, startX, guideWidthPx);
            }
            const rightStubStart = startX + gridWidthPx;
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

    const w = Math.max(1, Math.round(guideWidthPx));

    const cardW = contentW + 2 * bleedPx;
    const cardH = contentH + 2 * bleedPx;
    const canvas = new OffscreenCanvas(cardW, cardH);
    const ctx = canvas.getContext('2d')!;

    const gx = bleedPx;
    const gy = bleedPx;

    ctx.fillStyle = guideColor;
    ctx.strokeStyle = guideColor;
    ctx.lineWidth = w;

    // Calculate offset based on placement
    // For outside: offset outward by guideWidth (so inner edge touches cut line)
    // For inside: no offset (so outer edge touches cut line)
    // REMOVED CLAMP to prevent outside guides from invading content area when bleed is small
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
            imagesById, API_BASE, darkenNearBlack, cutLineStyle, perCardGuideStyle, guidePlacement,
            // Receive pre-normalized source settings directly (no legacy conversion)
            sourceSettings, withBleedSourceAmount
        } = settings;

        const pageWidthPx = pageSizeUnit === "in" ? IN(pageWidth, DPI) : MM_TO_PX(pageWidth, DPI);
        const pageHeightPx = pageSizeUnit === "in" ? IN(pageHeight, DPI) : MM_TO_PX(pageHeight, DPI);
        const contentWidthInPx = MM_TO_PX(63, DPI);
        const contentHeightInPx = MM_TO_PX(88, DPI);
        const spacingPx = MM_TO_PX(cardSpacingMm || 0, DPI);
        const positionOffsetXPx = MM_TO_PX(cardPositionX || 0, DPI);
        const positionOffsetYPx = MM_TO_PX(cardPositionY || 0, DPI);

        // sourceSettings is now passed directly from the main thread (already normalized)

        const layoutsMm = computeCardLayouts(pageCards, sourceSettings, bleedEdge ? bleedEdgeWidthMm : 0);
        const { colWidthsMm, rowHeightsMm } = computeGridDimensions(layoutsMm, columns, rows, cardSpacingMm);

        // Convert to pixels for rendering
        const layouts = layoutsMm.map(l => ({
            cardWidthPx: MM_TO_PX(l.cardWidthMm, DPI),
            cardHeightPx: MM_TO_PX(l.cardHeightMm, DPI),
            bleedPx: MM_TO_PX(l.bleedMm, DPI)
        }));

        const colWidths = colWidthsMm.map(w => MM_TO_PX(w, DPI));
        const rowHeights = rowHeightsMm.map(h => MM_TO_PX(h, DPI));

        // Compute grid dimensions and starting position
        const gridWidthPx = colWidths.reduce((a, b) => a + b, 0) + Math.max(0, columns - 1) * spacingPx;
        const gridHeightPx = rowHeights.reduce((a, b) => a + b, 0) + Math.max(0, rows - 1) * spacingPx;
        const startX = Math.round((pageWidthPx - gridWidthPx) / 2) + positionOffsetXPx;
        const startY = Math.round((pageHeightPx - gridHeightPx) / 2) + positionOffsetYPx;

        // Precompute column X offsets and row Y offsets
        const colOffsets: number[] = [];
        let cumX = 0;
        for (let c = 0; c < columns; c++) {
            colOffsets.push(cumX);
            cumX += colWidths[c] + spacingPx;
        }
        const rowOffsets: number[] = [];
        let cumY = 0;
        for (let r = 0; r < rows; r++) {
            rowOffsets.push(cumY);
            cumY += rowHeights[r] + spacingPx;
        }


        const canvas = new OffscreenCanvas(pageWidthPx, pageHeightPx);
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, pageWidthPx, pageHeightPx);

        const scaledGuideWidth = scaleGuideWidthForDPI(guideWidthCssPx, 96, DPI);

        // Create per-card guide canvas ONCE (guides are same size for all cards since they mark the fixed content boundary)
        // The bleed dimension affects where we DRAW the guide, not the guide shape itself
        const bleedPxForGuide = MM_TO_PX(bleedEdgeWidthMm, DPI);
        const perCardGuideCanvas = createGuideCanvas(
            contentWidthInPx, contentHeightInPx, bleedPxForGuide,
            guideColor, scaledGuideWidth, DPI, perCardGuideStyle ?? 'corners',
            guidePlacement ?? 'outside'
        );

        // Create and draw full page guides (behind cards)
        // Uses per-card layouts to compute cut positions for mixed bleed sizes
        const fullPageGuidesCanvas = createFullPageGuidesCanvas(
            pageWidthPx, pageHeightPx, startX, startY, columns,
            layouts, colWidths, rowHeights, colOffsets, rowOffsets,
            contentWidthInPx, contentHeightInPx, spacingPx, scaledGuideWidth, cutLineStyle
        );
        if (fullPageGuidesCanvas) {
            ctx.drawImage(fullPageGuidesCanvas, 0, 0);
        }

        // Type for prepared card data
        type PreparedCard = {
            canvas: OffscreenCanvas | ImageBitmap;
            x: number;
            y: number;
            cardWidthPx: number;
            cardHeightPx: number;
            centerOffsetX: number;
            centerOffsetY: number;
            imageCardWidthPx: number;
            imageCardHeightPx: number;
            bleedPx: number;
        };

        // PHASE 1: Prepare all cards in PARALLEL
        const preparedCards = await Promise.all(pageCards.map(async (card: CardOption, idx: number): Promise<PreparedCard> => {
            const col = idx % columns;
            const row = Math.floor(idx / columns);
            const cardLayout = layouts[idx];
            const slotWidth = colWidths[col];
            const slotHeight = rowHeights[row];

            // Card position at top-left of slot, centered within if smaller
            const slotX = startX + colOffsets[col];
            const slotY = startY + rowOffsets[row];
            const centerOffsetInSlotX = (slotWidth - cardLayout.cardWidthPx) / 2;
            const centerOffsetInSlotY = (slotHeight - cardLayout.cardHeightPx) / 2;
            const x = slotX + centerOffsetInSlotX;
            const y = slotY + centerOffsetInSlotY;

            let finalCardCanvas: OffscreenCanvas | ImageBitmap;
            const imageInfo = card.imageId ? imagesById.get(card.imageId) : undefined;

            // Select appropriate blob based on darkenNearBlack setting
            const selectedExportBlob = darkenNearBlack ? imageInfo?.exportBlobDarkened : imageInfo?.exportBlob;

            // Compute bleed mode and amounts
            const effectiveMode = getEffectiveBleedMode(card, sourceSettings);
            const existingBleedMm = getEffectiveExistingBleedMm(card, { withBleedSourceAmount }) ?? 0;
            const targetBleedMm = bleedEdge ? getCardTargetBleed(card, sourceSettings, bleedEdgeWidthMm) : 0;

            // Use the image's actual bleed width if available
            const imageBleedWidthMm = imageInfo?.exportBleedWidth ?? targetBleedMm;
            const imageBleedPx = MM_TO_PX(imageBleedWidthMm, DPI);

            // Cache is valid if we have the blob at the right DPI
            const isCacheValid = selectedExportBlob && imageInfo?.exportDpi === DPI;

            // Calculate centering offset if image has different bleed than card's target
            const slotBleedPx = cardLayout.bleedPx;
            const bleedDifferencePx = slotBleedPx - imageBleedPx;
            const centerOffsetX = bleedDifferencePx;
            const centerOffsetY = bleedDifferencePx;
            const imageCardWidthPx = contentWidthInPx + 2 * imageBleedPx;
            const imageCardHeightPx = contentHeightInPx + 2 * imageBleedPx;

            if (isCacheValid) {
                // Fast path: use pre-processed blob directly
                finalCardCanvas = await createImageBitmap(selectedExportBlob!);
            } else {
                // Check cache
                const cacheKey = card.imageId ? `${card.imageId}-${targetBleedMm.toFixed(2)}-${darkenNearBlack}` : null;
                if (cacheKey && canvasCache.has(cacheKey)) {
                    finalCardCanvas = canvasCache.get(cacheKey)!;
                } else {
                    let src = imageInfo?.originalBlob ? URL.createObjectURL(imageInfo.originalBlob) : imageInfo?.sourceUrl;
                    let cleanupTimeout: ReturnType<typeof setTimeout> | null = null;

                    if (src?.startsWith("blob:")) {
                        cleanupTimeout = setTimeout(() => {
                            console.warn("Auto-revoking blob URL (safety net):", src);
                            URL.revokeObjectURL(src!);
                        }, 5 * 60 * 1000);
                    }

                    try {
                        if (!src) {
                            // Placeholder for missing images
                            const cardBleedPx = cardLayout.bleedPx;
                            const cardWidthWithBleed = contentWidthInPx + 2 * cardBleedPx;
                            const cardHeightWithBleed = contentHeightInPx + 2 * cardBleedPx;
                            const placeholderCanvas = new OffscreenCanvas(cardWidthWithBleed, cardHeightWithBleed);
                            const cardCtx = placeholderCanvas.getContext('2d')!;
                            cardCtx.fillStyle = 'white';
                            cardCtx.fillRect(0, 0, cardWidthWithBleed, cardHeightWithBleed);
                            cardCtx.strokeStyle = 'red';
                            cardCtx.lineWidth = 5;
                            cardCtx.strokeRect(cardBleedPx, cardBleedPx, contentWidthInPx, contentHeightInPx);
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

                            const needsBleedChange = Math.abs(existingBleedMm - targetBleedMm) > 0.01;

                            if (effectiveMode === 'none') {
                                if (card.hasBuiltInBleed && existingBleedMm > 0) {
                                    const trimmed = await trimBleedFromBitmap(img);
                                    if (trimmed !== img) { img.close(); img = trimmed; }
                                }
                                finalCardCanvas = await generateBleedCanvasWebGL(img, 0, {
                                    unit: 'mm', dpi: DPI, darkenNearBlack,
                                });
                            } else if (effectiveMode === 'existing' || !needsBleedChange) {
                                finalCardCanvas = await generateBleedCanvasWebGL(img, existingBleedMm, {
                                    unit: 'mm', dpi: DPI, darkenNearBlack,
                                });
                            } else {
                                if (card.hasBuiltInBleed && existingBleedMm > 0) {
                                    const trimmed = await trimBleedFromBitmap(img);
                                    if (trimmed !== img) { img.close(); img = trimmed; }
                                }
                                finalCardCanvas = await generateBleedCanvasWebGL(img, targetBleedMm, {
                                    unit: 'mm', dpi: DPI, darkenNearBlack,
                                });
                            }

                            img.close();
                        }

                        // Cache the result
                        if (cacheKey && finalCardCanvas instanceof OffscreenCanvas) {
                            canvasCache.set(cacheKey, finalCardCanvas);
                        }
                    } finally {
                        if (cleanupTimeout) clearTimeout(cleanupTimeout);
                        if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
                    }
                }
            }

            return {
                canvas: finalCardCanvas,
                x,
                y,
                cardWidthPx: cardLayout.cardWidthPx,
                cardHeightPx: cardLayout.cardHeightPx,
                centerOffsetX,
                centerOffsetY,
                imageCardWidthPx,
                imageCardHeightPx,
                bleedPx: cardLayout.bleedPx,
            };
        }));

        // PHASE 2: Draw all cards SEQUENTIALLY (canvas context not thread-safe)
        let imagesProcessed = 0;
        for (const prepared of preparedCards) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(prepared.x, prepared.y, prepared.cardWidthPx, prepared.cardHeightPx);
            ctx.clip();
            ctx.drawImage(prepared.canvas, prepared.x + prepared.centerOffsetX, prepared.y + prepared.centerOffsetY, prepared.imageCardWidthPx, prepared.imageCardHeightPx);
            ctx.restore();

            if (prepared.canvas instanceof ImageBitmap) {
                prepared.canvas.close();
            }

            // Stamp per-card guide overlay
            if (perCardGuideCanvas) {
                const guideOffsetX = prepared.bleedPx - bleedPxForGuide;
                const guideOffsetY = prepared.bleedPx - bleedPxForGuide;
                ctx.drawImage(perCardGuideCanvas, prepared.x + guideOffsetX, prepared.y + guideOffsetY);
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

