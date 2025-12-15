/**
 * Archidekt API Proxy Router
 *
 * Proxies requests to Archidekt's API to avoid CORS issues.
 * Only used if direct client-side requests to Archidekt are blocked.
 */

import express from "express";

export const archidektRouter = express.Router();

const ARCHIDEKT_API_BASE = "https://www.archidekt.com/api";

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
        return res.json(data);
    } catch (error) {
        console.error("[archidektRouter] Error fetching deck:", error);
        return res.status(500).json({ error: "Failed to fetch deck from Archidekt" });
    }
});
