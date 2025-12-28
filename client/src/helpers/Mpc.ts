import { API_BASE } from "../constants";
import { db } from "../db";
import { addRemoteImages, createLinkedBackCardsBulk } from "./dbUtils";
import { undoableAddCards } from "./undoableActions";
import { extractCardInfo } from "./CardInfoHelper";
import { createImportSession } from "./ImportSession";
import type { CardOption } from "../../../shared/types";

export type MpcItem = {
  qty: number;
  name: string;
  filename?: string;
  frontId?: string;
  backId?: string;
  backName?: string;
  imageId?: string;
  url?: string;
};

export interface MpcParseResult {
  items: MpcItem[];
  globalCardbackId?: string;
}

export interface MpcImportResult {
  success: boolean;
  count: number;
  error?: string;
}

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
  return `${API_BASE}/api/cards/images/mpc?id=${encodeURIComponent(frontId)}`;
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

      const pathParts = u.pathname.split("/").filter(Boolean);
      const dIndex = pathParts.indexOf("d");
      if (dIndex !== -1 && dIndex < pathParts.length - 1) {
        const id = pathParts[dIndex + 1];
        if (DRIVE_ID_RE.test(id)) {
          return id;
        }
      }

      const last = u.pathname.split("/").filter(Boolean).pop();
      if (last && DRIVE_ID_RE.test(last)) return last;
    } catch (e) {
      console.error("Error in extractDriveId:", e);
      return undefined;
    }
  }

  return undefined;
}

