
import { fetchMoxfieldDeck, extractMoxfieldDeckId, extractCardsFromDeck as extractMoxfieldCards } from "./moxfieldApi";
import { fetchArchidektDeck, extractArchidektDeckId, extractCardsFromDeck as extractArchidektCards } from "./archidektApi";
import { inferCardNameFromFilename, extractDriveId } from "./mpc";
import type { CardOverrides, TokenPart, ScryfallCard } from "../../../shared/types";

/**
 * Pre-fetched card data to skip API calls during import.
 * Contains the minimum required fields from a Scryfall response.
 */
export interface PreloadedCardData {
    name?: string;
    set?: string;
    number?: string;
    lang?: string;
    colors?: string[];
    cmc?: number;
    type_line?: string;
    rarity?: string;
    mana_cost?: string;
    token_parts?: TokenPart[];
    hasBuiltInBleed?: boolean;
    imageUrl?: string;
    imageUrls?: string[];
    prints?: Array<{ imageUrl: string; set: string; number: string }>;
    // DFC support: face information from Scryfall
    card_faces?: Array<{
        name: string;
        imageUrl?: string;
    }>;
}

export interface ImportIntent {
    // Core Identity
    name: string;
    set?: string;
    number?: string;
    mpcId?: string; // For known MPC cards (standard or custom)

    // Quantity
    quantity: number;

    // Context / Config
    isToken: boolean;

    // For Custom/XML: The ID of the specific image to use as the back face.
    linkedBackImageId?: string;
    linkedBackName?: string;
    linkedBackSet?: string;     // For linking specific Scryfall back via set/number
    linkedBackNumber?: string;  // For linking specific Scryfall back via set/number

    // Image URL for direct imports (bypassing search)
    imageUrl?: string;

    // Board Section (default: 'Mainboard')
    category?: string;

    // For Updates: If we are modifying an existing card (Artwork Modal), pass its UUID.
    targetCardId?: string;

    tags?: string[];

    // For local uploads
    localImageId?: string;
    cardOverrides?: Partial<CardOverrides>;

    // Optimization: Pre-fetched data to skip API calls
    preloadedData?: PreloadedCardData;

    sourcePreference?: 'scryfall' | 'mpc' | 'manual';

    // For restoring exact state from Share
    preferredImageId?: string; // Specific Scryfall/URL image to use instead of default lookup
    order?: number;            // Specific sort order

    // Original filename if from file import (useful for debugging/UI)
    filename?: string;
}

/**
 * Check if a query ends with incomplete tag syntax (e.g., "set:", "c:", "t:")
 * Used to prevent API requests while the user is still typing
 */
export function hasIncompleteTagSyntax(query: string): boolean {
    return /\b\w+:\s*$/i.test(query);
}

/**
 * Parses a single line of text or a simple query into an ImportIntent.
 * Logic ported from cardInfoHelper.tsx
 */
export function parseLineToIntent(input: string, defaultQuantity: number = 1): ImportIntent {
    let s = input.trim();
    let mpcIdentifier: string | undefined;
    let isToken = false;
    let quantity = defaultQuantity;

    // Extract [mpc:xxx] notation first
    const mpcMatch = s.match(/\[mpc:([^\]]+)\]/);
    if (mpcMatch) {
        mpcIdentifier = mpcMatch[1];
        s = s.replace(/\[mpc:[^\]]+\]/, '').trim();
    }

    // Extract quantity BEFORE t: prefix detection
    const qtyMatch = s.match(/^\s*(\d+)\s*x?\s+(.+)$/i);
    if (qtyMatch) {
        quantity = parseInt(qtyMatch[1], 10);
        s = qtyMatch[2].trim();
    }

    // Detect t: prefix for explicit token cards
    const quotedTokenMatch = s.match(/^t:["']([^"']+)["']$/i);
    if (quotedTokenMatch) {
        isToken = true;
        s = quotedTokenMatch[1].trim();
    }
    // Format 2: Underscore names - t:human_soldier
    else if (/^t:[a-z0-9]+_[a-z0-9_]+$/i.test(s)) {
        isToken = true;
        s = s.slice(2).replace(/_/g, ' ').trim();
    }
    // Format 3: t:token name or t:name
    else {
        const tokenPrefixMatch = s.match(/^t:(?:token\s+)?(.+)$/i);
        if (tokenPrefixMatch) {
            isToken = true;
            s = tokenPrefixMatch[1].trim();
        }
    }

    const caretTail = /\s*\^[^^]*\^\s*$/;
    const bracketTail = /\s*\[[^\]]*]\s*$/;
    const starTail = /\s*[★]\s*$/;
    let changed = true;
    while (changed) {
        const before = s;
        s = s.replace(caretTail, "").trim();
        s = s.replace(bracketTail, "").trim();
        s = s.replace(starTail, "").trim();
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

    // Check for {Number} only format
    const numBracketsOnly = /\s*\{([a-z0-9]+)\}\s*$/i;
    const setNumTail = /\s*\(([a-z0-9]{2,5})\)\s*([a-z0-9-]+)?\s*$/i;
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

        // 2. Strip {Num} pattern
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

        // 6. Generic cleanup
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

    return {
        name: s,
        quantity,
        set: setCode,
        number,
        mpcId: mpcIdentifier,
        isToken,
        sourcePreference: mpcIdentifier ? 'mpc' : undefined
    };
}

