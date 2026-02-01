import {
    IN,
    MM_TO_PX,
    toProxied,
    trimBleedFromBitmap,
} from "./imageProcessing";
import { generateBleedCanvasWebGL, renderBleedCanvasDirect } from "./webglImageProcessing";
import { getCardTargetBleed, computeCardLayouts, computeGridDimensions } from "./layout";
import { getEffectiveBleedMode, getEffectiveExistingBleedMm } from "./imageSpecs";
import { hasAdvancedOverrides, overridesToRenderParams, renderCardWithOverridesWorker } from "./cardCanvasWorker";
import { generatePerCardGuide, executePathCommands, type GuideStyle } from "./cutGuideUtils";
import { db, type EffectCacheEntry } from "../db";
import type { CardOption, CardOverrides } from "../../../shared/types";
import { debugLog } from "./debug";

export { };
declare const self: DedicatedWorkerGlobalScope;

// Limit concurrent bitmap creation to avoid memory exhaustion (especially in Firefox)
const MAX_CONCURRENT_CARDS = 4;

/**
 * Process items with limited concurrency to avoid memory exhaustion.
 * Processes at most `limit` items at a time.
 */
async function processWithConcurrency<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    limit: number
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let currentIndex = 0;

    async function processNext(): Promise<void> {
        while (currentIndex < items.length) {
            const idx = currentIndex++;
            results[idx] = await processor(items[idx], idx);
        }
    }

    // Start `limit` workers
    const workers = Array.from({ length: Math.min(limit, items.length) }, () => processNext());
    await Promise.all(workers);

    return results;
}

function getLocalBleedImageUrl(originalUrl: string, apiBase: string) {
    return toProxied(originalUrl, apiBase);
}

// --- Effect cache helpers (same logic as effectCache.ts) ---