export function tryParseMpcSchemaXml(raw: string): MpcParseResult | null {
  const doc = new DOMParser().parseFromString(raw, "text/xml");
  if (doc.getElementsByTagName("parsererror").length) return null;
  const order = doc.querySelector("order");
  if (!order) return null;

  // Parse the global cardback element (default back for cards without specific backs)
  const globalCardbackElement = order.querySelector(":scope > cardback");
  const globalCardbackId = extractDriveId(globalCardbackElement?.textContent || undefined);

  const fronts = Array.from(order.querySelectorAll("fronts > card"));
  // slotIndex -> { backId, backName }
  const backs = new Map<number, { backId: string; backName: string }>();
  for (const bc of Array.from(order.querySelectorAll("backs > card"))) {
    const backId = extractDriveId(
      bc.querySelector("id")?.textContent || undefined
    );
    const backNameRaw = bc.querySelector("name")?.textContent || "";
    const backName = /\.[a-z0-9]{2,4}$/i.test(backNameRaw)
      ? inferCardNameFromFilename(backNameRaw)
      : backNameRaw || "Back";
    const slots = (bc.querySelector("slots")?.textContent || "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
    if (backId && slots.length) {
      for (const s of slots) backs.set(s, { backId, backName });
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

    let backId: string | undefined;
    let backName: string | undefined;
    if (slots.length > 0) {
      const backInfo = backs.get(slots[0]);
      backId = backInfo?.backId;
      backName = backInfo?.backName;
    }

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
      backId,
      backName,
    });
  }

  return { items, globalCardbackId };
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

export async function processMpcImport(
  xmlContent: string,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<MpcImportResult> {
  const parseResult = tryParseMpcSchemaXml(xmlContent);
  if (!parseResult) {
    return { success: false, count: 0, error: "Failed to parse MPC XML" };
  }

  const { items: mpcData, globalCardbackId } = parseResult;

  const cardsToAdd: Array<Omit<CardOption, "uuid" | "order"> & { imageId?: string }> = [];
  const totalItems = mpcData.length;
  const totalCards = mpcData.reduce((sum, item) => sum + item.qty, 0);

  // Get the global cardback URL (used as fallback for cards without specific backs)
  const globalCardbackUrl = getMpcImageUrl(globalCardbackId);

  // First pass: Collect all images to batch add (with correct ref counts based on qty)
  const imagesToBatch: Array<{ imageUrls: string[]; count: number }> = [];
  const itemsWithUrls: Array<{ item: MpcItem; frontUrl?: string; backUrl?: string; usesGlobalCardback: boolean }> = [];

  // Count how many cards will use the global cardback (cards without specific backs)
  let globalCardbackRefCount = 0;

  for (let i = 0; i < totalItems; i++) {
    const item = mpcData[i];
    const frontUrl = getMpcImageUrl(item.frontId);
    const specificBackUrl = getMpcImageUrl(item.backId);

    // Use item.qty for the image ref count (multiple cards share the same image)
    if (frontUrl) {
      imagesToBatch.push({ imageUrls: [frontUrl], count: item.qty });
    }

    // Determine which back to use: specific back takes priority, then global cardback
    let backUrl: string | undefined;
    let usesGlobalCardback = false;

    if (specificBackUrl) {
      // Card has a specific back from <backs> section (e.g., DFC)
      backUrl = specificBackUrl;
      imagesToBatch.push({ imageUrls: [specificBackUrl], count: item.qty });
    } else if (globalCardbackUrl) {
      // Card uses the global cardback
      backUrl = globalCardbackUrl;
      usesGlobalCardback = true;
      globalCardbackRefCount += item.qty;
    }

    itemsWithUrls.push({ item, frontUrl: frontUrl || undefined, backUrl, usesGlobalCardback });
  }

  // Add global cardback to db.cardbacks (not db.images)
  let globalCardbackImageId: string | undefined;
  if (globalCardbackUrl && globalCardbackRefCount > 0) {
    // Use a stable ID based on the URL with cardback_ prefix
    globalCardbackImageId = `cardback_mpc_${globalCardbackUrl.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100)}`;

    // Check if already exists - if not, add it
    const existing = await db.cardbacks.get(globalCardbackImageId);
    if (!existing) {
      await db.cardbacks.add({
        id: globalCardbackImageId,
        sourceUrl: globalCardbackUrl,
        hasBuiltInBleed: true,  // MPC cardbacks have bleed built in
      });
    }
  }

  // Batch add logic for front images only (not cardbacks)
  const urlToIdMap = await addRemoteImages(imagesToBatch);

  // Track which cards have backs (for linking after creation)
  const cardsWithBacks: Array<{ index: number; backUrl: string; backName?: string }> = [];

  // Second pass: Create card entries (respecting qty for multiple copies)
  let cardIndex = 0;
  itemsWithUrls.forEach(({ item, frontUrl, backUrl, usesGlobalCardback }, i) => {
    let frontImageId: string | undefined;
    if (frontUrl) {
      frontImageId = urlToIdMap.get(frontUrl);
    }

    const rawName = item.name || `MPC Import ${i + 1}`;
    const cardInfo = extractCardInfo(rawName);

    // Create item.qty copies of this card
    for (let copy = 0; copy < item.qty; copy++) {
      cardIndex++;
      if (onProgress) {
        onProgress(cardIndex, totalCards, `Processing card ${cardIndex}...`);
      }

      // Track which cards have backs for linking later
      if (backUrl) {
        // Use specific back name from XML, or "MPC Cardback" for global cardback
        const backName = usesGlobalCardback ? "MPC Cardback" : item.backName;
        cardsWithBacks.push({ index: cardsToAdd.length, backUrl, backName });
      }

      // Skip Scryfall enrichment during import - will be done in background
      // MPC imports default to no darken pixels (already optimized for print)
      cardsToAdd.push({
        name: cardInfo.name,
        set: cardInfo.set,
        number: cardInfo.number,
        imageId: frontImageId || "",
        isUserUpload: true,
        hasBuiltInBleed: true,
        needsEnrichment: true,
        overrides: {
          darkenMode: 'none',
          darkenUseGlobalSettings: false,
        },
      });
    }
  });

  if (cardsToAdd.length > 0) {
    const addedCards = await undoableAddCards(cardsToAdd);
    const cardUuids = addedCards.map(c => c.uuid);
    const allCreatedCardUuids = [...cardUuids];

    // Create linked back cards for items with backs
    const backCardItems = [];
    for (const { index, backUrl, backName } of cardsWithBacks) {
      const frontCard = addedCards[index];
      if (!frontCard) continue;

      // For global cardback, use the pre-computed ID; otherwise lookup from urlToIdMap
      const isGlobalCardback = backUrl === globalCardbackUrl;
      const backImageId = isGlobalCardback ? globalCardbackImageId : urlToIdMap.get(backUrl);
      if (!backImageId) continue;

      const backCardName = backName || `${frontCard.name} (Back)`;
      backCardItems.push({
        frontUuid: frontCard.uuid,
        backImageId,
        backName: backCardName,
        options: {
          needsEnrichment: false,
          hasBuiltInBleed: true,
        },
      });
    }

    if (backCardItems.length > 0) {
      const backUuids = await createLinkedBackCardsBulk(backCardItems);
      allCreatedCardUuids.push(...backUuids);
    }

    // Create import session with all known UUIDs (fronts + backs)
    // awaitEnrichment: true because MPC imports need metadata fetching afterward
    createImportSession({
      totalCards: allCreatedCardUuids.length,
      cardUuids: allCreatedCardUuids,
      importType: 'mpc',
      awaitEnrichment: true,
    });
  }

  return { success: true, count: cardsToAdd.length };
}