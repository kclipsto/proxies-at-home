import type { TokenPart } from "../../../shared/types.js";
import type { ScryfallApiCard } from "./getCardImagesPaged.js";

/**
 * Extract related token parts from a Scryfall card.
 * Scryfall lists tokens in `all_parts` with component "token".
 * @param card The Scryfall card data
 * @returns Array of token parts, deduplicated by id/name
 */
export function extractTokenParts(card: ScryfallApiCard | null | undefined): TokenPart[] {
    if (!card?.all_parts) return [];

    // Tokens themselves should never "need" tokens.
    // Scryfall sometimes links tokens to other tokens (e.g. from the same set),
    // but a Token card doesn't spawn other tokens in game rules (simplified rule).
    if (card.layout === 'token' || card.layout === 'double_faced_token' || card.type_line?.toLowerCase().includes('token')) {
        return [];
    }

    const tokens = card.all_parts
        .filter((part) => part && (part.component === "token" || part.type_line?.toLowerCase().includes("token")))
        // Exclude self-referential parts (e.g. "Treasure" token lists "Treasure" as a part)
        // This prevents tokens from needing themselves
        .filter((part) => part.name && part.name !== card.name)
        .map((part) => ({
            id: part.id,
            name: part.name || "",
            type_line: part.type_line,
            uri: part.uri,
        }))
        .filter((part) => part.name);

    // Deduplicate by id/name
    const seen = new Set<string>();
    const unique: TokenPart[] = [];
    for (const token of tokens) {
        const key = token.id || token.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(token);
    }

    return unique;
}

/**
 * Check if a card has associated tokens.
 * @param card The Scryfall card data
 * @returns true if the card has at least one associated token
 */
export function cardNeedsToken(card: ScryfallApiCard | null | undefined): boolean {
    return extractTokenParts(card).length > 0;
}
