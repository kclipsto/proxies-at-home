import type { CardOption } from "../../../shared/types";
import { CONSTANTS } from "@/constants/commonConstants";

export type CardLayoutInfo = {
    cardWidthMm: number;
    cardHeightMm: number;
    bleedMm: number;
};

export type SourceTypeSettings = {
    withBleedTargetMode: 'global' | 'manual' | 'none';
    withBleedTargetAmount: number;
    noBleedTargetMode: 'global' | 'manual' | 'none';
    noBleedTargetAmount: number;
};

/** Compute per-card bleed width based on overrides, settings, and global defaults. */
export function getCardTargetBleed(
    card: CardOption,
    sourceSettings: SourceTypeSettings,
    globalBleedWidth: number,
): number {
    // 1. Card-Specific Override
    if (card.bleedMode) {
        if (card.bleedMode === 'none') return 0;
        if (card.bleedMode === 'generate') {
            return card.generateBleedMm ?? globalBleedWidth;
        }
        // Legacy 'existing' mode support (treat as manual override if amount exists)
        if (card.bleedMode === 'existing' && card.existingBleedMm !== undefined) {
            return card.existingBleedMm;
        }
    }

    // 2. Type Settings (Global Defaults)
    if (card.hasBuiltInBleed) {
        switch (sourceSettings.withBleedTargetMode) {
            case 'none': return 0;
            case 'manual': return sourceSettings.withBleedTargetAmount;
            case 'global': return globalBleedWidth;
            default: return globalBleedWidth;
        }
    } else {
        // Standard cards (no built-in bleed)
        switch (sourceSettings.noBleedTargetMode) {
            case 'none': return 0;
            case 'manual': return sourceSettings.noBleedTargetAmount;
            case 'global': return globalBleedWidth;
            default: return globalBleedWidth;
        }
    }
}

export function computeCardLayouts(
    pageCards: CardOption[],
    sourceSettings: SourceTypeSettings,
    globalBleedWidth: number,
): CardLayoutInfo[] {
    return pageCards.map((card) => {
        const bleedMm = getCardTargetBleed(card, sourceSettings, globalBleedWidth);
        return {
            cardWidthMm: CONSTANTS.CARD_WIDTH_MM + bleedMm * 2,
            cardHeightMm: CONSTANTS.CARD_HEIGHT_MM + bleedMm * 2,
            bleedMm,
        };
    });
}

export type GridDimensions = {
    colWidthsMm: number[];
    rowHeightsMm: number[];
    totalGridWidthMm: number;
    totalGridHeightMm: number;
};

export function computeGridDimensions(
    layouts: CardLayoutInfo[],
    columns: number,
    rows: number,
    cardSpacingMm: number = 0
): GridDimensions {
    // Initialize with base dimensions (no bleed) to allow growing only as needed
    // This matches PageView behavior: empty slots or small cards don't force global bleed size
    const startWidth = CONSTANTS.CARD_WIDTH_MM;
    const startHeight = CONSTANTS.CARD_HEIGHT_MM;

    // Compute max width per column
    const colWidthsMm: number[] = Array(columns).fill(startWidth);
    layouts.forEach((layout, idx) => {
        const col = idx % columns;
        colWidthsMm[col] = Math.max(colWidthsMm[col], layout.cardWidthMm);
    });

    // Compute max height per row
    const rowHeightsMm: number[] = Array(rows).fill(startHeight);
    layouts.forEach((layout, idx) => {
        const row = Math.floor(idx / columns);
        // Ensure we don't go out of bounds if layouts has more items than rows * columns (shouldn't happen per page, but safe to check)
        if (row < rows) {
            rowHeightsMm[row] = Math.max(rowHeightsMm[row], layout.cardHeightMm);
        }
    });

    const totalGridWidthMm = colWidthsMm.reduce((sum, w) => sum + w, 0) + Math.max(0, columns - 1) * cardSpacingMm;
    const totalGridHeightMm = rowHeightsMm.reduce((sum, h) => sum + h, 0) + Math.max(0, rows - 1) * cardSpacingMm;

    return { colWidthsMm, rowHeightsMm, totalGridWidthMm, totalGridHeightMm };
}

export function chunkCards<T>(cards: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < cards.length; i += size) {
        chunks.push(cards.slice(i, i + size));
    }
    return chunks;
}
