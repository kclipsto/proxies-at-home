import type { CardInfo } from "./streamCards";
import { batchSearchMpcAutofill, type MpcAutofillCard, getMpcAutofillImageUrl } from "./mpcAutofillApi";
import { parseMpcCardName } from "./mpcUtils";
import { useUserPreferencesStore } from "../store";
import { debugLog } from "./debug";
import { normalizeDfcName } from "../../../shared/cardNameUtils";

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

    const prefs = useUserPreferencesStore.getState().preferences;
    const favSources = new Set(prefs?.favoriteMpcSources || []);
    const favTags = new Set(prefs?.favoriteMpcTags || []);
    const minDpi = prefs?.favoriteMpcDpi || 0; // 0 means no DPI filter

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
        minDpi,
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
            // Pass the query name and minDpi to enable exact match detection and DPI filtering
            const best = pickBestMpcCard(results, favSources, favTags, info.name, minDpi);
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
    queryName?: string,
    favDpi: number = 0
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

    // Favorite DPI bonus (card meets or exceeds favorite DPI)
    if (favDpi > 0 && (card.dpi || 0) >= favDpi) score += 8;

    // Favorite tag bonus
    if (card.tags?.some(t => favTags.has(t))) score += 5;

    // DPI as tiebreaker (scaled down so it doesn't override other factors)
    score += card.dpi / 10000;

    return score;
}

/**
 * Pick the best MPC card using scoring with progressive filter relaxation.
 * Priority: exact name match > favorite source > favorite tag > DPI
 * 
 * Progressive relaxation:
 * 1. Try with all filters (sources, tags, minDpi)
 * 2. If no match, remove minDpi filter
 * 3. If still no match, remove tags filter
 * 4. If still no match, remove sources filter
 * 5. Return best match from whatever passes, or any card if no filters match
 */
export function pickBestMpcCard(
    cards: MpcAutofillCard[],
    favSources: Set<string>,
    favTags: Set<string>,
    queryName?: string,
    minDpi: number = 0
): MpcAutofillCard | null {
    if (cards.length === 0) return null;

    // Filter by exact name first (this is always required if queryName is provided)
    let candidates = cards;
    if (queryName) {
        const exactMatches = cards.filter(c => {
            const cardBaseName = parseMpcCardName(c.name);
            return isExactNameMatch(cardBaseName, queryName);
        });
        if (exactMatches.length > 0) {
            candidates = exactMatches;
        }
    }

    // Filter to prefer cards matching ANY preference (OR logic)
    // If no cards match any preference, use all candidates
    const hasSourceFilter = favSources.size > 0;
    const hasTagFilter = favTags.size > 0;
    const hasDpiFilter = minDpi > 0;

    let filtered = candidates;

    // Try to find cards matching at least one preference
    if (hasSourceFilter || hasTagFilter || hasDpiFilter) {
        const matchesAnyPreference = candidates.filter(c => {
            const passesSource = hasSourceFilter && favSources.has(c.sourceName);
            const passesTag = hasTagFilter && c.tags?.some(t => favTags.has(t));
            const passesDpi = hasDpiFilter && (c.dpi || 0) >= minDpi;
            // Card passes if it matches ANY preference
            return passesSource || passesTag || passesDpi;
        });

        if (matchesAnyPreference.length > 0) {
            filtered = matchesAnyPreference;
            debugLog(`[MPC Match] Cards matching at least one preference: ${filtered.length} from ${candidates.length}`);
        } else {
            debugLog(`[MPC Match] No cards match any preferences, using all ${candidates.length} candidates`);
        }
    }

    // Score and sort remaining candidates
    const scored = filtered.map(c => ({
        card: c,
        score: scoreMpcCard(c, favSources, favTags, queryName, minDpi)
    }));
    scored.sort((a, b) => b.score - a.score);

    // Log top 5 candidates with their scores
    const top5 = scored.slice(0, 5);
    debugLog(`[MPC Match] Query: "${queryName}" - Total candidates: ${cards.length}, After filters: ${filtered.length}`);
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

    return scored.length > 0 ? scored[0].card : null;
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
