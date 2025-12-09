import express, { type Request, type Response } from "express";
import { batchFetchCards, lookupCardFromBatch, getCardsWithImagesForCardInfo, type ScryfallApiCard } from "../utils/getCardImagesPaged.js";
import { normalizeCardInfos } from "../utils/cardUtils.js";
import { type ScryfallCard } from "../../../shared/types.js";

const streamRouter = express.Router();

/**
 * Extract image URLs and prints from a Scryfall API card
 */
function extractCardImages(card: ScryfallApiCard): {
  imageUrls: string[];
  prints: Array<{ imageUrl: string; set: string; number: string; rarity?: string }>;
} {
  const imageUrls: string[] = [];
  const prints: Array<{ imageUrl: string; set: string; number: string; rarity?: string }> = [];

  if (card.image_uris?.png) {
    imageUrls.push(card.image_uris.png);
    prints.push({
      imageUrl: card.image_uris.png,
      set: card.set ?? "",
      number: card.collector_number ?? "",
      rarity: card.rarity,
    });
  } else if (card.card_faces) {
    for (const face of card.card_faces) {
      if (face.image_uris?.png) {
        imageUrls.push(face.image_uris.png);
        prints.push({
          imageUrl: face.image_uris.png,
          set: card.set ?? "",
          number: card.collector_number ?? "",
          rarity: card.rarity,
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
  const { imageUrls, prints } = extractCardImages(card);

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

  return {
    name: queryName,
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
  };
}

streamRouter.post("/cards", async (req: Request, res: Response) => {
  // 1. Set SSE headers for a persistent connection
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  console.log("[STREAM] Connection opened.");

  // 2. Keep-alive pings to prevent timeouts
  const keepAliveInterval = setInterval(() => {
    res.write(":keep-alive\n\n");
  }, 15000);

  // 3. Cleanup when the client disconnects
  let isClosed = false;
  res.on("close", () => {
    isClosed = true;
    clearInterval(keepAliveInterval);
    console.log("[STREAM] Connection closed by client.");
  });

  try {
    const language = (req.body.language || "en").toLowerCase();
    const cardQueries = normalizeCardInfos(
      Array.isArray(req.body.cardQueries) ? req.body.cardQueries : null,
      null,
      language
    );
    const total = cardQueries.length;

    // 4. Handshake: Inform the client how many cards to expect
    res.write(`event: handshake\ndata: ${JSON.stringify({ total })}\n\n`);
    console.log(`[STREAM] Started fetching ${total} cards using batch API.`);

    if (isClosed || total === 0) {
      res.write("event: done\ndata: {}\n\n");
      clearInterval(keepAliveInterval);
      res.end();
      return;
    }

    // 5. BATCH FETCH: Get all cards in a single API call (or batches of 75)
    const startTime = Date.now();
    const batchResults = await batchFetchCards(cardQueries, language);
    console.log(`[STREAM] Batch fetch completed in ${Date.now() - startTime}ms`);

    // 6. Stream results to client
    let processed = 0;
    for (const ci of cardQueries) {
      if (isClosed) {
        console.log("[STREAM] Aborting stream due to client disconnect.");
        break;
      }
      processed++;

      try {
        let card = lookupCardFromBatch(batchResults, ci);

        // Fallback to search API if batch lookup failed
        // This handles DFCs where the front face name doesn't match collection API
        if (!card) {
          console.log(`[STREAM] Batch lookup failed for ${ci.name}, trying search fallback...`);
          const searchResults = await getCardsWithImagesForCardInfo(ci, "art", language, true);
          if (searchResults.length > 0) {
            card = searchResults[0];
            console.log(`[STREAM] Search fallback found: ${card.name}`);
          }
        }

        if (card) {
          const { imageUrls } = extractCardImages(card);

          if (imageUrls.length > 0) {
            const cardToSend = buildCardResponse(ci.name, ci.set, ci.number, card, language);
            res.write(`event: card-found\ndata: ${JSON.stringify(cardToSend)}\n\n`);
            console.log(`[STREAM] Found: ${ci.name}${ci.set ? ` (${ci.set})` : ''}${ci.number ? ` ${ci.number}` : ''}`);
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

    // 7. Signal completion and clean up
    res.write("event: done\ndata: {}\n\n");
    console.log(`[STREAM] Completed successfully. Total time: ${Date.now() - startTime}ms`);
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

