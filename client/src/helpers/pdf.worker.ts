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


function drawFullPageGuides(ctx: OffscreenCanvasRenderingContext2D, pageW: number, pageH: number, startX: number, startY: number, columns: number, rows: number, contentW: number, contentH: number, cardW: number, cardH: number, bleedPx: number, guideWidthPx: number, spacingPx = 0, occupiedCols?: Set<number>, occupiedRows?: Set<number>, cutLineStyle: 'none' | 'edges' | 'full' = 'full') {
    if (cutLineStyle === 'none' || guideWidthPx <= 0) return;



    ctx.save();
    ctx.fillStyle = "#000000";

    // We need to distinguish between left and right edges to offset them correctly (outward)
    // Left edge of a card: guide should be to the left of the cut line (x - width)
    // Right edge of a card: guide should be to the right of the cut line (x)

    // Re-calculate cuts with direction
    const xCutsMap = new Map<number, 'left' | 'right' | 'both'>();
    for (let c = 0; c < columns; c++) {
        if (occupiedCols && !occupiedCols.has(c)) continue;

        const cellLeft = startX + c * (cardW + spacingPx);
        const leftCut = cellLeft + bleedPx;
        const rightCut = cellLeft + bleedPx + contentW;

        // Left cut -> grow left
        xCutsMap.set(leftCut, xCutsMap.get(leftCut) === 'right' ? 'both' : 'left');
        // Right cut -> grow right
        xCutsMap.set(rightCut, xCutsMap.get(rightCut) === 'left' ? 'both' : 'right');
    }

    // Draw vertical lines
    for (const [x, type] of xCutsMap.entries()) {
        const drawLine = (offsetPx: number) => {
            if (cutLineStyle === 'full') {
                ctx.fillRect(x + offsetPx, 0, guideWidthPx, pageH);
            } else {
                // Edges only
                // Top stub
                if (startY > 0) {
                    ctx.fillRect(x + offsetPx, 0, guideWidthPx, startY);
                }
                // Bottom stub
                const botStubStart = startY + rows * cardH + Math.max(0, rows - 1) * spacingPx;
                const botStubH = pageH - botStubStart;
                if (botStubH > 0) {
                    ctx.fillRect(x + offsetPx, botStubStart, guideWidthPx, botStubH);
                }
            }
        };

        if (type === 'left' || type === 'both') {
            drawLine(-guideWidthPx); // Grow left
        }
        if (type === 'right' || type === 'both') {
            drawLine(0); // Grow right
        }
    }

    // Horizontal cuts
    const yCutsMap = new Map<number, 'top' | 'bottom' | 'both'>();
    for (let r = 0; r < rows; r++) {
        if (occupiedRows && !occupiedRows.has(r)) continue;

        const cellTop = startY + r * (cardH + spacingPx);
        const topCut = cellTop + bleedPx;
        const botCut = cellTop + bleedPx + contentH;

        yCutsMap.set(topCut, yCutsMap.get(topCut) === 'bottom' ? 'both' : 'top');
        yCutsMap.set(botCut, yCutsMap.get(botCut) === 'top' ? 'both' : 'bottom');
    }

    // Draw horizontal lines
    for (const [y, type] of yCutsMap.entries()) {
        const drawLine = (offsetPx: number) => {
            if (cutLineStyle === 'full') {
                ctx.fillRect(0, y + offsetPx, pageW, guideWidthPx);
            } else {
                // Edges only
                // Left stub
                if (startX > 0) {
                    ctx.fillRect(0, y + offsetPx, startX, guideWidthPx);
                }
                // Right stub
                const rightStubStart = startX + columns * cardW + Math.max(0, columns - 1) * spacingPx;
                const rightStubW = pageW - rightStubStart;
                if (rightStubW > 0) {
                    ctx.fillRect(rightStubStart, y + offsetPx, rightStubW, guideWidthPx);
                }
            }
        };

        if (type === 'top' || type === 'both') {
            drawLine(-guideWidthPx); // Grow up
        }
        if (type === 'bottom' || type === 'both') {
            drawLine(0); // Grow down
        }
    }
    ctx.restore();
}



// Corner radius for MTG cards per wiki: 2.5mm
const CARD_CORNER_RADIUS_MM = 2.5;

