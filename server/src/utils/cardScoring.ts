import type { ScryfallApiCard } from './getCardImagesPaged.js';

/**
 * Scores a card match against a query name.
 * Higher score is better.
 * 
 * Strategy:
 * - Exact name match: +100
 * - DFC Front/Back match: +90
 * - Art Series (Layout): -50 (Deprioritized)
 * - Collector Number: Tiebreaker (lower is better, assuming lower = main set)
 */
export function scoreCardMatch(card: ScryfallApiCard, queryName: string, rowCollectorNumber?: string): number {
    let score = 0;
    const queryLower = queryName.toLowerCase();
    const cardName = card.name?.toLowerCase() || '';

    // Exact name match (highest priority)
    if (cardName === queryLower) {
        score += 100;
    }
    // DFC: query matches front face
    else if (cardName.startsWith(queryLower + ' // ')) {
        score += 90;
    }
    // Generic contains check for other partial matches could go here, 
    // but we currently rely on SQL LIKE logic before scoring.

    // Deprioritize art_series cards (often have wrong metadata)
    if (card.layout === 'art_series') {
        score -= 50;
    }

    // Use collector number as final tiebreaker (lower = earlier in set = more likely main card)
    if (rowCollectorNumber) {
        const collectorNum = parseInt(rowCollectorNumber || '999', 10);
        if (!isNaN(collectorNum)) {
            score += (1000 - Math.min(collectorNum, 999)) / 10000; // Small tiebreaker < 0.1
        }
    }

    return score;
}
