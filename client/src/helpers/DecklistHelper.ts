import type { CardOption } from "../../../shared/types";

type DecklistEntry = {
  name: string;
  set?: string;
  number?: string;
  isUpload: boolean;
  count: number;
};

/**
 * Groups cards for decklist export.
 * Only adjacent identical cards are grouped together to preserve display order.
 */
export function groupCardsForDecklist(cards: CardOption[]): DecklistEntry[] {
  const result: DecklistEntry[] = [];

  for (const c of cards) {
    // Skip cards without name, cards named "card back", and linked back cards (from cardback library)
    if (!c?.name || c.name.toLowerCase().includes("card back") || c.linkedFrontId) continue;

    const name = c.name.trim();
    const set = c.set;
    const number = c.number;
    const isUpload = !!c.isUserUpload;

    // Check if this card matches the previous entry (for adjacent grouping)
    const prev = result[result.length - 1];
    if (
      prev &&
      prev.name.toLowerCase() === name.toLowerCase() &&
      (prev.set?.toLowerCase() ?? "") === (set?.toLowerCase() ?? "") &&
      (prev.number ?? "") === (number ?? "")
    ) {
      // Same card as previous - increment count
      prev.count += 1;
    } else {
      // Different card - add new entry
      result.push({
        name,
        set,
        number,
        isUpload,
        count: 1,
      });
    }
  }

  return result;
}

export function formatDecklistLine(
  entry: {
    name: string;
    set?: string;
    number?: string;
    isUpload: boolean;
    count: number;
  },
  style: "plain" | "withSetNum" | "scryfallish" = "plain"
) {
  const prefix = `${entry.count}x`;
  switch (style) {
    case "withSetNum":
      if (entry.set && entry.number)
        return `${prefix} ${entry.name} (${entry.set}) ${entry.number}`;
      if (entry.set) return `${prefix} ${entry.name} (${entry.set})`;
      return `${prefix} ${entry.name}`;

    case "scryfallish": {
      const parts = [`${prefix} ${JSON.stringify(entry.name)}`];
      if (entry.set) parts.push(`set:${entry.set}`);
      if (entry.number) parts.push(`number=${entry.number}`);
      return parts.join(" ");
    }

    case "plain":
    default:
      return `${prefix} ${entry.name}`;
  }
}

export function buildDecklist(
  cards: CardOption[],
  opts?: {
    style?: "plain" | "withSetNum" | "scryfallish";
    sort?: "alpha" | "none";
  }
) {
  const groups = groupCardsForDecklist(cards);

  if (opts?.sort === "alpha") {
    groups.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
  }

  const style = opts?.style ?? "plain";
  const lines = groups.map((g) => formatDecklistLine(g, style));
  return lines.join("\n");
}

export function downloadDecklist(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
