import cors from "cors";
import express from "express";
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



const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
});
