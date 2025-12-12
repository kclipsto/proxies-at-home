import type { CardOption } from "../../../shared/types";

export const baseCardWidthMm = 63;
export const baseCardHeightMm = 88;

export type CardLayoutInfo = {
    cardWidthMm: number;
    cardHeightMm: number;
    bleedMm: number;
};

export type SourceTypeSettings = {
    mpcBleedMode: 'use-existing' | 'trim-regenerate' | 'none';
    mpcExistingBleed: number;
    mpcExistingBleedUnit: 'mm' | 'in';
    uploadBleedMode: 'generate' | 'existing' | 'none';
    uploadExistingBleed: number;
    uploadExistingBleedUnit: 'mm' | 'in';
};

/** Compute per-card bleed width based on overrides, settings, and global defaults. */
export function getCardTargetBleed(
    card: CardOption,
    sourceSettings: SourceTypeSettings,
    globalBleedWidth: number,
): number {
    if (card.bleedMode) {
        if (card.bleedMode === 'none') return 0;
        if (card.bleedMode === 'existing' && card.existingBleedMm !== undefined) {
            return card.existingBleedMm;
        }
        return globalBleedWidth;
    }

    if (card.hasBakedBleed) {
        if (sourceSettings.mpcBleedMode === 'none') {
            return 0;
        } else if (sourceSettings.mpcBleedMode === 'use-existing') {
            const existingMm = sourceSettings.mpcExistingBleedUnit === 'in'
                ? sourceSettings.mpcExistingBleed * 25.4
                : sourceSettings.mpcExistingBleed;
            return existingMm;
        } else {
            return globalBleedWidth;
        }
    }

    if (card.isUserUpload) {
        if (sourceSettings.uploadBleedMode === 'none') {
            return 0;
        } else if (sourceSettings.uploadBleedMode === 'existing') {
            const existingMm = sourceSettings.uploadExistingBleedUnit === 'in'
                ? sourceSettings.uploadExistingBleed * 25.4
                : sourceSettings.uploadExistingBleed;
            return existingMm;
        }
        return globalBleedWidth;
    }

    return globalBleedWidth;
}

export function computeCardLayouts(
    pageCards: CardOption[],
    sourceSettings: SourceTypeSettings,
    globalBleedWidth: number,
): CardLayoutInfo[] {
    return pageCards.map((card) => {
        const bleedMm = getCardTargetBleed(card, sourceSettings, globalBleedWidth);
        return {
            cardWidthMm: baseCardWidthMm + bleedMm * 2,
            cardHeightMm: baseCardHeightMm + bleedMm * 2,
            bleedMm,
        };
    });
}

export function chunkCards<T>(cards: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < cards.length; i += size) {
        chunks.push(cards.slice(i, i + size));
    }
    return chunks;
}
