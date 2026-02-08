import express, { type Request, type Response } from "express";
import { batchFetchCards, lookupCardFromBatch, getCardsWithImagesForCardInfo, type ScryfallApiCard } from "../utils/getCardImagesPaged.js";
import { normalizeCardInfos } from "../utils/cardUtils.js";
import { debugLog } from "../utils/debug.js";
import { extractTokenParts } from "../utils/tokenUtils.js";
import { type ScryfallCard } from "../../../shared/types.js";

const streamRouter = express.Router();

/**
 * Extract image URLs and prints from a Scryfall API card.
 * If requestedFaceName is provided, prioritize that face's image first.
 */
function extractCardImages(card: ScryfallApiCard, requestedFaceName?: string): {
  imageUrls: string[];
  prints: Array<{ imageUrl: string; set: string; number: string; rarity?: string; faceName?: string }>;
} {
  const imageUrls: string[] = [];
  const prints: Array<{ imageUrl: string; set: string; number: string; rarity?: string; faceName?: string }> = [];

  debugLog(`[extractCardImages] Processing "${card.name}" (${card.set}:${card.collector_number}), requestedFace="${requestedFaceName}"`);
  debugLog(`[extractCardImages] Card has image_uris: ${!!card.image_uris?.png}, card_faces: ${card.card_faces?.length ?? 0}`);

  if (card.image_uris?.png) {
    // Non-DFC card
    debugLog(`[extractCardImages] Non-DFC, using image_uris.png: ${card.image_uris.png.substring(0, 60)}...`);
    imageUrls.push(card.image_uris.png);
    prints.push({
      imageUrl: card.image_uris.png,
      set: card.set ?? "",
      number: card.collector_number ?? "",
      rarity: card.rarity,
    });
  } else if (card.card_faces) {
    // DFC - check if a specific face was requested
    const faces = card.card_faces;
    debugLog(`[extractCardImages] DFC with ${faces.length} faces:`, faces.map(f => f.name));

    // 1. Generate Image URLs (prioritize requested face)
    let orderedFaces = faces;
    if (requestedFaceName) {
      const requestedLower = requestedFaceName.toLowerCase();
      const requestedFace = faces.find(f => f.name?.toLowerCase() === requestedLower);
      if (requestedFace) {
        debugLog(`[extractCardImages] Found requested face "${requestedFace.name}", prioritizing`);
        orderedFaces = [requestedFace, ...faces.filter(f => f.name?.toLowerCase() !== requestedLower)];
      }
    }

    for (const face of orderedFaces) {
      if (face.image_uris?.png) {
        debugLog(`[extractCardImages] DFC face "${face.name}": ${face.image_uris.png.substring(0, 60)}...`);
        imageUrls.push(face.image_uris.png);
      }
    }

    // 2. Generate prints in CANONICAL order (faces order from API)
    for (const face of faces) {
      if (face.image_uris?.png) {
        prints.push({
          imageUrl: face.image_uris.png,
          set: card.set ?? "",
          number: card.collector_number ?? "",
          rarity: card.rarity,
          faceName: face.name,
        });
      }
    }
  }

  debugLog(`[extractCardImages] Result: ${imageUrls.length} imageUrls, ${prints.length} prints`);
  return { imageUrls, prints };
}

/**
 * Build a ScryfallCard response from API data
 */
