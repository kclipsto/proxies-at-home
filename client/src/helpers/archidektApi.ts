/**
 * Archidekt API Helper
 *
 * Minimal wrapper for the Archidekt API to fetch deck data.
 * Based on the pyrchidekt Python library structure.
 *
 * API Reference: https://www.archidekt.com/api/decks/{id}/
 */

import { API_BASE } from "@/constants";

// ----- Types based on pyrchidekt -----

export interface ArchidektOracleCard {
    id: number;
    name: string;
    cmc: number;
    colorIdentity: string[];
    colors: string[];
    layout: string;
    types: string[];
}

export interface ArchidektEdition {
    editioncode: string;
    editionname: string;
}

export interface ArchidektCard {
    id: number;
    uid: string; // Scryfall UUID
    artist: string;
    collectorNumber: string;
    edition: ArchidektEdition;
    oracleCard: ArchidektOracleCard;
}

export interface ArchidektDeckCard {
    quantity: number;
    card: ArchidektCard;
    categories: string[];
}

export interface ArchidektCategory {
    name: string;
    includedInDeck: boolean;
    includedInPrice: boolean;
    isPremier: boolean;
}

export interface ArchidektDeck {
    id: number;
    name: string;
    description: string;
    featured: string;
    cards: ArchidektDeckCard[];
    categories: ArchidektCategory[];
}

// ----- URL Parsing -----

/**
 * Extract deck ID from an Archidekt URL.
 *
 * Supports formats:
 * - https://archidekt.com/decks/123456
 * - https://archidekt.com/decks/123456/deck-name
 * - https://www.archidekt.com/decks/123456/deck-name
 *
 * @returns The deck ID as a string, or null if invalid
 */
export function extractArchidektDeckId(url: string): string | null {
    if (!url) return null;

    const match = url.match(/archidekt\.com\/decks\/(\d+)/i);
    return match?.[1] ?? null;
}

/**
 * Validate if a string is an Archidekt deck URL
 */
export function isArchidektUrl(url: string): boolean {
    return extractArchidektDeckId(url) !== null;
}

// ----- API Fetching -----

/**
 * Fetch a deck from Archidekt by ID.
 *
 * Uses server proxy to avoid CORS issues (Archidekt blocks cross-origin requests).
 */
export async function fetchArchidektDeck(deckId: string): Promise<ArchidektDeck> {
    const response = await fetch(`${API_BASE}/api/archidekt/decks/${deckId}`);

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error("Deck not found. It may be private or deleted.");
        }
        throw new Error(`Failed to fetch deck: ${response.status} ${response.statusText}`);
    }

    return await response.json();
}

// ----- Card Extraction -----

export interface ParsedArchidektCard {
    name: string;
    set: string;
    number: string;
    quantity: number;
    scryfallId: string;
    category: string;
    /** True if this card is from the "tokens" category */
    isToken?: boolean;
}

/**
 * Extract cards from an Archidekt deck response.
 *
 * Includes ALL cards from the deck (mainboard, sideboard, maybeboard, etc.)
 * For proxy printing, users typically want to print everything.
 */
export function extractCardsFromDeck(deck: ArchidektDeck): ParsedArchidektCard[] {
    const cards: ParsedArchidektCard[] = [];

    // Card types that should be filtered via Type filter, not Category
    const cardTypes = new Set([
        "creature", "land", "artifact", "enchantment", "instant", "sorcery",
        "planeswalker", "battle", "kindred", "tribal"
    ]);

    // Deck organizational categories (not card types)
    const deckCategories = new Set([
        "commander", "mainboard", "sideboard", "maybeboard", "companion",
        "considering", "acquire", "trade", "tokens"
    ]);

    for (const deckCard of deck.cards) {
        // Filter out card type categories, keeping only deck organizational categories
        const validCategories = deckCard.categories.filter(cat => {
            const lower = cat.toLowerCase();
            // Keep if it's a known deck category OR if it's not a known card type (custom category)
            return deckCategories.has(lower) || !cardTypes.has(lower);
        });

        // Determine primary category (prefer Commander > Mainboard > first valid category)
        let primaryCategory = validCategories[0] || "Mainboard";
        if (validCategories.some(c => c.toLowerCase() === "commander")) {
            primaryCategory = "Commander";
        } else if (validCategories.some(c => c.toLowerCase() === "mainboard")) {
            primaryCategory = "Mainboard";
        }

        // Check if this card is in the tokens category
        const isToken = validCategories.some(c => c.toLowerCase() === 'tokens');

        cards.push({
            name: deckCard.card.oracleCard.name.replace(/\s*★\s*$/, "").trim(),
            set: deckCard.card.edition.editioncode.toLowerCase(),
            number: deckCard.card.collectorNumber.replace(/\s*★\s*$/, "").trim(),
            quantity: deckCard.quantity,
            scryfallId: deckCard.card.uid,
            category: primaryCategory,
            isToken,
        });
    }

    return cards;
}

/**
 * Get a summary of the deck for display.
 */
export function getDeckSummary(deck: ArchidektDeck): { name: string; cardCount: number } {
    const cards = extractCardsFromDeck(deck);
    const cardCount = cards.reduce((sum, c) => sum + c.quantity, 0);
    return { name: deck.name, cardCount };
}