// Known deck categories for detection
const KNOWN_CATEGORIES = ['mainboard', 'sideboard', 'maybeboard', 'commander', 'companion', 'tokens', 'main', 'side', 'deck'];

function isKnownCategory(s: string): boolean {
    return KNOWN_CATEGORIES.includes(s.toLowerCase().replace(/\s+/g, ''));
}

function normalizeCategory(s: string): string {
    const lower = s.toLowerCase().replace(/\s+/g, '');
    // Map common variations
    if (lower === 'main' || lower === 'deck') return 'Mainboard';
    if (lower === 'side' || lower === 'sb') return 'Sideboard';
    if (lower === 'maybe') return 'Maybeboard';
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Parses a full deck text into a list of ImportIntents.
 * Detects category headers (e.g., "// Sideboard", "Sideboard:") and propagates to cards.
 */
export function parseDeckList(deckText: string): ImportIntent[] {
    const intents: ImportIntent[] = [];
    let currentCategory = 'Mainboard';

    deckText.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // Detect category headers: "// Sideboard", "Sideboard:", "SIDEBOARD", etc.
        const categoryMatch = trimmed.match(/^(?:\/\/\s*)?([a-zA-Z]+):?\s*$/);
        if (categoryMatch && isKnownCategory(categoryMatch[1])) {
            currentCategory = normalizeCategory(categoryMatch[1]);
            return; // Don't parse this line as a card
        }

        // We can just use parseLineToIntent for each line, as it handles "4x Name" logic internally
        const intent = parseLineToIntent(trimmed);
        intent.category = currentCategory;
        intents.push(intent);
    });
    return intents;
}

/**
 * Factory to create an ImportIntent from an existing Card object (Scryfall/MPC/etc).
 */
export function createIntentFromPreloaded(
    cardData: ScryfallCard | PreloadedCardData,
    options: {
        quantity?: number,
        isToken?: boolean,
        category?: string,
        targetCardId?: string,
        linkedBackImageId?: string
    } = {}
): ImportIntent {
    return {
        name: cardData.name || "Unknown Card",
        quantity: options.quantity ?? 1,
        isToken: options.isToken ?? false,
        category: options.category,
        targetCardId: options.targetCardId,
        linkedBackImageId: options.linkedBackImageId,
        preloadedData: cardData,
        sourcePreference: 'manual'
    };
}


// --------------------------------------------------------------------------
// MPC PARSING LOGIC helpers - Re-export from mpc.ts to avoid duplication
// --------------------------------------------------------------------------
export { inferCardNameFromFilename, extractDriveId };

/**
 * Parses MPC XML Content into ImportIntents.
 * Resolves Global Cardbacks and specific card links.
 */

