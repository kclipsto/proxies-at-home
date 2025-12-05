import { app, BrowserWindow, ipcMain, nativeTheme, dialog, Menu, MenuItemConstructorOptions } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

// Handle ESM imports for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let serverPort = 3001; // Default port, will be updated if server starts successfully

// Auto-updater logging
autoUpdater.logger = console;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, '../../client/public/pwa-512x512.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // Force system theme
    nativeTheme.themeSource = 'system';

    const isDev = !app.isPackaged;

    if (isDev) {
        const url = `http://localhost:5173?serverPort=${serverPort}`;
        mainWindow.loadURL(url);
    } else {
        // In prod, main.js is in electron/dist/, so we need to go up two levels to find client/dist/
        mainWindow.loadFile(path.join(__dirname, '../../client/dist/index.html'), {
            query: { serverPort: serverPort.toString() }
        });
    }

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    // Create Menu
    const template: MenuItemConstructorOptions[] = [
        {
            label: 'File',
            submenu: [
                { role: 'quit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'delete' },
                { role: 'selectAll' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Check for Updates',
                    click: () => {
                        autoUpdater.checkForUpdatesAndNotify();
                    }
                }
            ]
        }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    // Check for updates on startup
    if (app.isPackaged) {
        autoUpdater.checkForUpdatesAndNotify();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// IPC Handlers for Auto-Updater
ipcMain.handle('check-for-updates', () => {
    if (app.isPackaged) {
        return autoUpdater.checkForUpdatesAndNotify();
    }
    return null;
});

ipcMain.handle('download-update', () => {
    return autoUpdater.downloadUpdate();
});

ipcMain.handle('install-update', () => {
    return autoUpdater.quitAndInstall();
});

// Forward auto-updater events to renderer
autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update-status', 'checking');
});

autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-status', 'available', info);
});

autoUpdater.on('update-not-available', (info) => {
    mainWindow?.webContents.send('update-status', 'not-available', info);
});

autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('update-status', 'error', err.toString());
});

autoUpdater.on('download-progress', (progressObj) => {
    mainWindow?.webContents.send('update-status', 'downloading', progressObj);
});

autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-status', 'downloaded', info);
});

app.whenReady().then(async () => {
    // Start the Express server
    let startServer;
    const isDev = !app.isPackaged;

    try {
        // Dynamic import to avoid build-time resolution issues for now
        // In dev, we point to the TS source (requires ts-node/tsx handling)
        // In prod, we'll need to point to the built JS
        if (isDev) {
            // In dev, we also use the built server to avoid TS/ESM issues with direct source import
            // Ensure 'npm run build --prefix server' is run before this
            const serverPath = path.join(__dirname, '../../server/dist/server/src/index.js');
            const serverModule = await import(pathToFileURL(serverPath).href);
            console.log('Dev Server Module Keys:', Object.keys(serverModule));
            startServer = serverModule.startServer;
        } else {
            // In prod, server should be bundled or in a known location
            // Based on server build output: server/dist/server/src/index.js
            // We copy server/dist to resources/app/server/dist
            // main.js is in resources/app/dist-electron/main.js
            // So path is ../server/dist/server/src/index.js
            // In prod, server is at root/server/dist
            // main.js is at root/electron/dist
            // So path is ../../server/dist/server/src/index.js
            const serverPath = path.join(__dirname, '../../server/dist/server/src/index.js');
            const serverModule = await import(pathToFileURL(serverPath).href);
            console.log('Prod Server Module Keys:', Object.keys(serverModule));
            startServer = serverModule.startServer;
        }

        if (startServer) {
            serverPort = await startServer(0); // 0 = random available port
            console.log('Server started on port:', serverPort);
        }
    } catch (err: any) {
        console.error('Failed to start server:', err);
        dialog.showErrorBox('Server Error', `Failed to start server:\n${err.message}\n${err.stack}`);
    }

    ipcMain.handle('get-server-url', () => `http://localhost:${serverPort}`);

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// Ensure server is killed when app quits
app.on('before-quit', () => {
    // If we had a handle to the server instance, we could close it here.
    // Since it's in-process, it will die with the app.
});
