/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'swiper/css';
declare module 'swiper/css/effect-coverflow';
declare global {
  interface Window {
    electronAPI?: {
      serverUrl: () => Promise<string>;
    };
  }
}
