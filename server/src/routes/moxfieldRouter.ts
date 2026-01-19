/**
 * Moxfield API Proxy Router
 *
 * Proxies requests to Moxfield's API to avoid CORS issues.
 * Uses PostmanRuntime User-Agent to bypass Cloudflare protection.
 * Includes 5-minute LRU cache to reduce external API load.
 */

import express from "express";
import { LRUCache } from "../utils/lruCache.js";

export const moxfieldRouter = express.Router();

const MOXFIELD_API_BASE = "https://api2.moxfield.com/v2";

// Cache deck responses for 5 minutes to reduce API load
interface DeckCacheEntry {
    data: unknown;
    timestamp: number;
}
const deckCache = new LRUCache<string, DeckCacheEntry>(100);
const DECK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * GET /decks/:id
 * Proxy endpoint for fetching Moxfield deck data
 */
moxfieldRouter.get("/decks/:id", async (req, res) => {
    const deckId = req.params.id;

    // Validate deck ID format (alphanumeric with dashes and underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(deckId)) {
        return res.status(400).json({ error: "Invalid deck ID" });
    }

    // Check cache first
    const cached = deckCache.get(deckId);
    if (cached && Date.now() - cached.timestamp < DECK_CACHE_TTL_MS) {
        return res.json(cached.data);
    }

    try {
        const response = await fetch(`${MOXFIELD_API_BASE}/decks/all/${deckId}`, {
            headers: {
                "User-Agent": "PostmanRuntime/7.31.1",
                "Content-Type": "application/json; charset=utf-8",
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            return res.status(response.status).json({
                error: response.status === 404
                    ? "Deck not found. It may be private or deleted."
                    : `Moxfield API error: ${response.status}`,
            });
        }

        const data = await response.json();

        // Cache successful response
        deckCache.set(deckId, { data, timestamp: Date.now() });

        return res.json(data);
    } catch (error) {
        console.error("[moxfieldRouter] Error fetching deck:", error);
        return res.status(500).json({ error: "Failed to fetch deck from Moxfield" });
    }
});
