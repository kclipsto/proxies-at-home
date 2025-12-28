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
