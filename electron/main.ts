import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';

// __dirname is available in CommonJS
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let serverPort = 3001; // Default, will be dynamic later

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    const isDev = !app.isPackaged;
    const startUrl = isDev
        ? 'http://localhost:5173'
        : `file://${path.join(__dirname, '../client/dist/index.html')}`;

    const urlWithPort = `${startUrl}?serverPort=${serverPort}`;
    mainWindow.loadURL(urlWithPort);

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(async () => {
    try {
        // Dynamic import to avoid build-time resolution issues for now
        // In dev, we point to the TS source (requires ts-node/tsx handling)
        // In prod, we'll need to point to the built JS
        const isDev = !app.isPackaged;
        let startServer;

        if (isDev) {
            // Assuming we run with something that handles TS or we point to built server
            // For now, let's try importing the source directly if we run with tsx
            // @ts-ignore
            const serverPath = '../server/src/index.ts';
            const serverModule = await import(serverPath);
            startServer = serverModule.startServer;
        } else {
            // In prod, server should be bundled or in a known location
            // Based on server build output: server/dist/server/src/index.js
            // We copy server/dist to resources/app/server/dist
            // main.js is in resources/app/dist-electron/main.js
            // So path is ../server/dist/server/src/index.js
            const serverModule = await import(path.join(__dirname, '../server/dist/server/src/index.js'));
            startServer = serverModule.startServer;
        }

        if (startServer) {
            serverPort = await startServer(0); // 0 = random available port
            console.log('Server started on port:', serverPort);
        }
    } catch (err) {
        console.error('Failed to start server:', err);
    }

    ipcMain.handle('get-server-url', () => `http://localhost:${serverPort}`);

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
