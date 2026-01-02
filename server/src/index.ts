import cors from "cors";
import express from "express";
import { fileURLToPath } from "url";
import { archidektRouter } from "./routes/archidektRouter.js";
import { moxfieldRouter } from "./routes/moxfieldRouter.js";
import { imageRouter } from "./routes/imageRouter.js";
import { streamRouter } from "./routes/streamRouter.js";
import { initDatabase } from "./db/db.js";
import { startImportScheduler } from "./services/importScheduler.js";

// Initialize database (creates tables if needed)
initDatabase();

// Start import scheduler (triggers cold-start import if needed)
startImportScheduler();

/**
 * Start the Express server on the specified port.
 * If port is 0, a random available port will be used.
 * @returns Promise resolving to the actual port the server is listening on
 */
export function startServer(port: number = 3001): Promise<number> {
  const app = express();

  app.use(cors({
    origin: (_, cb) => cb(null, true),
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }));

  app.use(express.json({ limit: "1mb" }));
  app.use("/api/archidekt", archidektRouter);
  app.use("/api/moxfield", moxfieldRouter);
  app.use("/api/cards/images", imageRouter);
  app.use("/api/stream", streamRouter);

  return new Promise((resolve) => {
    const server = app.listen(port, "0.0.0.0", () => {
      const addr = server.address();
      const actualPort = typeof addr === "string" ? port : addr?.port || port;
      console.log(`Server listening on port ${actualPort}`);
      resolve(actualPort);
    });
  });
}

// Check if run directly (not imported by Electron)
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const PORT = Number(process.env.PORT || 3001);
  startServer(PORT);
}