function drawPerCardGuides(
    ctx: OffscreenCanvasRenderingContext2D,
    x: number,
    y: number,
    contentW: number,
    contentH: number,
    bleedPx: number,
    guideColor: string,
    guideWidthPx: number,
    dpi: number,
    style: 'corners' | 'rounded-corners' | 'solid-rounded-rect' | 'dashed-rounded-rect' | 'solid-squared-rect' | 'dashed-squared-rect' | 'none',
    placement: 'inside' | 'outside' = 'outside'
) {
    if (style === 'none' || guideWidthPx <= 0) return;

    // Round to nearest pixel for sub-pixel accuracy (minimum 1px)
    const roundedWidth = Math.max(1, Math.round(guideWidthPx));


    const gx = x + bleedPx;
    const gy = y + bleedPx;

    ctx.save();

    if (style === 'corners') {
        // Corner marks logic with rounded width
        const guideLenPx = MM_TO_PX(2, dpi);
        ctx.fillStyle = guideColor;

        if (placement === 'outside') {
            // Offset outward by full width so guide is outside the cut line
            // TL - top-left corner
            ctx.fillRect(gx - roundedWidth, gy - roundedWidth, roundedWidth, guideLenPx + roundedWidth);  // vertical
            ctx.fillRect(gx - roundedWidth, gy - roundedWidth, guideLenPx + roundedWidth, roundedWidth);  // horizontal

            // TR - top-right corner
            ctx.fillRect(gx + contentW - guideLenPx, gy - roundedWidth, guideLenPx + roundedWidth, roundedWidth);  // horizontal
            ctx.fillRect(gx + contentW, gy - roundedWidth, roundedWidth, guideLenPx + roundedWidth); // vertical

            // BL - bottom-left corner
            ctx.fillRect(gx - roundedWidth, gy + contentH - guideLenPx, roundedWidth, guideLenPx + roundedWidth);  // vertical
            ctx.fillRect(gx - roundedWidth, gy + contentH, guideLenPx + roundedWidth, roundedWidth); // horizontal

            // BR - bottom-right corner
            ctx.fillRect(gx + contentW - guideLenPx, gy + contentH, guideLenPx + roundedWidth, roundedWidth); // horizontal
            ctx.fillRect(gx + contentW, gy + contentH - guideLenPx, roundedWidth, guideLenPx + roundedWidth); // vertical
        } else {
            // Inside: guides grow inward from the cut line
            // TL - top-left corner
            ctx.fillRect(gx, gy, roundedWidth, guideLenPx);  // vertical
            ctx.fillRect(gx, gy, guideLenPx, roundedWidth);  // horizontal

            // TR - top-right corner
            ctx.fillRect(gx + contentW - guideLenPx, gy, guideLenPx, roundedWidth);  // horizontal
            ctx.fillRect(gx + contentW - roundedWidth, gy, roundedWidth, guideLenPx); // vertical

            // BL - bottom-left corner
            ctx.fillRect(gx, gy + contentH - guideLenPx, roundedWidth, guideLenPx);  // vertical
            ctx.fillRect(gx, gy + contentH - roundedWidth, guideLenPx, roundedWidth); // horizontal

            // BR - bottom-right corner
            ctx.fillRect(gx + contentW - guideLenPx, gy + contentH - roundedWidth, guideLenPx, roundedWidth); // horizontal
            ctx.fillRect(gx + contentW - roundedWidth, gy + contentH - guideLenPx, roundedWidth, guideLenPx); // vertical
        }
    } else if (style === 'rounded-corners') {
        // Rounded corner marks
        const cornerRadiusPx = MM_TO_PX(CARD_CORNER_RADIUS_MM, dpi);
        ctx.strokeStyle = guideColor;
        ctx.lineWidth = roundedWidth;

        const halfWidth = roundedWidth / 2;
        // Both placements: inner edge at card radius (2.5mm)
        // Arc path is at cornerRadius + halfWidth, so inner edge = path - halfWidth = cornerRadius
        const arcRadius = cornerRadiusPx + halfWidth;

        ctx.beginPath();
        if (placement === 'outside') {
            // TL
            ctx.moveTo(gx - halfWidth, gy + cornerRadiusPx);
            ctx.arc(gx + cornerRadiusPx, gy + cornerRadiusPx, arcRadius, Math.PI, 1.5 * Math.PI);

            // TR
            ctx.moveTo(gx + contentW - cornerRadiusPx, gy - halfWidth);
            ctx.arc(gx + contentW - cornerRadiusPx, gy + cornerRadiusPx, arcRadius, 1.5 * Math.PI, 0);

            // BR
            ctx.moveTo(gx + contentW + halfWidth, gy + contentH - cornerRadiusPx);
            ctx.arc(gx + contentW - cornerRadiusPx, gy + contentH - cornerRadiusPx, arcRadius, 0, 0.5 * Math.PI);

            // BL
            ctx.moveTo(gx + cornerRadiusPx, gy + contentH + halfWidth);
            ctx.arc(gx + cornerRadiusPx, gy + contentH - cornerRadiusPx, arcRadius, 0.5 * Math.PI, Math.PI);
        } else {
            // Inside: arcs grow inward
            // TL
            ctx.moveTo(gx + halfWidth, gy + cornerRadiusPx);
            ctx.arc(gx + cornerRadiusPx, gy + cornerRadiusPx, arcRadius, Math.PI, 1.5 * Math.PI);

            // TR
            ctx.moveTo(gx + contentW - cornerRadiusPx, gy + halfWidth);
            ctx.arc(gx + contentW - cornerRadiusPx, gy + cornerRadiusPx, arcRadius, 1.5 * Math.PI, 0);

            // BR
            ctx.moveTo(gx + contentW - halfWidth, gy + contentH - cornerRadiusPx);
            ctx.arc(gx + contentW - cornerRadiusPx, gy + contentH - cornerRadiusPx, arcRadius, 0, 0.5 * Math.PI);

            // BL
            ctx.moveTo(gx + cornerRadiusPx, gy + contentH - halfWidth);
            ctx.arc(gx + cornerRadiusPx, gy + contentH - cornerRadiusPx, arcRadius, 0.5 * Math.PI, Math.PI);
        }

        ctx.stroke();
    } else {
        // Solid or dashed rounded/square rectangle
        const isSquare = style === 'solid-squared-rect' || style === 'dashed-squared-rect';
        const isDashed = style === 'dashed-rounded-rect' || style === 'dashed-squared-rect';

        const cornerRadiusPx = isSquare ? 0 : MM_TO_PX(CARD_CORNER_RADIUS_MM, dpi);
        ctx.strokeStyle = guideColor;
        ctx.lineWidth = roundedWidth;

        if (isDashed) {
            // Scale dash pattern based on DPI
            const dashPx = MM_TO_PX(1, dpi);
            const gapPx = MM_TO_PX(0.5, dpi);
            ctx.setLineDash([dashPx, gapPx]);
        }

        ctx.beginPath();
        const halfWidth = roundedWidth / 2;

        if (placement === 'outside') {
            // Stroke is centered on path. Inner edge at cut line means path is offset outward by halfWidth.
            ctx.roundRect(
                gx - halfWidth,
                gy - halfWidth,
                contentW + roundedWidth,
                contentH + roundedWidth,
                cornerRadiusPx + halfWidth
            );
        } else {
            // Inside: inner edge at card radius (2.5mm), path at radius + halfWidth
            ctx.roundRect(
                gx + halfWidth,
                gy + halfWidth,
                contentW - roundedWidth,
                contentH - roundedWidth,
                cornerRadiusPx + halfWidth  // Path radius so inner edge is at cornerRadiusPx
            );
        }
        ctx.stroke();
    }

    ctx.restore();
}




