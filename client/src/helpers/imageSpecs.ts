
import type { CardOption } from "../../../shared/types";

export interface GlobalSettings {
    bleedEdgeWidth: number;
    bleedEdgeUnit: 'mm' | 'in';
    // New Source/Target schema
    withBleedSourceAmount: number;
    withBleedTargetMode: 'global' | 'manual' | 'none';
    withBleedTargetAmount: number;
    noBleedTargetMode: 'global' | 'manual' | 'none';
    noBleedTargetAmount: number;
}

/**
 * Gets the hasBuiltInBleed status for a card, handling legacy hasBakedBleed property.
 * If card setting is undefined/unknown, falls back to the Image record's generated setting (if provided).
 */
export function getHasBuiltInBleed(card: CardOption, image?: { generatedHasBuiltInBleed?: boolean }): boolean | undefined {
    return card.hasBuiltInBleed ?? (card as { hasBakedBleed?: boolean }).hasBakedBleed ?? image?.generatedHasBuiltInBleed;
}

/**
 * Determines the effective bleed mode for a card based on its properties and global settings.
 * Returns:
 * - 'generate': Logic will auto-trim or auto-extend based on Source vs Target amount.
 * - 'none': Output should have 0 bleed.
 * - 'existing': (Legacy/Override) Use specific per-card existing bleed logic (rarely used now).
 */
export function getEffectiveBleedMode(
    card: CardOption,
    settings: Pick<GlobalSettings, 'withBleedTargetMode' | 'noBleedTargetMode'>
): 'generate' | 'none' | 'existing' {
    // 1. Per-card override
    if (card.bleedMode) {
        return card.bleedMode;
    }

    // 2. Type-specific settings
    let targetMode: 'global' | 'manual' | 'none' = 'global';

    if (getHasBuiltInBleed(card)) {
        targetMode = settings.withBleedTargetMode;
    } else if (card.isUserUpload) {
        // Regular upload (no built in bleed)
        targetMode = settings.noBleedTargetMode;
    } else {
        // Scryfall (no built in bleed)
        targetMode = settings.noBleedTargetMode;
    }

    if (targetMode === 'none') {
        return 'none';
    }

    // Default to 'generate' which handles both extend (0->3mm) and trim (3mm->1mm) automatically
    return 'generate';
}

/**
 * Derives the effective existing bleed amount in mm for a card.
 * This is the "Source Bleed Amount".
 */
export function getEffectiveExistingBleedMm(
    card: CardOption,
    settings: Pick<GlobalSettings, 'withBleedSourceAmount'>,
    image?: { generatedHasBuiltInBleed?: boolean }
): number | undefined {
    // 1. Per-card override
    if (card.existingBleedMm !== undefined) {
        return card.existingBleedMm;
    }

    // 2. Type-specific Defaults
    if (getHasBuiltInBleed(card, image)) {
        // If settings say 0 but it has built-in bleed, fallback to standard MPC amount (3.175mm ~ 1/8in)
        // This ensures downstream workers don't assume 0 and trigger full generation
        return settings.withBleedSourceAmount || 3.175;
    }

    // Images without built in bleed have 0mm existing bleed
    return 0;
}

/**
 * Calculates the expected export bleed width for a card given the global settings.
 * This is the "Target Bleed Amount".
 */
export function getExpectedBleedWidth(
    card: CardOption,
    globalBleedWidthMm: number,
    settings: GlobalSettings
): number {
    const effectiveMode = getEffectiveBleedMode(card, settings);

    if (effectiveMode === 'none') {
        return 0;
    }

    // Check for per-card override first
    if (card.generateBleedMm !== undefined) {
        return card.generateBleedMm;
    }

    // Determine target amount based on Type Settings
    let targetMode: 'global' | 'manual' | 'none' = 'global';
    let manualAmount = 0;

    if (getHasBuiltInBleed(card)) {
        targetMode = settings.withBleedTargetMode;
        manualAmount = settings.withBleedTargetAmount;
    } else {
        // No built in bleed (Upload or Scryfall)
        targetMode = settings.noBleedTargetMode;
        manualAmount = settings.noBleedTargetAmount;
    }

    if (targetMode === 'manual') {
        return manualAmount;
    }

    // Default to 'global'
    return globalBleedWidthMm;
}
