/**
 * DFC (Double-Faced Card) Helper Functions
 * 
 * Provides utilities for detecting and handling double-faced cards.
 */

import type { ScryfallCard, PrintInfo } from '@/types';

/**
 * Checks if a card is a DFC (has multiple faces).
 * Uses card_faces array per Scryfall API.
 */
export function isDfc(card: ScryfallCard): boolean {
    return !!card.card_faces && card.card_faces.length > 1;
}

/**
 * Gets the back face of a DFC.
 * Returns undefined for non-DFCs.
 */
export function getDfcBackFace(card: ScryfallCard): { name: string; imageUrl?: string } | undefined {
    if (!isDfc(card)) return undefined;
    return card.card_faces![1];
}

/**
 * Extract unique face names from prints array.
 * Returns array of unique face names (e.g., ["Delver of Secrets", "Insectile Aberration"]).
 */
export function getFaceNamesFromPrints(prints?: PrintInfo[]): string[] {
    if (!prints) return [];
    const names = new Set<string>();
    prints.forEach(p => {
        if (p.faceName) names.add(p.faceName);
    });
    return Array.from(names);
}

/**
 * Compute tab labels for front/back face display.
 * Priority: DFC face names > "A // B" format parsing > linked back name > defaults
 */
export function computeTabLabels(
    dfcFaces: string[],
    cardName: string,
    linkedBackName?: string
): { front: string; back: string } {
    // If we have DFC face names from prints, use those
    if (dfcFaces.length >= 2) {
        return { front: dfcFaces[0], back: dfcFaces[1] };
    }

    // Otherwise try to parse "A // B" format from card name
    if (cardName.includes(' // ')) {
        const [frontName, backName] = cardName.split(' // ');
        return { front: frontName.trim(), back: backName.trim() };
    }

    // Fall back to card name and linked back name (or 'Back')
    return { front: cardName || 'Front', back: linkedBackName || 'Back' };
}

/**
 * Determine which face a card belongs to based on card name matching.
 */
export function getCurrentCardFace(
    isDFC: boolean,
    cardName: string,
    dfcBackFaceName?: string
): 'front' | 'back' {
    if (!isDFC || !cardName) return 'front';
    if (dfcBackFaceName && cardName.toLowerCase() === dfcBackFaceName.toLowerCase()) {
        return 'back';
    }
    return 'front';
}

/**
 * Filter prints by selected face for DFCs.
 */
export function filterPrintsByFace(
    prints: PrintInfo[] | undefined,
    selectedFace: 'front' | 'back',
    dfcFrontFaceName?: string,
    dfcBackFaceName?: string
): PrintInfo[] | undefined {
    if (!prints) return prints;

    // Non-DFC: return all prints
    if (!dfcFrontFaceName || !dfcBackFaceName) return prints;

    const targetFaceName = selectedFace === 'back' ? dfcBackFaceName : dfcFrontFaceName;
    return prints.filter(p => p.faceName === targetFaceName);
}
