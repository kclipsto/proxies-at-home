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
}

/**
 * Extract cards from an Archidekt deck response.
 *
 * Includes ALL cards from the deck (mainboard, sideboard, maybeboard, etc.)
 * For proxy printing, users typically want to print everything.
 */
export function extractCardsFromDeck(deck: ArchidektDeck): ParsedArchidektCard[] {
    const cards: ParsedArchidektCard[] = [];

    for (const deckCard of deck.cards) {
        // Determine primary category (prefer Commander > Mainboard > first category)
        let primaryCategory = deckCard.categories[0] || "Mainboard";
        if (deckCard.categories.includes("Commander")) {
            primaryCategory = "Commander";
        } else if (deckCard.categories.includes("Mainboard")) {
            primaryCategory = "Mainboard";
        }

        cards.push({
            name: deckCard.card.oracleCard.name.replace(/\s*★\s*$/, "").trim(),
            set: deckCard.card.edition.editioncode.toLowerCase(),
            number: deckCard.card.collectorNumber.replace(/\s*★\s*$/, "").trim(),
            quantity: deckCard.quantity,
            scryfallId: deckCard.card.uid,
            category: primaryCategory,
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
