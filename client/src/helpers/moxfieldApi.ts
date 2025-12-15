/**
 * Moxfield API Helper
 *
 * Minimal wrapper for the Moxfield API to fetch deck data.
 * Uses server proxy to avoid CORS and Cloudflare issues.
 */

import { API_BASE } from "@/constants";

// ----- Types based on Moxfield API response -----

export interface MoxfieldCard {
    id: string;
    uniqueCardId: string;
    scryfall_id: string;
    set: string;
    set_name: string;
    name: string;
    cn: string; // collector number
    layout: string;
    type_line: string;
}

export interface MoxfieldDeckCard {
    quantity: number;
    boardType: string;
    finish: string;
    isFoil: boolean;
    card: MoxfieldCard;
}

export interface MoxfieldDeck {
    id: string;
    name: string;
    format: string;
    publicId: string;
    publicUrl: string;
    mainboard: Record<string, MoxfieldDeckCard>;
    sideboard: Record<string, MoxfieldDeckCard>;
    maybeboard: Record<string, MoxfieldDeckCard>;
    commanders: Record<string, MoxfieldDeckCard>;
    companions: Record<string, MoxfieldDeckCard>;
    mainboardCount: number;
    sideboardCount: number;
    maybeboardCount: number;
    commandersCount: number;
    companionsCount: number;
}

// ----- URL Parsing -----

/**
 * Extract deck ID from a Moxfield URL.
 *
 * Supports formats:
 * - https://moxfield.com/decks/ly1m26eBokyw3NnYO-yYNA
 * - https://www.moxfield.com/decks/ly1m26eBokyw3NnYO-yYNA
 * - moxfield.com/decks/ly1m26eBokyw3NnYO-yYNA
 *
 * @returns The deck ID (publicId), or null if invalid
 */
export function extractMoxfieldDeckId(url: string): string | null {
    if (!url) return null;

    const match = url.match(/moxfield\.com\/decks\/([a-zA-Z0-9_-]+)/i);
    return match?.[1] ?? null;
}

/**
 * Validate if a string is a Moxfield deck URL
 */
export function isMoxfieldUrl(url: string): boolean {
    return extractMoxfieldDeckId(url) !== null;
}

// ----- API Fetching -----

/**
 * Fetch a deck from Moxfield by ID.
 *
 * Uses server proxy to handle Cloudflare protection.
 */
export async function fetchMoxfieldDeck(deckId: string): Promise<MoxfieldDeck> {
    const response = await fetch(`${API_BASE}/api/moxfield/decks/${deckId}`);

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error("Deck not found. It may be private or deleted.");
        }
        throw new Error(`Failed to fetch deck: ${response.status} ${response.statusText}`);
    }

    return await response.json();
}

// ----- Card Extraction -----

export interface ParsedMoxfieldCard {
    name: string;
    set: string;
    number: string;
    quantity: number;
    scryfallId: string;
    category: string;
}

/**
 * Normalize category name to title case for consistent filtering.
 * Handles both standard categories and custom user categories.
 */
function normalizeCategory(boardType: string): string {
    // Map Moxfield board types to title-cased categories
    const mapping: Record<string, string> = {
        mainboard: "Mainboard",
        sideboard: "Sideboard",
        maybeboard: "Maybeboard",
        commanders: "Commander",
        companions: "Companion",
    };

    // Check for standard mapping
    const normalized = mapping[boardType.toLowerCase()];
    if (normalized) return normalized;

    // For custom categories, title-case them
    return boardType.charAt(0).toUpperCase() + boardType.slice(1).toLowerCase();
}

/**
 * Extract cards from a Moxfield deck response.
 *
 * Includes ALL cards from the deck (mainboard, sideboard, maybeboard, etc.)
 * with normalized category names for filtering.
 */
export function extractCardsFromDeck(deck: MoxfieldDeck): ParsedMoxfieldCard[] {
    const cards: ParsedMoxfieldCard[] = [];

    const boards: Array<{ data: Record<string, MoxfieldDeckCard>; category: string }> = [
        { data: deck.commanders || {}, category: "Commander" },
        { data: deck.companions || {}, category: "Companion" },
        { data: deck.mainboard || {}, category: "Mainboard" },
        { data: deck.sideboard || {}, category: "Sideboard" },
        { data: deck.maybeboard || {}, category: "Maybeboard" },
    ];

    for (const board of boards) {
        for (const deckCard of Object.values(board.data)) {
            cards.push({
                name: deckCard.card.name,
                set: deckCard.card.set.toLowerCase(),
                number: deckCard.card.cn,
                quantity: deckCard.quantity,
                scryfallId: deckCard.card.scryfall_id,
                category: normalizeCategory(deckCard.boardType) || board.category,
            });
        }
    }

    return cards;
}

/**
 * Get a summary of the deck for display.
 */
export function getDeckSummary(deck: MoxfieldDeck): { name: string; cardCount: number } {
    const cards = extractCardsFromDeck(deck);
    const cardCount = cards.reduce((sum, c) => sum + c.quantity, 0);
    return { name: deck.name, cardCount };
}
