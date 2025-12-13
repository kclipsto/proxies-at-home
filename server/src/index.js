"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const imageRouter_js_1 = require("./routes/imageRouter.js");
const streamRouter_js_1 = require("./routes/streamRouter.js");
const url_1 = require("url");
function startServer(port = 3001) {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)({
        origin: (_, cb) => cb(null, true),
        methods: ["GET", "POST", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        maxAge: 86400,
    }));
    app.use(express_1.default.json({ limit: "1mb" }));
    app.use("/api/cards/images", imageRouter_js_1.imageRouter);
    app.use("/api/stream", streamRouter_js_1.streamRouter);
    return new Promise((resolve) => {
        const server = app.listen(port, "0.0.0.0", () => {
            const addr = server.address();
            const actualPort = typeof addr === 'string' ? port : addr?.port || port;
            console.log(`Server listening on port ${actualPort}`);
            resolve(actualPort);
        });
    });
}
// Check if run directly
const __filename = (0, url_1.fileURLToPath)(import.meta.url);
if (process.argv[1] === __filename) {
    const PORT = Number(process.env.PORT || 3001);
    startServer(PORT);
}
