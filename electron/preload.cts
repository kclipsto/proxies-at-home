const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    serverUrl: () => ipcRenderer.invoke('get-server-url'),
    onUpdateStatus: (callback: (status: string, info?: unknown) => void) => {
        ipcRenderer.on('update-status', (_event: unknown, status: string, info: unknown) => callback(status, info));
    },
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
});
