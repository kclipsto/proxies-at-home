/**
 * Archidekt API Proxy Router
 *
 * Proxies requests to Archidekt's API to avoid CORS issues.
 * Only used if direct client-side requests to Archidekt are blocked.
 * Includes 5-minute LRU cache to reduce external API load.
 */

import express from "express";
import { LRUCache } from "../utils/lruCache.js";

export const archidektRouter = express.Router();

const ARCHIDEKT_API_BASE = "https://www.archidekt.com/api";

// Cache deck responses for 5 minutes to reduce API load
interface DeckCacheEntry {
    data: unknown;
    timestamp: number;
}
const deckCache = new LRUCache<string, DeckCacheEntry>(100);
const DECK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * GET /decks/:id
 * Proxy endpoint for fetching Archidekt deck data
 */
archidektRouter.get("/decks/:id", async (req, res) => {
    const deckId = req.params.id;

    // Validate deck ID is numeric
    if (!/^\d+$/.test(deckId)) {
        return res.status(400).json({ error: "Invalid deck ID" });
    }

    // Check cache first
    const cached = deckCache.get(deckId);
    if (cached && Date.now() - cached.timestamp < DECK_CACHE_TTL_MS) {
        return res.json(cached.data);
    }

    try {
        const response = await fetch(`${ARCHIDEKT_API_BASE}/decks/${deckId}/`, {
            headers: {
                Accept: "application/json",
                "User-Agent": "ProxxiedApp/1.0",
            },
        });

        if (!response.ok) {
            // Forward the error status
            return res.status(response.status).json({
                error: response.status === 404
                    ? "Deck not found. It may be private or deleted."
                    : `Archidekt API error: ${response.status}`,
            });
        }

        const data = await response.json();

        // Cache successful response
        deckCache.set(deckId, { data, timestamp: Date.now() });

        return res.json(data);
    } catch (error) {
        console.error("[archidektRouter] Error fetching deck:", error);
        return res.status(500).json({ error: "Failed to fetch deck from Archidekt" });
    }
});
