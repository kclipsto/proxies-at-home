import express, { type Request, type Response } from "express";
import { getCardsWithImagesForCardInfo } from "../utils/getCardImagesPaged.js";
import { normalizeCardInfos } from "../utils/cardUtils.js";
import { type ScryfallCard } from "../../../shared/types.js";

const streamRouter = express.Router();

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
    console.log(`[STREAM] Started fetching ${total} cards.`);

    let processed = 0;
    for (const ci of cardQueries) {
      if (isClosed) {
        console.log("[STREAM] Aborting fetch loop due to client disconnect.");
        break;
      }
      processed++;
      try {
        // Fetch all unique arts for the card (default behavior)
        const scryfallCards = await getCardsWithImagesForCardInfo(ci, "art", language);

        if (scryfallCards && scryfallCards.length > 0) {
          // We might get multiple cards (arts). We need to send them.
          // The current API expects one "card-found" event per card query, 
          // but with multiple image URLs.
          // We need to aggregate the image URLs, but what about metadata?
          // Usually metadata is shared across arts (except maybe flavor text/artist).
          // Colors, CMC, Type should be consistent.

          const primaryCard = scryfallCards[0];
          const imageUrls: string[] = [];

          for (const c of scryfallCards) {
            if (c.image_uris?.png) {
              imageUrls.push(c.image_uris.png);
            } else if (c.card_faces) {
              for (const face of c.card_faces) {
                if (face.image_uris?.png) {
                  imageUrls.push(face.image_uris.png);
                }
              }
            }
          }

          if (imageUrls.length > 0) {
            // Extract colors and mana_cost from top-level or first face (for DFCs)
            let colors = primaryCard.colors;
            let mana_cost = primaryCard.mana_cost;

            if ((!colors || !mana_cost) && primaryCard.card_faces && primaryCard.card_faces.length > 0) {
              if (!colors) colors = primaryCard.card_faces[0].colors;
              if (!mana_cost) mana_cost = primaryCard.card_faces[0].mana_cost;
            }

            const cardToSend: ScryfallCard = {
              name: ci.name,
              set: primaryCard.set,
              number: primaryCard.collector_number,
              lang: language,
              imageUrls,
              colors: colors,
              mana_cost: mana_cost,
              cmc: primaryCard.cmc,
              type_line: primaryCard.type_line,
              rarity: primaryCard.rarity,
            };
            res.write(`event: card-found\ndata: ${JSON.stringify(cardToSend)}\n\n`);
            console.log(`[STREAM] Found ${imageUrls.length} arts for: ${ci.name}`);
          } else {
            throw new Error("No images found for card on Scryfall.");
          }
        } else {
          throw new Error("Card not found on Scryfall.");
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[STREAM] Error fetching ${ci.name}:`, msg);
        res.write(`event: card-error\ndata: ${JSON.stringify({ query: ci, error: msg })}\n\n`);
      } finally {
        res.write(`event: progress\ndata: ${JSON.stringify({ processed, total })}\n\n`);
      }
    }

    // 5. Signal completion and clean up
    res.write("event: done\ndata: {}\n\n");
    console.log("[STREAM] Completed successfully.");
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
