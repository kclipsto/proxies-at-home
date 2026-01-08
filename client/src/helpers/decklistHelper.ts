import type { CardOption } from "../../../shared/types";
import { extractMpcIdentifierFromImageId } from "./mpcAutofillApi";
import { inferImageSource } from "./imageSourceUtils";

type DecklistEntry = {
  name: string;
  set?: string;
  number?: string;
  isUpload: boolean;
  count: number;
  mpcIdentifier?: string;
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
    // Only extract MPC ID if the source is actually 'mpc' (prevents false positives)
    const source = inferImageSource(c.imageId);
    const mpcId = source === 'mpc' ? extractMpcIdentifierFromImageId(c.imageId) : null;

    // Check if this card matches the previous entry (for adjacent grouping)
    // Note: MPC identifier is NOT used for grouping - each unique MPC image stays separate
    const prev = result[result.length - 1];
    if (
      prev &&
      prev.name.toLowerCase() === name.toLowerCase() &&
      (prev.set?.toLowerCase() ?? "") === (set?.toLowerCase() ?? "") &&
      (prev.number ?? "") === (number ?? "") &&
      (prev.mpcIdentifier ?? "") === (mpcId ?? "")
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
        mpcIdentifier: mpcId ?? undefined,
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
    mpcIdentifier?: string;
  },
  style: "plain" | "withSetNum" | "scryfallish" | "withMpc" = "plain"
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

    case "withMpc": {
      // Format: 1x Card Name [mpc:identifier] or fallback to withSetNum if no MPC
      if (entry.mpcIdentifier) {
        return `${prefix} ${entry.name} [mpc:${entry.mpcIdentifier}]`;
      }
      // Fallback to standard format for non-MPC cards
      if (entry.set && entry.number)
        return `${prefix} ${entry.name} (${entry.set}) ${entry.number}`;
      if (entry.set) return `${prefix} ${entry.name} (${entry.set})`;
      return `${prefix} ${entry.name}`;
    }

    case "plain":
    default:
      return `${prefix} ${entry.name}`;
  }
}

export function buildDecklist(
  cards: CardOption[],
  opts?: {
    style?: "plain" | "withSetNum" | "scryfallish" | "withMpc";
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
