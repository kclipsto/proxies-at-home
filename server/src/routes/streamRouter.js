const express = require("express");
const { getCardDataForCardInfo } = require("../utils/getCardImagesPaged");

const streamRouter = express.Router();

streamRouter.post("/cards", async (req, res) => {
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
    const cardQueries = Array.isArray(req.body.cardQueries) ? req.body.cardQueries : [];
    const language = (req.body.language || "en").toLowerCase();
    const total = cardQueries.length;

    // 4. Handshake: Inform the client how many cards to expect
    res.write(`event: handshake\ndata: ${JSON.stringify({ total })}\n\n`);
    console.log(`[STREAM] Started fetching ${total} cards.`);

    let processed = 0;
    for (const ci of cardQueries) {
      processed++;
      try {
        const cardData = await getCardDataForCardInfo(ci, language);
        if (cardData) {
          // The client needs image URLs, let's add them if they are not directly on the object
          const imageUrls = [];
          if (cardData.image_uris?.png) {
            imageUrls.push(cardData.image_uris.png);
          }
          if (Array.isArray(cardData.card_faces)) {
            for (const face of cardData.card_faces) {
              if (face.image_uris?.png) {
                imageUrls.push(face.image_uris.png);
              }
            }
          }
          const cardToSend = { ...cardData, imageUrls };
          res.write(`event: card-found\ndata: ${JSON.stringify(cardToSend)}\n\n`);
          console.log(`[STREAM] Found: ${ci.name}`);
        } else {
          throw new Error("Card not found on Scryfall.");
        }
      } catch (e) {
        console.error(`[STREAM] Error fetching ${ci.name}:`, e.message);
        res.write(`event: card-error\ndata: ${JSON.stringify({ query: ci, error: e.message })}\n\n`);
      } finally {
        res.write(`event: progress\ndata: ${JSON.stringify({ processed, total })}\n\n`);
      }
    }

    // 5. Signal completion and clean up
    res.write("event: done\ndata: {}\n\n");
    console.log("[STREAM] Completed successfully.");
    clearInterval(keepAliveInterval);
    res.end();

  } catch (error) {
    console.error("[STREAM] A fatal error occurred:", error);
    res.write(`event: fatal-error\ndata: ${JSON.stringify({ message: "An unexpected server error occurred." })}\n\n`);
    clearInterval(keepAliveInterval);
    res.end();
  }
});

module.exports = { streamRouter };
