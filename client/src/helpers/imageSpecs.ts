
import type { CardOption } from "../../../shared/types";

export interface GlobalSettings {
    bleedEdgeWidth: number;
    mpcBleedMode: string;
    mpcExistingBleed: number;
    mpcExistingBleedUnit: 'mm' | 'in';
    uploadBleedMode: string;
    uploadExistingBleed: number;
    uploadExistingBleedUnit: 'mm' | 'in';
}

/**
 * Determines the effective bleed mode for a card based on its properties and global settings.
 */
export function getEffectiveBleedMode(
    card: CardOption,
    settings: Pick<GlobalSettings, 'mpcBleedMode' | 'uploadBleedMode'>
): CardOption['bleedMode'] {
    // If card has a per-card override, use it
    if (card.bleedMode) {
        return card.bleedMode;
    }

    // Use hasBakedBleed to determine which settings to use:
    // - hasBakedBleed=true → MPC/image with existing bleed → use mpcBleedMode
    // - isUserUpload=true && !hasBakedBleed → Other Upload → use uploadBleedMode
    // - !isUserUpload → Scryfall → always generate
    if (card.hasBakedBleed) {
        // MPC-style image with existing bleed
        if (settings.mpcBleedMode === 'trim-regenerate') {
            return 'generate'; // Trim existing bleed and regenerate
        } else if (settings.mpcBleedMode === 'none') {
            return 'none'; // No bleed
        } else {
            return 'existing'; // Use existing bleed as-is
        }
    } else if (card.isUserUpload) {
        // Other Upload without baked bleed
        return settings.uploadBleedMode as CardOption['bleedMode'];
    } else {
        // Scryfall - always generate bleed
        return 'generate';
    }
}

/**
 * Derives the effective existing bleed amount in mm for a card.
 * Returns undefined if the mode is not 'existing'.
 */
export function getEffectiveExistingBleedMm(
    card: CardOption,
    settings: Pick<GlobalSettings, 'mpcBleedMode' | 'uploadBleedMode' | 'mpcExistingBleed' | 'mpcExistingBleedUnit' | 'uploadExistingBleed' | 'uploadExistingBleedUnit'>
): number | undefined {
    // If card has a per-card override and bleedMode is 'existing', use it
    if (card.bleedMode === 'existing' && card.existingBleedMm !== undefined) {
        return card.existingBleedMm;
    }

    // Otherwise, derive from source-type settings
    const effectiveMode = getEffectiveBleedMode(card, settings);
    if (effectiveMode !== 'existing') {
        return undefined;
    }

    // Use hasBakedBleed to determine which settings to use
    if (card.hasBakedBleed) {
        // MPC-style image - use mpcExistingBleed
        return settings.mpcExistingBleedUnit === 'in'
            ? settings.mpcExistingBleed * 25.4
            : settings.mpcExistingBleed;
    } else {
        // Regular upload - use uploadExistingBleed
        return settings.uploadExistingBleedUnit === 'in'
            ? settings.uploadExistingBleed * 25.4
            : settings.uploadExistingBleed;
    }
}

/**
 * Calculates the expected export bleed width for a card given the global settings.
 * This is the value that should end up in image.exportBleedWidth.
 */
export function getExpectedBleedWidth(
    card: CardOption,
    globalBleedWidthMm: number,
    settings: GlobalSettings
): number {
    const effectiveMode = getEffectiveBleedMode(card, settings);

    if (effectiveMode === 'none') {
        return 0;
    } else if (effectiveMode === 'existing') {
        // For existing mode, the export bleed width is the existing expected bleed
        // Fallback to globalBleedWidth if somehow undefined (though logic suggests it shouldn't be)
        return getEffectiveExistingBleedMm(card, settings) ?? globalBleedWidthMm;
    } else {
        // Generate mode: use card's custom generateBleedMm if set, otherwise global
        return card.generateBleedMm ?? globalBleedWidthMm;
    }
}
