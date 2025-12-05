import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    serverUrl: () => ipcRenderer.invoke('get-server-url'),
    onUpdateStatus: (callback: (status: string, info?: any) => void) => {
        ipcRenderer.on('update-status', (_event, status, info) => callback(status, info));
    },
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
});
