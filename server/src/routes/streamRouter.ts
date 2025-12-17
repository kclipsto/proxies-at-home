import express, { type Request, type Response } from "express";
import { batchFetchCards, lookupCardFromBatch, getCardsWithImagesForCardInfo, type ScryfallApiCard } from "../utils/getCardImagesPaged.js";
import { normalizeCardInfos } from "../utils/cardUtils.js";
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

  if (card.image_uris?.png) {
    // Non-DFC card
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

    // 1. Generate Image URLs (prioritize requested face)
    let orderedFaces = faces;
    if (requestedFaceName) {
      const requestedLower = requestedFaceName.toLowerCase();
      const requestedFace = faces.find(f => f.name?.toLowerCase() === requestedLower);
      if (requestedFace) {
        orderedFaces = [requestedFace, ...faces.filter(f => f.name?.toLowerCase() !== requestedLower)];
      }
    }

    for (const face of orderedFaces) {
      if (face.image_uris?.png) {
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
  };
}

streamRouter.post("/cards", async (req: Request, res: Response) => {
  // 1. Set SSE headers for a persistent connection
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // 2. Keep-alive pings to prevent timeouts
  const keepAliveInterval = setInterval(() => {
    res.write(":keep-alive\n\n");
  }, 15000);

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
      const batchResults = await batchFetchCards(cardQueries, language);

      let processed = 0;
      for (const ci of cardQueries) {
        if (isClosed) break;
        processed++;

        try {
          let card = lookupCardFromBatch(batchResults, ci);

          // Fallback to search API if batch lookup failed
          if (!card) {
            const searchResults = await getCardsWithImagesForCardInfo(ci, "art", language, true);
            if (searchResults.length > 0) {
              card = searchResults[0];
            }
          }

          if (card) {
            const { imageUrls } = extractCardImages(card, ci.name);

            if (imageUrls.length > 0) {
              const cardToSend = buildCardResponse(ci.name, ci.set, ci.number, card, language);
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

export { streamRouter };

