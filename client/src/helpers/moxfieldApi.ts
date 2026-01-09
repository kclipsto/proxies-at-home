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

// Type for Electron API exposed via preload
interface ElectronAPI {
    fetchMoxfieldDeck?: (deckId: string) => Promise<MoxfieldDeck>;
}

// Check if running in Electron
const getElectronAPI = (): ElectronAPI | undefined => {
    return (window as { electronAPI?: ElectronAPI }).electronAPI;
};

/**
 * Fetch a deck from Moxfield by ID.
 *
 * In Electron: Uses IPC to fetch via Chromium's network stack (bypasses Cloudflare).
 * In Browser: Uses server proxy to handle Cloudflare protection.
 */
export async function fetchMoxfieldDeck(deckId: string): Promise<MoxfieldDeck> {
    const electronAPI = getElectronAPI();

    // Try Electron's native fetch first (uses Chromium's network stack)
    if (electronAPI?.fetchMoxfieldDeck) {
        console.log(`[moxfieldApi] Using Electron IPC for deck: ${deckId}`);
        try {
            const result = await electronAPI.fetchMoxfieldDeck(deckId);
            console.log(`[moxfieldApi] Electron IPC success: ${result.name}`);
            return result;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[moxfieldApi] Electron IPC failed: ${message}`);
            throw error;
        }
    }

    // Fall back to server proxy for web
    console.log(`[moxfieldApi] Using server proxy for deck: ${deckId}`);
    const response = await fetch(`${API_BASE}/api/moxfield/decks/${deckId}`);

    if (!response.ok) {
        console.error(`[moxfieldApi] Server proxy error: ${response.status} ${response.statusText}`);
        if (response.status === 404) {
            throw new Error("Deck not found. It may be private or deleted.");
        }
        throw new Error(`Failed to fetch deck: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`[moxfieldApi] Server proxy success: ${result.name}`);
    return result;
}

// ----- Card Extraction -----

export interface ParsedMoxfieldCard {
    name: string;
    set: string;
    number: string;
    quantity: number;
    scryfallId: string;
    category: string;
    /** True if this card is a token (type_line contains 'Token') */
    isToken?: boolean;
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
            // Detect tokens from type_line (e.g., "Token Creature — Human Soldier")
            const isToken = deckCard.card.type_line?.toLowerCase().includes('token');

            cards.push({
                name: deckCard.card.name,
                set: deckCard.card.set.toLowerCase(),
                number: deckCard.card.cn,
                quantity: deckCard.quantity,
                scryfallId: deckCard.card.scryfall_id,
                category: normalizeCategory(deckCard.boardType) || board.category,
                isToken,
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
