/// <reference types="vite/client" />
const fromEnv = import.meta.env.VITE_API_BASE;

// Check for Electron's dynamic server port passed via URL query
const serverPort = new URLSearchParams(window.location.search).get("serverPort");
const localServerUrl = serverPort ? `http://localhost:${serverPort}` : "";

export const API_BASE =
  localServerUrl ||
  (fromEnv && fromEnv.replace(/\/$/, "")) ||
  (import.meta.env.DEV ? "" : "");

// Helper to safely prefix with API_BASE (or keep relative)
export const apiUrl = (path: string) => {
  const base = API_BASE?.replace(/\/+$/, "") || "";
  const cleanPath = path.replace(/^\/+/, "");
  return base ? `${base}/${cleanPath}` : `/${cleanPath}`;
};

export const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "ru", label: "Русский" },
  { code: "zhs", label: "简体中文" },
  { code: "zht", label: "繁體中文" },
];