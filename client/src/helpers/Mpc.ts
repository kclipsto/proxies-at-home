import { API_BASE } from "../constants";

type MpcItem = {
  qty: number;
  name: string;
  filename?: string;
  frontId?: string;
  backId?: string;
};

export function inferCardNameFromFilename(filename: string): string {
  const noExt = filename.replace(/\.[a-z0-9]+$/i, "");
  const beforeParen = noExt.split("(")[0];
  const cleaned = beforeParen
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned;
}

export function getMpcImageUrl(frontId?: string | null): string | null {
  if (!frontId) return null;
  return `${API_BASE}/api/cards/images/front?id=${encodeURIComponent(frontId)}`;
}

export function extractDriveId(
  s: string | null | undefined
): string | undefined {
  if (!s) return undefined;
  const v = s.trim();
  const DRIVE_ID_RE = /^[A-Za-z0-9_-]{12,}$/;

  if (DRIVE_ID_RE.test(v)) return v;

  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      const qid = u.searchParams.get("id");
      if (qid && DRIVE_ID_RE.test(qid)) return qid;
      const last = u.pathname.split("/").filter(Boolean).pop();
      if (last && DRIVE_ID_RE.test(last)) return last;
    } catch (e) {
      console.error("Error in extractDriveId:", e);
      return undefined;
    }
  }

  return undefined;
}

export function tryParseMpcSchemaXml(raw: string): MpcItem[] | null {
  const doc = new DOMParser().parseFromString(raw, "text/xml");
  if (doc.getElementsByTagName("parsererror").length) return null;
  const order = doc.querySelector("order");
  if (!order) return null;

  const fronts = Array.from(order.querySelectorAll("fronts > card"));
  const backs = new Map<number, string>(); // slotIndex -> backId
  for (const bc of Array.from(order.querySelectorAll("backs > card"))) {
    const backId = extractDriveId(
      bc.querySelector("id")?.textContent || undefined
    );
    const slots = (bc.querySelector("slots")?.textContent || "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
    if (backId && slots.length) {
      for (const s of slots) backs.set(s, backId);
    }
  }

  const items: MpcItem[] = [];

  for (const fc of fronts) {
    const idText = fc.querySelector("id")?.textContent || undefined;
    const slotsRaw = fc.querySelector("slots")?.textContent || "";
    const nameText = fc.querySelector("name")?.textContent || "";
    const query = fc.querySelector("query")?.textContent || "";

    const frontId = extractDriveId(idText);
    const slots = slotsRaw
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
    const qty = Math.max(1, slots.length || 1);

    const looksLikeFilename = /\.[a-z0-9]{2,4}$/i.test(nameText);
    const filename = looksLikeFilename ? nameText.trim() : undefined;
    const name = (
      looksLikeFilename
        ? inferCardNameFromFilename(nameText)
        : nameText || query || "Custom Art"
    ).trim();

    items.push({
      qty,
      name,
      filename,
      frontId,
    });
  }

  return items;
}

export function parseMpcText(raw: string): MpcItem[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: MpcItem[] = [];
  const fileEndRe = /\.(png|jpe?g)$/i;
  const idLikeRe = /^[A-Za-z0-9\-_]{12,}$/;

  for (const line of lines) {
    const tokens = line.split(/\s+/);
    const qty = Number.isFinite(parseInt(tokens[0], 10))
      ? parseInt(tokens[0], 10)
      : 1;

    const fileEndIdx = tokens.findIndex((t) => fileEndRe.test(t));
    if (fileEndIdx === -1) {
      out.push({ qty, name: `Custom Art ${out.length + 1}` });
      continue;
    }

    const zeroIdx = tokens.lastIndexOf("0", fileEndIdx - 1);

    let filenameStart = zeroIdx >= 0 ? zeroIdx + 1 : fileEndIdx;
    if (filenameStart > fileEndIdx) filenameStart = fileEndIdx;

    const filename = tokens.slice(filenameStart, fileEndIdx + 1).join(" ");

    let frontId: string | undefined;
    if (zeroIdx > 0 && idLikeRe.test(tokens[zeroIdx - 1])) {
      frontId = tokens[zeroIdx - 1];
    } else {
      for (let i = fileEndIdx - 1; i >= 1; i--) {
        if (idLikeRe.test(tokens[i])) {
          frontId = tokens[i];
          break;
        }
      }
    }

    let backId: string | undefined;
    for (let i = tokens.length - 1; i > fileEndIdx; i--) {
      if (idLikeRe.test(tokens[i])) {
        backId = tokens[i];
        break;
      }
    }

    const name = inferCardNameFromFilename(filename);
    out.push({ qty, name, filename, frontId, backId });
  }

  return out;
}
