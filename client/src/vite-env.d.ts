/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'swiper/css';
declare module 'swiper/css/effect-coverflow';

// Allow importing files as raw strings
declare module '*?raw' {
  const content: string;
  export default content;
}

// Electron auto-updater types
interface UpdateInfo {
  version: string;
  files: Array<{ url: string; sha512: string; size: number }>;
  path: string;
  sha512: string;
  releaseName?: string;
  releaseDate: string;
  releaseNotes?: string | Array<unknown>;
}

interface ProgressInfo {
  total: number;
  delta: number;
  transferred: number;
  percent: number;
  bytesPerSecond: number;
}

type UpdateStatus = 'checking' | 'available' | 'not-available' | 'error' | 'downloading' | 'downloaded';

type UpdateEventInfo = UpdateInfo | ProgressInfo | string | null;

interface Window {
  electronAPI?: {
    serverUrl: () => Promise<string>;
    onUpdateStatus: (callback: (status: UpdateStatus, info?: UpdateEventInfo) => void) => void;
    checkForUpdates: () => Promise<void>;
    downloadUpdate: () => Promise<void>;
    installUpdate: () => Promise<void>;
  };
}
