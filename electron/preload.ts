import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    serverUrl: () => ipcRenderer.invoke('get-server-url'),
});
