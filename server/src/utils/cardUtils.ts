import type { CardInfo } from "../../../shared/types.js";

/**
 * Normalizes incoming card queries or names into a standard CardInfo array.
 * @param cardQueries Array of CardInfo objects (preferred).
 * @param cardNames Array of card name strings (legacy/simple).
 * @param defaultLanguage The default language to use if not specified in the query.
 * @returns An array of normalized CardInfo objects.
 */
export function normalizeCardInfos(
    cardQueries: CardInfo[] | null | undefined,
    cardNames: string[] | null | undefined,
    defaultLanguage: string
): CardInfo[] {
    if (Array.isArray(cardQueries)) {
        return cardQueries.map((q) => ({
            name: q.name,
            set: q.set,
            number: q.number,
            language: (q.language || defaultLanguage || "en").toLowerCase(),
            isToken: q.isToken, // Preserve token flag for type:token search filter
        }));
    }
    if (Array.isArray(cardNames)) {
        return cardNames.map((name) => ({
            name,
            language: (defaultLanguage || "en").toLowerCase(),
        }));
    }
    return [];
}
