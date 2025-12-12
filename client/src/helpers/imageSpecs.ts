
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

function hasBleed(card: CardOption): boolean {
    return card.hasBuiltInBleed ?? (card as { hasBakedBleed?: boolean }).hasBakedBleed ?? false;
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

    if (hasBleed(card)) {
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
    settings: Pick<GlobalSettings, 'withBleedSourceAmount'>
): number | undefined {
    // 1. Per-card override
    if (card.existingBleedMm !== undefined) {
        return card.existingBleedMm;
    }

    // 2. Type-specific Defaults
    if (hasBleed(card)) {
        return settings.withBleedSourceAmount;
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
    settings: GlobalSettings,
    debug: boolean = false
): number {
    const effectiveMode = getEffectiveBleedMode(card, settings);
    const cardName = card.name || card.uuid?.slice(0, 8) || 'unknown';

    if (effectiveMode === 'none') {
        if (debug) console.log(`[BleedCalc] ${cardName}: mode=none → 0mm`);
        return 0;
    }

    // Check for per-card override first
    if (card.generateBleedMm !== undefined) {
        if (debug) console.log(`[BleedCalc] ${cardName}: per-card override → ${card.generateBleedMm}mm`);
        return card.generateBleedMm;
    }

    // Determine target amount based on Type Settings
    let targetMode: 'global' | 'manual' | 'none' = 'global';
    let manualAmount = 0;

    if (hasBleed(card)) {
        targetMode = settings.withBleedTargetMode;
        manualAmount = settings.withBleedTargetAmount;
    } else {
        // No built in bleed (Upload or Scryfall)
        targetMode = settings.noBleedTargetMode;
        manualAmount = settings.noBleedTargetAmount;
    }

    if (targetMode === 'manual') {
        if (debug) console.log(`[BleedCalc] ${cardName}: manual override → ${manualAmount}mm`);
        return manualAmount;
    }

    // Default to 'global'
    if (debug) console.log(`[BleedCalc] ${cardName}: global default → ${globalBleedWidthMm}mm`);
    return globalBleedWidthMm;
}