function buildCardResponse(
  queryName: string,
  querySet: string | undefined,
  queryNumber: string | undefined,
  card: ScryfallApiCard,
  language: string
): ScryfallCard {
  // Pass queryName to prioritize the requested face for DFCs
  const { imageUrls, prints } = extractCardImages(card, queryName);

  // Extract colors and mana_cost from top-level or first face (for DFCs)
  let colors = card.colors;
  let mana_cost = card.mana_cost;

  if ((!colors || !mana_cost) && card.card_faces && card.card_faces.length > 0) {
    if (!colors) colors = card.card_faces[0].colors;
    if (!mana_cost) mana_cost = card.card_faces[0].mana_cost;
  }

  // Use the user's requested set/number if specified, otherwise use Scryfall's values
  const responseSet = querySet || card.set;
  const responseNumber = queryNumber || card.collector_number;

  // Build card_faces for DFC support on client
  const card_faces = card.card_faces?.map(face => ({
    name: face.name ?? '',
    imageUrl: face.image_uris?.png,
  }));

  // Use canonical Scryfall name. For DFCs, find the requested face name if it matches
  let canonicalName = card.name ?? queryName;
  if (card.card_faces && card.card_faces.length > 0) {
    // Check if query matches a specific face (for DFCs like "Bala Ged Recovery // Bala Ged Sanctuary")
    const queryLower = queryName.toLowerCase();
    const matchedFace = card.card_faces.find(f => f.name?.toLowerCase() === queryLower);
    if (matchedFace && matchedFace.name) {
      canonicalName = matchedFace.name;
    } else if (card.card_faces[0].name) {
      // Default to front face name for DFCs
      canonicalName = card.card_faces[0].name;
    }
  }

  // Extract token data from all_parts
  const token_parts = extractTokenParts(card);
  const needs_token = token_parts.length > 0;

  return {
    name: canonicalName,
    set: responseSet,
    number: responseNumber,
    lang: language,
    imageUrls,
    prints,
    colors,
    mana_cost,
    cmc: card.cmc,
    type_line: card.type_line,
    rarity: card.rarity,
    card_faces,
    token_parts, // Return [] if empty so client knows it was checked
    needs_token: needs_token || undefined,
  };
}

streamRouter.post("/cards", async (req: Request, res: Response) => {
  // 1. Set SSE headers for a persistent connection
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // 2. Keep-alive pings to prevent timeouts (10s for slow networks)
  const keepAliveInterval = setInterval(() => {
    res.write(":keep-alive\n\n");
  }, 10000);

  // 3. Cleanup when the client disconnects
  let isClosed = false;
  res.on("close", () => {
    isClosed = true;
    clearInterval(keepAliveInterval);
  });

  try {
    const language = (req.body.language || "en").toLowerCase();
    const cardArt = req.body.cardArt || "art"; // "art" (default) or "prints"
    const cardQueries = normalizeCardInfos(
      Array.isArray(req.body.cardQueries) ? req.body.cardQueries : null,
      null,
      language
    );
    const total = cardQueries.length;

    // 4. Handshake: Inform the client how many cards to expect
    res.write(`event: handshake\ndata: ${JSON.stringify({ total, cardArt })}\n\n`);

    if (isClosed || total === 0) {
      res.write("event: done\ndata: {}\n\n");
      clearInterval(keepAliveInterval);
      res.end();
      return;
    }

    // 5. For "prints" mode, fetch all prints per card (for ArtworkModal)
    // For "art" mode, batch fetch for speed (for deck import)
    if (cardArt === "prints") {
      // Prints mode: Stream all prints for each card progressively
      let processed = 0;
      for (const ci of cardQueries) {
        if (isClosed) break;
        processed++;

        try {
          const allPrints = await getCardsWithImagesForCardInfo(ci, "prints", language, true);

          // Stream each print as it's found
          for (const card of allPrints) {
            if (isClosed) break;
            const printData = buildCardResponse(ci.name, card.set, card.collector_number, card, language);
            res.write(`event: print-found\ndata: ${JSON.stringify(printData)}\n\n`);
          }

          // Send progress after all prints for this card
          res.write(`event: progress\ndata: ${JSON.stringify({ processed, total, printsFound: allPrints.length })}\n\n`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[STREAM] Error for ${ci.name}:`, msg);
          res.write(`event: card-error\ndata: ${JSON.stringify({ query: ci, error: msg })}\n\n`);
        }
      }
    } else {
      // Art mode: Batch fetch for speed (original behavior)
      const preferredSets = (Array.isArray(req.body.preferredSets) ? req.body.preferredSets : []) as string[];
      // Filter out invalid set codes
      const validPreferredSets = preferredSets.filter(s => typeof s === 'string' && s.length >= 3 && s.length <= 5);

      const batchResults = await batchFetchCards(cardQueries, language, validPreferredSets);

      let processed = 0;
      for (const ci of cardQueries) {
        if (isClosed) break;
        processed++;

        try {
          let card = lookupCardFromBatch(batchResults, ci);
          debugLog(`[STREAM] Lookup for "${ci.name}":`, card ? `Found "${card.name}"` : 'Not in batch');

          // Fallback to search API if batch lookup failed
          if (!card) {
            debugLog(`[STREAM] Fallback search for "${ci.name}"...`);
            const searchResults = await getCardsWithImagesForCardInfo(ci, "art", language, true);
            debugLog(`[STREAM] Search returned ${searchResults.length} results:`, searchResults.map(c => c.name));
            if (searchResults.length > 0) {
              card = searchResults[0];
            }
          }

          if (card) {
            // Build response once - this calls extractCardImages internally
            const cardToSend = buildCardResponse(ci.name, ci.set, ci.number, card, language);

            debugLog(`[STREAM] Card data for "${ci.name}":`, {
              name: card.name,
              set: card.set,
              number: card.collector_number,
              hasImageUris: !!card.image_uris,
              hasFaces: !!card.card_faces,
              facesCount: card.card_faces?.length,
              imageUrls: cardToSend.imageUrls.slice(0, 2),
            });

            if (cardToSend.imageUrls.length > 0) {
              debugLog(`[STREAM] Sending imageUrls[0]:`, cardToSend.imageUrls[0]?.substring(0, 80) + '...');
              res.write(`event: card-found\ndata: ${JSON.stringify(cardToSend)}\n\n`);
            } else {
              throw new Error("No images found for card on Scryfall.");
            }
          } else {
            throw new Error("Card not found on Scryfall.");
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[STREAM] Error for ${ci.name}:`, msg);
          res.write(`event: card-error\ndata: ${JSON.stringify({ query: ci, error: msg })}\n\n`);
        } finally {
          res.write(`event: progress\ndata: ${JSON.stringify({ processed, total })}\n\n`);
        }
      }
    }

    // 7. Signal completion and clean up
    res.write("event: done\ndata: {}\n\n");
    clearInterval(keepAliveInterval);
    res.end();

  } catch (error: unknown) {
    console.error("[STREAM] A fatal error occurred:", error);
    res.write(`event: fatal-error\ndata: ${JSON.stringify({ message: "An unexpected server error occurred." })}\n\n`);
    clearInterval(keepAliveInterval);
    res.end();
  }
});

