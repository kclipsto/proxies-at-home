import type { TokenPart } from "../../../shared/types.js";
import type { ScryfallApiCard } from "./getCardImagesPaged.js";

/**
 * Extract related token parts from a Scryfall card.
 * Scryfall lists tokens in `all_parts` with component "token".
 */
export function extractTokenParts(card: ScryfallApiCard | null | undefined): TokenPart[] {
  if (!card?.all_parts) return [];

  const tokens = card.all_parts
    .filter((part) => part && (part.component === "token" || part.type_line?.toLowerCase().includes("token")))
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

export function cardNeedsToken(card: ScryfallApiCard | null | undefined): boolean {
  return extractTokenParts(card).length > 0;
}
