import type { CardInfo } from "./streamCards";
import { batchSearchMpcAutofill, type MpcAutofillCard, getMpcAutofillImageUrl } from "./mpcAutofillApi";
import { useSettingsStore } from "../store";

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
 */
export async function findBestMpcMatches(
    infos: CardInfo[],
): Promise<MpcMatchResult[]> {
    const uniqueNames = Array.from(new Set(infos.map(i => i.name)));
    const settings = useSettingsStore.getState();
    const favSources = new Set(settings.favoriteMpcSources);
    const favTags = new Set(settings.favoriteMpcTags);

    // Batch search
    const searchResults = await batchSearchMpcAutofill(uniqueNames);

    const matches: MpcMatchResult[] = [];


    for (const info of infos) {
        // Try exact match in results, or loose match? 
        // batchSearchMpcAutofill results are keyed by the query string provided.
        // We provided uniqueNames.
        const results = searchResults[info.name];

        if (results && results.length > 0) {
            const best = pickBestMpcCard(results, favSources, favTags);
            if (best) {
                matches.push({
                    info,
                    mpcCard: best,
                    imageUrl: getMpcAutofillImageUrl(best.identifier)
                });
            }
        }
        // We can't easily do per-card progress here since it's a batch, 
        // but we can report at the end or if we chunked it outside.
    }

    return matches;
}

function pickBestMpcCard(cards: MpcAutofillCard[], favSources: Set<string>, favTags: Set<string>): MpcAutofillCard | null {
    if (cards.length === 0) return null;

    // Helper to sort by DPI
    const sortByDpi = (list: MpcAutofillCard[]) => list.sort((a, b) => b.dpi - a.dpi)[0];

    // 1. Try Fav Sources AND Fav Tags
    let candidates = cards;
    if (favSources.size > 0) candidates = candidates.filter(c => favSources.has(c.sourceName));
    if (favTags.size > 0) candidates = candidates.filter(c => c.tags && c.tags.some(t => favTags.has(t)));

    if (candidates.length > 0) return sortByDpi(candidates);

    // 2. If we had tags, try relaxing tags (Fav Sources only)
    if (favTags.size > 0) {
        candidates = cards;
        if (favSources.size > 0) candidates = candidates.filter(c => favSources.has(c.sourceName));
        if (candidates.length > 0) return sortByDpi(candidates);
    }

    // 3. If we had sources, try relaxing sources (Any Source)
    if (favSources.size > 0) {
        // Fallback to any card found
        return sortByDpi(cards);
    }

    // Should already be covered, but fallback
    return sortByDpi(cards);
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
