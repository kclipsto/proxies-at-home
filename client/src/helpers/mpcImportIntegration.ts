import type { CardInfo } from "./streamCards";
import { batchSearchMpcAutofill, type MpcAutofillCard, getMpcAutofillImageUrl } from "./mpcAutofillApi";
import { parseMpcCardName } from "./mpcUtils";
import { useSettingsStore } from "../store";
import { debugLog } from "./debug";

// Key to match streamCards Logic
// const cardKey = (info: CardInfo) => info.name.toLowerCase(); // Unused now

export interface MpcMatchResult {
    info: CardInfo;
    mpcCard: MpcAutofillCard;
    imageUrl: string;
}

/**
 * findBestMpcMatches
 * 
 * Takes a list of card infos, searches MPC for them in batch,
 * and applies user preferences (favorites, DPI) to select the best match.
 * Prioritizes exact name matches over fuzzy matches.
 */
export async function findBestMpcMatches(
    infos: CardInfo[],
): Promise<MpcMatchResult[]> {
    // Normalize DFC names for MPC search: "A // B" -> "A" (front face)
    // MPC Autofill doesn't have full DFC names, only individual face names
    const normalizeDfcName = (name: string): string => {
        return name.includes(' // ') ? name.split(' // ')[0].trim() : name;
    };

    // Separate tokens from regular cards (MPC uses different cardType for each)
    const tokenInfos = infos.filter(info => info.isToken);
    const cardInfos = infos.filter(info => !info.isToken);

    // Build maps from normalized name back to original CardInfos
    const nameToTokenInfos = new Map<string, CardInfo[]>();
    const nameToCardInfos = new Map<string, CardInfo[]>();

    for (const info of tokenInfos) {
        const normalized = normalizeDfcName(info.name);
        if (!nameToTokenInfos.has(normalized)) {
            nameToTokenInfos.set(normalized, []);
        }
        nameToTokenInfos.get(normalized)!.push(info);
    }

    for (const info of cardInfos) {
        const normalized = normalizeDfcName(info.name);
        if (!nameToCardInfos.has(normalized)) {
            nameToCardInfos.set(normalized, []);
        }
        nameToCardInfos.get(normalized)!.push(info);
    }

    const uniqueTokenNames = Array.from(nameToTokenInfos.keys());
    const uniqueCardNames = Array.from(nameToCardInfos.keys());

    const settings = useSettingsStore.getState();
    const favSources = new Set(settings.favoriteMpcSources);
    const favTags = new Set(settings.favoriteMpcTags);

    // Batch search - separate searches for tokens and cards
    const [tokenResults, cardResults] = await Promise.all([
        uniqueTokenNames.length > 0
            ? batchSearchMpcAutofill(uniqueTokenNames, 'TOKEN')
            : {} as Record<string, MpcAutofillCard[]>,
        uniqueCardNames.length > 0
            ? batchSearchMpcAutofill(uniqueCardNames, 'CARD')
            : {} as Record<string, MpcAutofillCard[]>,
    ]);

    debugLog('[MPC Match] Filters:', {
        favoriteSources: Array.from(favSources),
        favoriteTags: Array.from(favTags),
    });
    if (uniqueTokenNames.length > 0) {
        debugLog('[MPC Match] Searching for tokens:', uniqueTokenNames);
    }
    if (uniqueCardNames.length > 0) {
        debugLog('[MPC Match] Searching for cards:', uniqueCardNames);
    }

    const matches: MpcMatchResult[] = [];

    // Process all infos and look up in appropriate result set
    for (const info of infos) {
        const normalizedName = normalizeDfcName(info.name);
        const results = info.isToken
            ? tokenResults[normalizedName]
            : cardResults[normalizedName];

        if (results && results.length > 0) {
            // Pass the query name to enable exact match detection
            const best = pickBestMpcCard(results, favSources, favTags, info.name);
            if (best) {
                matches.push({
                    info,
                    mpcCard: best,
                    imageUrl: getMpcAutofillImageUrl(best.identifier)
                });
            }
        }
    }

    return matches;
}
/**
 * Check if a query matches a card name (supports DFC names).
 * Returns true if:
 * - Query matches the full card name
 * - Query matches either face of a DFC (e.g., "Peter Parker" matches "Peter Parker // Amazing Spider-man")
 * - Card name matches either face of a DFC query
 */
function isExactNameMatch(cardName: string, queryName: string): boolean {
    const cardLower = cardName.toLowerCase().trim();
    const queryLower = queryName.toLowerCase().trim();

    // Direct match
    if (cardLower === queryLower) return true;

    // Check if card is DFC - query matches either face
    if (cardLower.includes(' // ')) {
        const [front, back] = cardLower.split(' // ').map(s => s.trim());
        if (queryLower === front || queryLower === back) return true;
    }

    // Check if query is DFC - card matches either face
    if (queryLower.includes(' // ')) {
        const [front, back] = queryLower.split(' // ').map(s => s.trim());
        if (cardLower === front || cardLower === back) return true;
    }

    return false;
}

/**
 * Score an MPC card based on preferences and name match.
 * Higher score = better match.
 */
function scoreMpcCard(
    card: MpcAutofillCard,
    favSources: Set<string>,
    favTags: Set<string>,
    queryName?: string
): number {
    let score = 0;

    // Exact name match bonus (highest priority)
    if (queryName) {
        const cardBaseName = parseMpcCardName(card.name);
        if (isExactNameMatch(cardBaseName, queryName)) {
            score += 100;
        }
    }

    // Favorite source bonus
    if (favSources.has(card.sourceName)) score += 10;

    // Favorite tag bonus
    if (card.tags?.some(t => favTags.has(t))) score += 5;

    // DPI as tiebreaker (scaled down so it doesn't override other factors)
    score += card.dpi / 10000;

    return score;
}

/**
 * Pick the best MPC card using scoring.
 * Priority: exact name match > favorite source > favorite tag > DPI
 */
export function pickBestMpcCard(
    cards: MpcAutofillCard[],
    favSources: Set<string>,
    favTags: Set<string>,
    queryName?: string
): MpcAutofillCard | null {
    if (cards.length === 0) return null;

    // Score and sort by score descending
    const scored = cards.map(c => ({
        card: c,
        score: scoreMpcCard(c, favSources, favTags, queryName)
    }));
    scored.sort((a, b) => b.score - a.score);

    // Log top 5 candidates with their scores
    const top5 = scored.slice(0, 5);
    debugLog(`[MPC Match] Query: "${queryName}" - Total candidates: ${cards.length}`);
    if (top5.length > 0) {
        debugLog('[MPC Match] Top candidates:', top5.map(s => ({
            name: s.card.name,
            source: s.card.sourceName,
            tags: s.card.tags?.join(', ') || '',
            dpi: s.card.dpi,
            score: s.score.toFixed(2),
            isExactMatch: queryName ? isExactNameMatch(parseMpcCardName(s.card.name), queryName) : false,
        })));
    }

    return scored[0].card;
}

/**
 * Parses MPC card data to extract the base name and set standard flags.
 */
export function parseMpcCardLogic(mpcCard: MpcAutofillCard, originalCardName?: string) {
    const mpcName = mpcCard.name || "";
    const baseNameMatch = mpcName.match(/^([^([{\r\n]+)/);
    // Use parsed name, or fallback to MPC name, or finally original card name
    const cardName = baseNameMatch ? baseNameMatch[1].trim() : (mpcName || originalCardName || "");

    return {
        name: cardName,
        hasBuiltInBleed: true,
        needsEnrichment: true
    };
}
