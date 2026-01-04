import { app, BrowserWindow, ipcMain, nativeTheme, dialog, Menu, MenuItemConstructorOptions } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

// Settings file for persistent electron-specific settings
function getSettingsPath() {
    return path.join(app.getPath('userData'), 'electron-settings.json');
}

function loadElectronSettings(): { autoUpdateEnabled?: boolean, updateChannel?: string } {
    try {
        const settingsPath = getSettingsPath();
        if (fs.existsSync(settingsPath)) {
            return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        }
    } catch (e) {
        console.error('[Electron] Failed to load settings:', e);
    }
    return {};
}

function saveElectronSettings(settings: { autoUpdateEnabled?: boolean, updateChannel?: string }) {
    try {
        const settingsPath = getSettingsPath();
        const existing = loadElectronSettings();
        fs.writeFileSync(settingsPath, JSON.stringify({ ...existing, ...settings }, null, 2));
    } catch (e) {
        console.error('[Electron] Failed to save settings:', e);
    }
}

// Handle ESM imports for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global error handlers to catch silent crashes
process.on('uncaughtException', (error) => {
    const logPath = path.join(app.getPath('userData'), 'crash.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] Uncaught Exception: ${error.stack || error}\n`);
    console.error('Uncaught Exception:', error);
    dialog.showErrorBox('Uncaught Exception', error.stack || error.toString());
});

process.on('unhandledRejection', (reason) => {
    const logPath = path.join(app.getPath('userData'), 'crash.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] Unhandled Rejection: ${reason}\n`);
    console.error('Unhandled Rejection:', reason);
});

let mainWindow: BrowserWindow | null = null;
let serverPort = 3001; // Default port, will be updated if server starts successfully

// Auto-updater logging
autoUpdater.logger = console;

// Configure update channel based on user preference or version
// Users can choose: 'latest' (all updates) or 'stable' (major versions only)
function configureUpdateChannel() {
    const settings = loadElectronSettings();

    // Check if user has set a specific channel
    if (settings.updateChannel === 'stable' || settings.updateChannel === 'latest') {
        autoUpdater.channel = settings.updateChannel;
        console.log(`[Electron] Update channel: ${settings.updateChannel} (user preference)`);
        return;
    }

    // Default to 'latest' channel for all users
    autoUpdater.channel = 'latest';
    console.log('[Electron] Update channel: latest (default)');
}

function createWindow() {
    const isDev = !app.isPackaged;

    // In production, most files are inside app.asar
    // Use path.join(__dirname, ...) for asar-packed files
    // Use process.resourcesPath for extraResources (unpacked files)
    const iconPath = isDev
        ? path.join(__dirname, '../../client/public/pwa-512x512.png')
        : path.join(process.resourcesPath, 'app.asar', 'client', 'dist', 'pwa-512x512.png');

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        icon: iconPath,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // Force system theme
    nativeTheme.themeSource = 'system';

    if (isDev) {
        const url = `http://localhost:5173?serverPort=${serverPort}`;
        mainWindow.loadURL(url);
    } else {
        // In prod with asar, __dirname is electron/dist/, need ../../ to reach root
        const indexPath = path.join(__dirname, '../../client/dist/index.html');
        console.log('[Electron] Loading index from:', indexPath);
        mainWindow.loadFile(indexPath, {
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
                    label: 'About Proxxied',
                    click: () => {
                        mainWindow?.webContents.send('show-about');
                    }
                },
                { type: 'separator' },
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

    // Check for updates on startup (if enabled)
    if (app.isPackaged) {
        configureUpdateChannel();
        const settings = loadElectronSettings();
        if (settings.autoUpdateEnabled !== false) { // Default to enabled
            autoUpdater.checkForUpdatesAndNotify();
        } else {
            console.log('[Electron] Auto-update check disabled by user');
        }
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

autoUpdater.on('update-available', (info: unknown) => {
    mainWindow?.webContents.send('update-status', 'available', info);
});

autoUpdater.on('update-not-available', (info: unknown) => {
    mainWindow?.webContents.send('update-status', 'not-available', info);
});

autoUpdater.on('error', (err: Error) => {
    mainWindow?.webContents.send('update-status', 'error', err.toString());
});

autoUpdater.on('download-progress', (progressObj: unknown) => {
    mainWindow?.webContents.send('update-status', 'downloading', progressObj);
});

autoUpdater.on('update-downloaded', (info: unknown) => {
    mainWindow?.webContents.send('update-status', 'downloaded', info);
});

app.whenReady().then(async () => {
    // Start the Express server inside Electron's process
    // This makes the app standalone (no Node.js required on user machine)
    const isDev = !app.isPackaged;

    // In dev, use relative path from electron/dist/
    // In production, server is in extraResources (resources/server/)
    let serverDir: string;
    let serverScript: string;
    if (isDev) {
        serverDir = path.join(__dirname, '../../server');
        serverScript = path.join(serverDir, 'dist/server/src/index.js');
    } else {
        // extraResources are copied to the resources folder
        serverDir = path.join(process.resourcesPath, 'server');
        serverScript = path.join(serverDir, 'dist/server/src/index.js');
    }

    // Log paths for debugging
    console.log('[Electron] Server dir:', serverDir);
    console.log('[Electron] Server script:', serverScript);
    console.log('[Electron] Script exists:', fs.existsSync(serverScript));

    try {
        // Dynamic import to run server in Electron's process
        const serverModule = await import(pathToFileURL(serverScript).href);
        console.log('[Electron] Server Module Keys:', Object.keys(serverModule));
        const startServer = serverModule.startServer;

        if (startServer) {
            serverPort = await startServer(0); // 0 = random available port
            console.log('[Electron] Server started on port:', serverPort);
        } else {
            console.error('[Electron] startServer function not found in server module');
        }
    } catch (err: unknown) {
        console.error('[Electron] Failed to start server:', err);
        const errorMessage = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
        dialog.showErrorBox('Server Error', `Failed to start server:\n${errorMessage}`);
    }

    ipcMain.handle('get-server-url', () => `http://localhost:${serverPort}`);
    ipcMain.handle('get-app-version', () => app.getVersion());
    ipcMain.handle('get-update-channel', () => autoUpdater.channel || 'latest');
    ipcMain.handle('set-update-channel', (_event, channel: string) => {
        if (channel === 'stable' || channel === 'latest') {
            autoUpdater.channel = channel;
            saveElectronSettings({ updateChannel: channel });
            console.log(`[Electron] Update channel changed to: ${channel}`);
            return true;
        }
        return false;
    });
    ipcMain.handle('get-auto-update-enabled', () => {
        const settings = loadElectronSettings();
        return settings.autoUpdateEnabled !== false; // Default to true
    });
    ipcMain.handle('set-auto-update-enabled', (_event, enabled: boolean) => {
        saveElectronSettings({ autoUpdateEnabled: enabled });
        console.log(`[Electron] Auto-update enabled: ${enabled}`);
        return true;
    });
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
