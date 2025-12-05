"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
// __dirname is available in CommonJS
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
let mainWindow = null;
let serverPort = 3001; // Default, will be dynamic later
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    const isDev = !electron_1.app.isPackaged;
    const startUrl = isDev
        ? 'http://localhost:5173'
        : `file://${path_1.default.join(__dirname, '../client/dist/index.html')}`;
    const urlWithPort = `${startUrl}?serverPort=${serverPort}`;
    mainWindow.loadURL(urlWithPort);
    if (isDev) {
        mainWindow.webContents.openDevTools();
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
electron_1.app.whenReady().then(async () => {
    try {
        // Dynamic import to avoid build-time resolution issues for now
        // In dev, we point to the TS source (requires ts-node/tsx handling)
        // In prod, we'll need to point to the built JS
        const isDev = !electron_1.app.isPackaged;
        let startServer;
        if (isDev) {
            // Assuming we run with something that handles TS or we point to built server
            // For now, let's try importing the source directly if we run with tsx
            // @ts-ignore
            const serverPath = '../server/src/index.ts';
            const serverModule = await Promise.resolve(`${serverPath}`).then(s => __importStar(require(s)));
            startServer = serverModule.startServer;
        }
        else {
            // In prod, server should be bundled or in a known location
            // Based on server build output: server/dist/server/src/index.js
            // We copy server/dist to resources/app/server/dist
            // main.js is in resources/app/dist-electron/main.js
            // So path is ../server/dist/server/src/index.js
            const serverModule = await Promise.resolve(`${path_1.default.join(__dirname, '../server/dist/server/src/index.js')}`).then(s => __importStar(require(s)));
            startServer = serverModule.startServer;
        }
        if (startServer) {
            serverPort = await startServer(0); // 0 = random available port
            console.log('Server started on port:', serverPort);
        }
    }
    catch (err) {
        console.error('Failed to start server:', err);
    }
    electron_1.ipcMain.handle('get-server-url', () => `http://localhost:${serverPort}`);
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