export function parseMpcXml(xmlContent: string): ImportIntent[] {
    const doc = new DOMParser().parseFromString(xmlContent, "text/xml");
    if (doc.getElementsByTagName("parsererror").length) {
        throw new Error("Failed to parse MPC XML: Invalid XML format");
    }

    const order = doc.querySelector("order");
    if (!order) throw new Error("Invalid MPC XML: Missing <order> tag");

    // Note: We ignore the global <cardback> element - cards will use the app's default cardback

    const backs = new Map<number, { backId: string; backName: string }>();
    for (const bc of Array.from(order.querySelectorAll("backs > card"))) {
        const backId = extractDriveId(bc.querySelector("id")?.textContent || undefined);
        const backNameRaw = bc.querySelector("name")?.textContent || "";
        const backName = /\.[a-z0-9]{2,4}$/i.test(backNameRaw)
            ? inferCardNameFromFilename(backNameRaw)
            : backNameRaw || "Back";

        const slotsRaw = bc.querySelector("slots")?.textContent || "";
        const slots = slotsRaw.split(",").map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite);

        if (backId && slots.length) {
            for (const s of slots) backs.set(s, { backId, backName });
        }
    }

    const items: ImportIntent[] = [];
    const fronts = Array.from(order.querySelectorAll("fronts > card"));

    for (const fc of fronts) {
        const idText = fc.querySelector("id")?.textContent || undefined;
        const slotsRaw = fc.querySelector("slots")?.textContent || "";
        const nameText = fc.querySelector("name")?.textContent || "";
        const query = fc.querySelector("query")?.textContent || "";

        const frontId = extractDriveId(idText);
        const slots = slotsRaw
            .split(",")
            .map((s) => parseInt(s.trim(), 10))
            .filter(Number.isFinite);
        const qty = Math.max(1, slots.length || 1);

        let linkedBackImageId: string | undefined = undefined;
        let linkedBackName: string | undefined = undefined;

        // Check specific backs for this card's slots
        if (slots.length > 0) {
            const firstBack = backs.get(slots[0]);

            // Validate all slots share the same back (common case)
            // In complex MPC projects, different slots might have different backs
            if (slots.length > 1) {
                const allSameBack = slots.every(slot => {
                    const back = backs.get(slot);
                    return back?.backId === firstBack?.backId;
                });

                if (!allSameBack) {
                    // Different backs per slot - use first slot's back
                    // This is a rare edge case in complex MPC projects
                    console.warn(`[MPC XML] Card "${nameText || query}" has different backs per slot. Using first slot's back.`);
                }
            }

            if (firstBack?.backId) {
                linkedBackImageId = firstBack.backId;
                linkedBackName = firstBack.backName;
            }
        }

        // NOTE: We intentionally do NOT fall back to globalCardbackId here.
        // The global MPC cardback is project-wide and should not create DFC-style
        // linked back cards. Cards without specific backs will use the app's
        // default cardback setting instead.

        const looksLikeFilename = /\.[a-z0-9]{2,4}$/i.test(nameText);
        const filename = looksLikeFilename ? nameText.trim() : undefined;
        const name = (
            looksLikeFilename
                ? inferCardNameFromFilename(nameText)
                : nameText || query || "Custom Card"
        ).trim();

        const intent: ImportIntent = {
            name,
            quantity: qty,
            mpcId: frontId,
            linkedBackImageId,
            linkedBackName,
            isToken: false,
            sourcePreference: 'mpc',
            filename,
        };

        items.push(intent);
    }

    return items;
}

/**
 * Parses a Deck Builder URL (Moxfield/Archidekt) into ImportIntents.
 * Fetches the deck data from the API.
 */
export async function parseDeckBuilderUrl(url: string): Promise<ImportIntent[]> {
    const moxfieldId = extractMoxfieldDeckId(url);
    if (moxfieldId) {
        const deck = await fetchMoxfieldDeck(moxfieldId);
        const cards = extractMoxfieldCards(deck);
        return cards.map(c => ({
            name: c.name,
            set: c.set,
            number: c.number,
            quantity: c.quantity,
            isToken: !!c.isToken,
            category: c.category
        }));
    }

    const archidektId = extractArchidektDeckId(url);
    if (archidektId) {
        const deck = await fetchArchidektDeck(archidektId);
        const cards = extractArchidektCards(deck);
        return cards.map(c => ({
            name: c.name,
            set: c.set,
            number: c.number,
            quantity: c.quantity,
            isToken: !!c.isToken,
            category: c.category
        }));
    }

    throw new Error("Unsupported URL format");
}
