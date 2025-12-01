import type { CardOption } from "../../../shared/types";

export function groupCardsForDecklist(cards: CardOption[]) {
  type Key = string;
  const map = new Map<
    Key,
    {
      name: string;
      set?: string;
      number?: string;
      isUpload: boolean;
      count: number;
    }
  >();

  for (const c of cards) {
    if (!c?.name || c.name.toLowerCase().includes("card back")) continue;

    const keyParts = [
      c.name.trim().toLowerCase(),
      c.set?.toLowerCase() ?? "",
      c.number ?? "",
    ];
    const key = keyParts.join("|");

    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, {
        name: c.name.trim(),
        set: c.set,
        number: c.number,
        isUpload: !!c.isUserUpload,
        count: 1,
      });
    }
  }

  return Array.from(map.values());
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