// Removed unused scaleGuideWidthForDPI function since we now convert mm to px directly

const canvasCache = new Map<string, OffscreenCanvas>();

self.onmessage = async (event: MessageEvent) => {
    try {
        const { pageCards, pageIndex, settings } = event.data;
        const {
            pageWidth, pageHeight, pageSizeUnit, columns, rows, bleedEdge,
            bleedEdgeWidthMm, cardSpacingMm, cardPositionX, cardPositionY, guideColor, guideWidthCssPx, DPI,
            imagesById, API_BASE, darkenNearBlack, cutLineStyle, perCardGuideStyle, guidePlacement
        } = settings as {
            // ... other props
            perCardGuideStyle: 'corners' | 'rounded-corners' | 'solid-rounded-rect' | 'dashed-rounded-rect' | 'solid-squared-rect' | 'dashed-squared-rect' | 'none';
            guidePlacement: 'inside' | 'outside';
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            [key: string]: any;
        };

        const pageWidthPx = pageSizeUnit === "in" ? IN(pageWidth, DPI) : MM_TO_PX(pageWidth, DPI);
        const pageHeightPx = pageSizeUnit === "in" ? IN(pageHeight, DPI) : MM_TO_PX(pageHeight, DPI);
        const contentWidthInPx = MM_TO_PX(63, DPI);
        const contentHeightInPx = MM_TO_PX(88, DPI);
        const bleedPx = bleedEdge ? MM_TO_PX(bleedEdgeWidthMm, DPI) : 0;
        const cardWidthPx = contentWidthInPx + 2 * bleedPx;
        const cardHeightPx = contentHeightInPx + 2 * bleedPx;
        const spacingPx = MM_TO_PX(cardSpacingMm || 0, DPI);
        const gridWidthPx = columns * cardWidthPx + Math.max(0, columns - 1) * spacingPx;

        // Convert guide width from CSS pixels (96 DPI) to target DPI
        const guideWidthPx = guideWidthCssPx <= 0 ? 0 : Math.max(1, Math.round(guideWidthCssPx * (DPI / 96)));
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
        // Determine occupied rows and columns
        const occupiedCols = new Set<number>();
        const occupiedRows = new Set<number>();
        for (let i = 0; i < pageCards.length; i++) {
            occupiedCols.add(i % columns);
            occupiedRows.add(Math.floor(i / columns));
        }

        // Draw full page guides (behind cards)
        drawFullPageGuides(ctx, pageWidthPx, pageHeightPx, startX, startY, columns, rows, contentWidthInPx, contentHeightInPx, cardWidthPx, cardHeightPx, bleedPx, guideWidthPx, spacingPx, occupiedCols, occupiedRows, cutLineStyle);

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

            drawPerCardGuides(ctx, x, y, contentWidthInPx, contentHeightInPx, bleedPx, guideColor, guideWidthPx, DPI, perCardGuideStyle, guidePlacement);

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

