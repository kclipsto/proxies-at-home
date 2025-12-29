const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    serverUrl: () => ipcRenderer.invoke('get-server-url'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getUpdateChannel: () => ipcRenderer.invoke('get-update-channel'),
    setUpdateChannel: (channel: string) => ipcRenderer.invoke('set-update-channel', channel),
    getAutoUpdateEnabled: () => ipcRenderer.invoke('get-auto-update-enabled'),
    setAutoUpdateEnabled: (enabled: boolean) => ipcRenderer.invoke('set-auto-update-enabled', enabled),
    onUpdateStatus: (callback: (status: string, info?: unknown) => void) => {
        ipcRenderer.on('update-status', (_event: unknown, status: string, info: unknown) => callback(status, info));
    },
    onShowAbout: (callback: () => void) => {
        ipcRenderer.on('show-about', () => callback());
    },
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
});
