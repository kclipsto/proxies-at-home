import express, { type Request, type Response } from "express";
import { getImagesForCardInfo } from "../utils/getCardImagesPaged";
import { normalizeCardInfos } from "../utils/cardUtils";
import { type ScryfallCard } from "../../../shared/types";

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
  req.on("close", () => {
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
      processed++;
      try {
        // Fetch all unique arts for the card (default behavior)
        const imageUrls = await getImagesForCardInfo(ci, "art", language);
        if (imageUrls && imageUrls.length > 0) {
          const cardToSend: ScryfallCard = {
            name: ci.name,
            set: ci.set,
            number: ci.number,
            lang: language,
            imageUrls,
          };
          res.write(`event: card-found\ndata: ${JSON.stringify(cardToSend)}\n\n`);
          console.log(`[STREAM] Found ${imageUrls.length} arts for: ${ci.name}`);
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
