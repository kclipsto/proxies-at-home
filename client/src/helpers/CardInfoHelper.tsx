import type { CardInfo } from "../../../shared/types";

/**
 * Check if a query ends with incomplete tag syntax (e.g., "set:", "c:", "t:")
 * Used to prevent API requests while the user is still typing
 */
export function hasIncompleteTagSyntax(query: string): boolean {
  return /\b\w+:\s*$/i.test(query);
}

export function extractCardInfo(input: string, quantity: number = 1): CardInfo {
  let s = input.trim();

  s = s.replace(/^\s*\d+\s*x?\s+/i, "");

  const caretTail = /\s*\^[^^]*\^\s*$/;
  const bracketTail = /\s*\[[^\]]*]\s*$/;
  let changed = true;
  while (changed) {
    const before = s;
    s = s.replace(caretTail, "").trim();
    s = s.replace(bracketTail, "").trim();
    changed = s !== before;
  }

  let setCode: string | undefined;
  let number: string | undefined;

  // Check for [Set] {Number} format (e.g. [FIC] {7})
  const setNumBrackets = /\s*\[([a-z0-9]+)\]\s*\{([a-z0-9]+)\}\s*$/i;
  const mBrackets = s.match(setNumBrackets);
  if (mBrackets) {
    setCode = mBrackets[1]?.toLowerCase();
    number = mBrackets[2];
    s = s.replace(setNumBrackets, "").trim();
  }

  // Check for {Number} only format (e.g. Name {123}) - User requested to drop number
  const numBracketsOnly = /\s*\{([a-z0-9]+)\}\s*$/i;
  const setNumTail = /\s*\(([a-z0-9]{2,5})\)\s*([0-9]+[a-z]?)?\s*$/i;
  const setColonTail = /\s*(?:set:|s:)([a-z0-9]+)\s*$/i;
  const numColonTail = /\s*(?:num:|cn:)([a-z0-9]+)\s*$/i;

  let parsing = true;
  while (parsing) {
    parsing = false;

    // 1. Try to extract Set/Num from [Set] {Num} or [Set]
    if (!setCode) {
      const m = s.match(setNumBrackets);
      if (m) {
        setCode = m[1].toLowerCase();
        if (m[2]) number = m[2];
        s = s.replace(setNumBrackets, "").trim();
        parsing = true;
        continue;
      }
    }

    // 2. Strip {Num} pattern (not captured - for compatibility)
    if (!number) {
      const m = s.match(numBracketsOnly);
      if (m) {
        s = s.replace(numBracketsOnly, "").trim();
        parsing = true;
        continue;
      }
    }

    // 3. Try to extract (Set) Number
    if (!setCode && !number) {
      const m = s.match(setNumTail);
      if (m) {
        setCode = m[1].toLowerCase();
        number = m[2] ?? undefined;
        s = s.replace(setNumTail, "").trim();
        parsing = true;
        continue;
      }
    }

    // 4. Try set: or s:
    if (!setCode) {
      const m = s.match(setColonTail);
      if (m) {
        setCode = m[1].toLowerCase();
        s = s.replace(setColonTail, "").trim();
        parsing = true;
        continue;
      }
    }

    // 5. Try num: or cn:
    if (!number) {
      const m = s.match(numColonTail);
      if (m) {
        number = m[1];
        s = s.replace(numColonTail, "").trim();
        parsing = true;
        continue;
      }
    }

    // 6. Generic cleanup (remove other brackets/carets like [Foil])
    if (s.match(bracketTail)) {
      s = s.replace(bracketTail, "").trim();
      parsing = true;
      continue;
    }

    if (s.match(caretTail)) {
      s = s.replace(caretTail, "").trim();
      parsing = true;
      continue;
    }
  }

  return { name: s, quantity, set: setCode, number };
}

export function parseDeckToInfos(deckText: string): CardInfo[] {
  const infos: CardInfo[] = [];
  deckText.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const qtyMatch = trimmed.match(/^\s*(\d+)\s*x?\s+(.*)$/i);
    if (qtyMatch) {
      const count = parseInt(qtyMatch[1], 10);
      const rest = qtyMatch[2];
      const info = extractCardInfo(rest, count);
      infos.push(info);
    } else {
      const info = extractCardInfo(trimmed);
      infos.push(info);
    }
  });
  return infos;
}

export function cardKey(ci: CardInfo): string {
  return `${ci.name.toLowerCase()}|${(ci.set ?? "").toLowerCase()}|${ci.number ?? ""}`;
}