function hashString(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function computeEffectCacheKey(imageId: string, overrides: CardOverrides, dpi: number): string {
    const sortedOverrides = Object.keys(overrides || {})
        .sort()
        .reduce((acc, k) => {
            const value = overrides[k as keyof CardOverrides];
            if (value !== undefined) {
                acc[k] = value;
            }
            return acc;
        }, {} as Record<string, unknown>);
    const overridesHash = hashString(JSON.stringify(sortedOverrides));
    return `${imageId}:${dpi}:${overridesHash}`;
}

async function cacheEffectBlob(imageId: string, overrides: CardOverrides, blob: Blob, dpi: number): Promise<void> {
    const key = computeEffectCacheKey(imageId, overrides, dpi);
    const entry: EffectCacheEntry = {
        key,
        blob,
        size: blob.size,
        cachedAt: Date.now(),
    };
    await db.effectCache.put(entry);
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
    cutLineStyle: 'none' | 'edges' | 'full',
    rightAlignRows: boolean = false,
    totalCards: number = 0,
    blankIndices: Set<number> = new Set()
): OffscreenCanvas | null {
    if (cutLineStyle === 'none' || guideWidthPx <= 0 || cardLayouts.length === 0) return null;

    const canvas = new OffscreenCanvas(pageW, pageH);
    const ctx = canvas.getContext('2d')!;

    // Use Sets to collect unique cut positions
    const xCuts = new Set<number>();
    const yCuts = new Set<number>();

    // For each card, calculate its cut positions (skip blank cards)
    cardLayouts.forEach((layout, idx) => {
        // Skip blank cards - they don't contribute to cut guides
        if (blankIndices.has(idx)) return;

        const col = idx % columns;
        const row = Math.floor(idx / columns);

        if (col >= colWidths.length || row >= rowHeights.length) return;

        // Calculate right-align offset for incomplete rows (same logic as card rendering)
        let rightAlignOffsetPx = 0;
        if (rightAlignRows && totalCards > 0) {
            const cardsInThisRow = Math.min(columns, totalCards - row * columns);
            if (cardsInThisRow < columns) {
                const missingColumns = columns - cardsInThisRow;
                for (let c = 0; c < missingColumns; c++) {
                    rightAlignOffsetPx += colWidths[c] + spacingPx;
                }
            }
        }

        const slotX = startX + colOffsets[col] + rightAlignOffsetPx;
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

// Silhouette registration mark constants (based on Silhouette Studio standard marks)
const REG_MARK_OFFSET_MM = 10.0076;  // 0.394" from page edge (Silhouette spec)
const REG_MARK_SQUARE_SIZE_MM = 5;  // Size of the top-left square (3-point)
const REG_MARK_ARM_LENGTH_MM = 8.382;   // 0.33" length of L-shape arms (Silhouette spec)
const REG_MARK_LINE_WIDTH_MM = 0.9906; // 0.039" thickness of L-shape lines

/**
 * Draw Silhouette registration marks on a canvas
 * 3-point:
 *   - Top-left: solid black square (origin mark)
 *   - Top-right: L-shape (vertical down, horizontal left)
 *   - Bottom-left: L-shape (vertical up, horizontal right)
 * 4-point: L-shapes at all four corners (no square)
 */
function drawSilhouetteRegistrationMarks(
    ctx: OffscreenCanvasRenderingContext2D,
    pageWidthPx: number,
    pageHeightPx: number,
    dpi: number,
    markCount: '3' | '4',
    portrait: boolean = false
): void {
    const offsetPx = MM_TO_PX(REG_MARK_OFFSET_MM, dpi);
    const squareSizePx = MM_TO_PX(REG_MARK_SQUARE_SIZE_MM, dpi);
    const armLengthPx = MM_TO_PX(REG_MARK_ARM_LENGTH_MM, dpi);
    const lineWidthPx = MM_TO_PX(REG_MARK_LINE_WIDTH_MM, dpi);

    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = lineWidthPx;
    ctx.lineCap = 'square';

    // Position coordinates
    const topLeftX = offsetPx;
    const topLeftY = offsetPx;
    const topRightX = pageWidthPx - offsetPx;
    const topRightY = offsetPx;
    const bottomLeftX = offsetPx;
    const bottomLeftY = pageHeightPx - offsetPx;
    const bottomRightX = pageWidthPx - offsetPx;
    const bottomRightY = pageHeightPx - offsetPx;

    // Helper to draw L-shape
    const drawLShape = (x: number, y: number, vDir: 'up' | 'down', hDir: 'left' | 'right') => {
        const vEnd = vDir === 'down' ? y + armLengthPx : y - armLengthPx;
        const hEnd = hDir === 'right' ? x + armLengthPx : x - armLengthPx;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, vEnd);
        ctx.moveTo(x, y);
        ctx.lineTo(hEnd, y);
        ctx.stroke();
    };

    if (portrait) {
        // Portrait mode: marks rotated for paper loaded in portrait orientation
        // Square (3-point) at bottom-left, L's at top-left, bottom-right, (and top-right for 4-point)
        if (markCount === '3') {
            // 3-point: solid black square at bottom-left
            ctx.fillRect(bottomLeftX, bottomLeftY - squareSizePx, squareSizePx, squareSizePx);
        } else {
            // 4-point: L-shape at bottom-left (up + right)
            drawLShape(bottomLeftX, bottomLeftY, 'up', 'right');
        }

        // Top-left: L-shape (down + right)
        drawLShape(topLeftX, topLeftY, 'down', 'right');

        // Bottom-right: L-shape (up + left)
        drawLShape(bottomRightX, bottomRightY, 'up', 'left');

        // Top-right: L-shape (only for 4-point, down + left)
        if (markCount === '4') {
            drawLShape(topRightX, topRightY, 'down', 'left');
        }
    } else {
        // Landscape mode: standard mark positions
        // Square (3-point) at top-left, L's at top-right, bottom-left, (and bottom-right for 4-point)
        if (markCount === '3') {
            // 3-point: solid black square at top-left
            ctx.fillRect(topLeftX, topLeftY, squareSizePx, squareSizePx);
        } else {
            // 4-point: L-shape at top-left (down + right)
            drawLShape(topLeftX, topLeftY, 'down', 'right');
        }

        // Top-right: L-shape (down + left)
        drawLShape(topRightX, topRightY, 'down', 'left');

        // Bottom-left: L-shape (up + right)
        drawLShape(bottomLeftX, bottomLeftY, 'up', 'right');

        // Bottom-right: L-shape (only for 4-point, up + left)
        if (markCount === '4') {
            drawLShape(bottomRightX, bottomRightY, 'up', 'left');
        }
    }
}

/**
 * Create a reusable guide overlay canvas that can be stamped onto each card
 * Uses shared cut guide utility for consistent rendering with PixiJS canvas
 */
function createGuideCanvas(
    contentW: number,
    contentH: number,
    bleedPx: number,
    guideColor: string,
    guideWidthPx: number,
    dpi: number,
    style: GuideStyle = 'corners',
    placement: 'inside' | 'outside' | 'center' = 'outside',
    cutGuideLengthMm: number = 6.25
): OffscreenCanvas | null {
    if (style === 'none' || guideWidthPx <= 0) return null;

    const w = Math.max(0.1, guideWidthPx);
    const radiusPx = MM_TO_PX(CARD_CORNER_RADIUS_MM, dpi);
    // Use configured guide length
    const targetLegExtendPx = MM_TO_PX(cutGuideLengthMm, dpi);

    const cardW = contentW + 2 * bleedPx;
    const cardH = contentH + 2 * bleedPx;
    const canvas = new OffscreenCanvas(cardW, cardH);
    const ctx = canvas.getContext('2d')!;

    ctx.strokeStyle = guideColor;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';

    // Generate path commands using shared utility
    const commands = generatePerCardGuide(contentW, contentH, radiusPx, w, style, placement, targetLegExtendPx);

    // If we got commands, draw them
    if (commands.length > 0) {
        ctx.save();
        ctx.translate(bleedPx, bleedPx); // Offset by bleed
        ctx.beginPath();

        // Execute path commands
        executePathCommands(ctx, commands);

        ctx.stroke();
        ctx.restore();
    } else {
        // Fallback for solid rect styles (not using path commands)
        const isSquare = style.includes('squared');
        const halfWidth = w / 2;
        const cornerRadius = isSquare ? 0 : radiusPx;

        const gx = bleedPx;
        const gy = bleedPx;
        const rectX = gx + (placement === 'outside' ? -w : 0);
        const rectY = gy + (placement === 'outside' ? -w : 0);
        const rectW = contentW + (placement === 'outside' ? 2 * w : 0);
        const rectH = contentH + (placement === 'outside' ? 2 * w : 0);
        const pathRadius = cornerRadius + halfWidth;

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
            imagesById, API_BASE, darkenMode, cutLineStyle, perCardGuideStyle, guidePlacement,
            cutGuideLengthMm,
            // Silhouette registration marks
            registrationMarks,
            registrationMarksPortrait,
            // Darken settings (Global)
            darkenThreshold,
            darkenContrast,
            darkenEdgeWidth,
            darkenAmount,
            darkenBrightness,
            darkenAutoDetect,
            // Receive pre-normalized source settings directly (no legacy conversion)
            sourceSettings, withBleedSourceAmount,
            // Right-align incomplete rows (for backs export)
            rightAlignRows,
            // Pre-rendered effect cache (cardUuid -> Blob)
            effectCacheById
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
            guidePlacement ?? 'outside', cutGuideLengthMm ?? 6.25
        );

        // Create and draw full page guides (behind cards)
        // Uses per-card layouts to compute cut positions for mixed bleed sizes
        // Skip blank cards (they don't contribute to cut guides)
        const blankIndices = new Set<number>();
        pageCards.forEach((card: CardOption, idx: number) => {
            if (card.imageId === 'cardback_builtin_blank') {
                blankIndices.add(idx);
            }
        });
        const fullPageGuidesCanvas = createFullPageGuidesCanvas(
            pageWidthPx, pageHeightPx, startX, startY, columns,
            layouts, colWidths, rowHeights, colOffsets, rowOffsets,
            contentWidthInPx, contentHeightInPx, spacingPx, scaledGuideWidth, cutLineStyle,
            rightAlignRows, pageCards.length, blankIndices
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
            isBlank: boolean;  // True for cardback_builtin_blank cards (no guides)
        };

        // PHASE 1: Prepare cards with LIMITED CONCURRENCY to avoid memory exhaustion
        debugLog(`[PDF Worker] Processing ${pageCards.length} cards with concurrency limit ${MAX_CONCURRENT_CARDS}`);
        const preparedCards = await processWithConcurrency(pageCards, async (card: CardOption, idx: number): Promise<PreparedCard> => {
            const col = idx % columns;
            const row = Math.floor(idx / columns);
            const cardLayout = layouts[idx];
            const slotWidth = colWidths[col];
            const slotHeight = rowHeights[row];

            // Calculate right-align offset for incomplete rows
            // For incomplete final row, shift cards to the right by (columns - cardsInRow) slots
            let rightAlignOffsetPx = 0;
            if (rightAlignRows) {
                const cardsInThisRow = Math.min(columns, pageCards.length - row * columns);
                if (cardsInThisRow < columns) {
                    const missingColumns = columns - cardsInThisRow;
                    // Calculate offset: sum of missing column widths + spacing
                    for (let c = 0; c < missingColumns; c++) {
                        rightAlignOffsetPx += colWidths[c] + spacingPx;
                    }
                }
            }

            // Card position at top-left of slot, centered within if smaller
            const slotX = startX + colOffsets[col] + rightAlignOffsetPx;
            const slotY = startY + rowOffsets[row];
            const centerOffsetInSlotX = (slotWidth - cardLayout.cardWidthPx) / 2;
            const centerOffsetInSlotY = (slotHeight - cardLayout.cardHeightPx) / 2;
            const x = slotX + centerOffsetInSlotX;
            const y = slotY + centerOffsetInSlotY;

            let finalCardCanvas: OffscreenCanvas | ImageBitmap;
            const imageInfo = card.imageId ? imagesById.get(card.imageId) : undefined;

            // Determine effective mode and settings
            const useGlobalSettings = card.overrides?.darkenUseGlobalSettings ?? true;
            const cardDarkenMode = card.overrides?.darkenMode;
            const effectiveDarkenMode = cardDarkenMode && cardDarkenMode !== 'none'
                ? cardDarkenMode
                : (darkenMode ?? 'none');

            // Resolve darken parameters with fallback to global settings
            const resolveParam = (cardVal: number | undefined, globalVal: number) =>
                (card.overrides && !useGlobalSettings) ? (cardVal ?? globalVal) : globalVal;

            const r_darkenAutoDetect = card.overrides && !useGlobalSettings
                ? (card.overrides.darkenAutoDetect ?? darkenAutoDetect ?? true)
                : (darkenAutoDetect ?? true);

            // Force contrast/brightness values for Auto Detect modes
            const isAutoContrast = r_darkenAutoDetect && (effectiveDarkenMode === 'contrast-edges' || effectiveDarkenMode === 'contrast-full');

            const darkenOpts = {
                darkenThreshold: resolveParam(card.overrides?.darkenThreshold, darkenThreshold ?? 30),
                darkenContrast: isAutoContrast ? 2.0 : resolveParam(card.overrides?.darkenContrast, darkenContrast ?? 2.0),
                darkenEdgeWidth: resolveParam(card.overrides?.darkenEdgeWidth, darkenEdgeWidth ?? 0.1),
                darkenAmount: resolveParam(card.overrides?.darkenAmount, darkenAmount ?? 1.0),
                darkenBrightness: isAutoContrast ? -50 : resolveParam(card.overrides?.darkenBrightness, darkenBrightness ?? -50),
                darkenAutoDetect: r_darkenAutoDetect
            };

            let selectedExportBlob: Blob | undefined;
            if (effectiveDarkenMode === 'none') {
                selectedExportBlob = imageInfo?.exportBlob;
            } else {
                // Force regeneration for any darken mode to ensure slider accuracy
                selectedExportBlob = undefined;
            }

            // Compute bleed mode and amounts
            const effectiveMode = getEffectiveBleedMode(card, sourceSettings);
            const existingBleedMm = getEffectiveExistingBleedMm(card, { withBleedSourceAmount }) ?? 0;
            const targetBleedMm = bleedEdge ? getCardTargetBleed(card, sourceSettings, bleedEdgeWidthMm) : 0;

            // Use the image's actual bleed width if available, prioritizing built-in/existing bleed
            // to ensure we don't squish a large-bleed image into a small-bleed target canvas
            const imageBleedWidthMm = (card.hasBuiltInBleed && existingBleedMm > 0)
                ? existingBleedMm
                : (imageInfo?.exportBleedWidth ?? targetBleedMm);
            const imageBleedPx = MM_TO_PX(imageBleedWidthMm, DPI);

            // Cache is valid if we have the blob at the right DPI
            // For cardbacks (which don't track exportDpi), accept if exportBlob exists
            const isCardback = card.imageId?.startsWith('cardback_');
            const isCacheValid = selectedExportBlob && (isCardback || imageInfo?.exportDpi === DPI);

            // Calculate centering offset if image has different bleed than card's target
            const slotBleedPx = cardLayout.bleedPx;
            const bleedDifferencePx = slotBleedPx - imageBleedPx;
            const centerOffsetX = bleedDifferencePx;
            const centerOffsetY = bleedDifferencePx;
            const imageCardWidthPx = contentWidthInPx + 2 * imageBleedPx;
            const imageCardHeightPx = contentHeightInPx + 2 * imageBleedPx;

            if (isCacheValid) {
                // Fast path: use pre-processed blob directly
                debugLog(`[PDF Worker] Card ${idx}: Using cached blob, size=${selectedExportBlob!.size}`);
                let bitmap = await createImageBitmap(selectedExportBlob!);
                debugLog(`[PDF Worker] Card ${idx}: Created bitmap ${bitmap.width}x${bitmap.height}`);

                // If card has advanced overrides (brightness, contrast, etc.), apply them with WebGL
                if (hasAdvancedOverrides(card.overrides)) {
                    // Check pre-rendered effect cache first
                    const cachedEffectBlob = effectCacheById?.get(card.uuid);
                    if (cachedEffectBlob) {
                        debugLog(`[PDF Worker] Card ${idx}: Using effect cache`);
                        bitmap.close();
                        bitmap = await createImageBitmap(cachedEffectBlob);
                    } else {
                        debugLog(`[PDF Worker] Card ${idx}: Applying WebGL overrides`);
                        const params = overridesToRenderParams(card.overrides!, effectiveDarkenMode as 'none' | 'darken-all' | 'contrast-edges' | 'contrast-full');
                        const renderedBlob = await renderCardWithOverridesWorker(bitmap, params);
                        bitmap.close();
                        bitmap = await createImageBitmap(renderedBlob);
                        // Cache for future exports (fire-and-forget, don't block export)
                        if (card.imageId && card.overrides) {
                            void cacheEffectBlob(card.imageId, card.overrides, renderedBlob, DPI);
                        }
                    }
                }

                finalCardCanvas = bitmap;
            } else {
                // Check cache
                const cacheKey = card.imageId ? `${card.imageId}-${targetBleedMm.toFixed(2)}-${effectiveDarkenMode}` : null;
                if (cacheKey && canvasCache.has(cacheKey)) {
                    debugLog(`[PDF Worker] Card ${idx}: Using canvas cache`);
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
                        if (card.imageId === 'cardback_builtin_blank') {
                            // Blank back card - clean white fill, no guides or placeholders
                            debugLog(`[PDF Worker] Card ${idx}: Creating blank canvas`);
                            const cardBleedPx = cardLayout.bleedPx;
                            const cardWidthWithBleed = contentWidthInPx + 2 * cardBleedPx;
                            const cardHeightWithBleed = contentHeightInPx + 2 * cardBleedPx;
                            debugLog(`[PDF Worker] Card ${idx}: Blank canvas dimensions: ${cardWidthWithBleed}x${cardHeightWithBleed}`);
                            const blankCanvas = new OffscreenCanvas(cardWidthWithBleed, cardHeightWithBleed);
                            debugLog(`[PDF Worker] Card ${idx}: Getting 2d context...`);
                            const cardCtx = blankCanvas.getContext('2d');
                            if (!cardCtx) {
                                throw new Error(`Failed to get 2d context for blank canvas ${cardWidthWithBleed}x${cardHeightWithBleed}`);
                            }
                            debugLog(`[PDF Worker] Card ${idx}: Got 2d context, filling white`);
                            cardCtx.fillStyle = 'white';
                            cardCtx.fillRect(0, 0, cardWidthWithBleed, cardHeightWithBleed);
                            finalCardCanvas = blankCanvas;
                            debugLog(`[PDF Worker] Card ${idx}: Blank canvas complete`);
                        } else if (!src) {
                            // Placeholder for missing images
                            debugLog(`[PDF Worker] Card ${idx}: Creating placeholder (no source)`);
                            const cardBleedPx = cardLayout.bleedPx;
                            const cardWidthWithBleed = contentWidthInPx + 2 * cardBleedPx;
                            const cardHeightWithBleed = contentHeightInPx + 2 * cardBleedPx;
                            const placeholderCanvas = new OffscreenCanvas(cardWidthWithBleed, cardHeightWithBleed);
                            const cardCtx = placeholderCanvas.getContext('2d');
                            if (!cardCtx) {
                                throw new Error(`Failed to get 2d context for placeholder canvas`);
                            }
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
                            debugLog(`[PDF Worker] Card ${idx}: Fetching image from ${src.substring(0, 50)}...`);
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
                                    unit: 'mm', dpi: DPI, darkenMode: effectiveDarkenMode, ...darkenOpts,
                                });
                            } else if (effectiveMode === 'existing' || !needsBleedChange || (card.hasBuiltInBleed && existingBleedMm >= targetBleedMm)) {
                                // For existing bleed (or builtin bleed that needs resizing/cropping), use direct rendering
                                // This skips JFA generation which would cause artifacts on already-bleeding images
                                const targetWidth = Math.ceil(imageCardWidthPx);
                                const targetHeight = Math.ceil(imageCardHeightPx);

                                finalCardCanvas = await renderBleedCanvasDirect(img, targetWidth, targetHeight, {
                                    darkenMode: effectiveDarkenMode,
                                    ...darkenOpts,
                                    // Hint to use export context
                                    mimeType: 'image/png'
                                });
                            } else {
                                // If generating new bleed (e.g. extending existing bleed), pass inputBleed info
                                // so we don't distort the content. We do NOT trim it anymore.
                                finalCardCanvas = await generateBleedCanvasWebGL(img, targetBleedMm, {
                                    unit: 'mm', dpi: DPI,
                                    inputBleed: (card.hasBuiltInBleed && existingBleedMm > 0) ? existingBleedMm : 0,
                                    darkenMode: effectiveDarkenMode, ...darkenOpts,
                                });
                            }

                            img.close();

                            // Apply advanced overrides if present (same as fast path)
                            if (hasAdvancedOverrides(card.overrides) && finalCardCanvas instanceof OffscreenCanvas) {
                                const params = overridesToRenderParams(card.overrides!, effectiveDarkenMode as 'none' | 'darken-all' | 'contrast-edges' | 'contrast-full');
                                // Convert OffscreenCanvas to ImageBitmap for rendering
                                const bitmap = await createImageBitmap(finalCardCanvas);
                                const renderedBlob = await renderCardWithOverridesWorker(bitmap, params);
                                bitmap.close();
                                // Replace finalCardCanvas with rendered result
                                finalCardCanvas = await createImageBitmap(renderedBlob);
                                // Cache for future exports (fire-and-forget)
                                if (card.imageId && card.overrides) {
                                    void cacheEffectBlob(card.imageId, card.overrides, renderedBlob, DPI);
                                }
                            }
                        }

                        // Cache the result (only cache OffscreenCanvas, not ImageBitmap)
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
                isBlank: card.imageId === 'cardback_builtin_blank',
            };
        }, MAX_CONCURRENT_CARDS);

        // PHASE 2: Draw all cards SEQUENTIALLY (canvas context not thread-safe)
        let imagesProcessed = 0;
        for (const prepared of preparedCards) {
            // Skip drawing blank cards entirely (leave transparent/page background)
            if (!prepared.isBlank) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(prepared.x, prepared.y, prepared.cardWidthPx, prepared.cardHeightPx);
                ctx.clip();
                ctx.drawImage(prepared.canvas, prepared.x + prepared.centerOffsetX, prepared.y + prepared.centerOffsetY, prepared.imageCardWidthPx, prepared.imageCardHeightPx);
                ctx.restore();

                if (prepared.canvas instanceof ImageBitmap) {
                    prepared.canvas.close();
                }

                // Stamp per-card guide overlay (skip for blank cards)
                if (perCardGuideCanvas) {
                    const guideOffsetX = prepared.bleedPx - bleedPxForGuide;
                    const guideOffsetY = prepared.bleedPx - bleedPxForGuide;
                    ctx.drawImage(perCardGuideCanvas, prepared.x + guideOffsetX, prepared.y + guideOffsetY);
                }
            }

            imagesProcessed++;
            self.postMessage({ type: 'progress', pageIndex, imagesProcessed });
        }

        // Draw Silhouette registration marks if enabled (on top of everything)
        if (registrationMarks && registrationMarks !== 'none') {
            drawSilhouetteRegistrationMarks(ctx, pageWidthPx, pageHeightPx, DPI, registrationMarks, registrationMarksPortrait);
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