/**
 * POST /metadata - Batch fetch card metadata (JSON response, not SSE)
 * Used by ImportOrchestrator to enrich MPC imports without streaming overhead.
 * Request body: { cardQueries: CardInfo[], language?: string }
 * Response: { results: Array<{ query: CardInfo, card: ScryfallCard | null, error?: string }> }
 */
streamRouter.post("/metadata", async (req: Request, res: Response) => {
  try {
    const language = (req.body.language || "en").toLowerCase();
    const cardQueries = normalizeCardInfos(
      Array.isArray(req.body.cardQueries) ? req.body.cardQueries : null,
      null,
      language
    );

    if (cardQueries.length === 0) {
      res.json({ results: [] });
      return;
    }

    // Use the existing batch fetch infrastructure
    const batchResults = await batchFetchCards(cardQueries, language);

    const results: Array<{ query: { name: string; set?: string; number?: string }; card: ScryfallCard | null; error?: string }> = [];

    for (const ci of cardQueries) {
      try {
        let card = lookupCardFromBatch(batchResults, ci);

        // Fallback to individual search if not in batch
        if (!card) {
          const individualResults = await getCardsWithImagesForCardInfo(ci, "art", language);
          card = individualResults?.[0];
        }

        if (card) {
          const cardResponse = buildCardResponse(ci.name, ci.set, ci.number, card, language);
          results.push({ query: { name: ci.name, set: ci.set, number: ci.number }, card: cardResponse });
        } else {
          results.push({ query: { name: ci.name, set: ci.set, number: ci.number }, card: null, error: "Card not found" });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ query: { name: ci.name, set: ci.set, number: ci.number }, card: null, error: msg });
      }
    }

    res.json({ results });
  } catch (error: unknown) {
    console.error("[METADATA] Error:", error);
    res.status(500).json({ error: "An unexpected server error occurred." });
  }
});

export { streamRouter };

