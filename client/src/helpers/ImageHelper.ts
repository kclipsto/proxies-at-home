import { API_BASE } from "../constants";
import {
  toProxied as toProxiedBase,
  fetchWithRetry as fetchWithRetryBase,
  getBleedInPixels as getBleedInPixelsBase,
} from "./imageProcessing";

const DPI = 300;

export function toProxied(url: string) {
  return toProxiedBase(url, API_BASE);
}

export function getBleedInPixels(bleedEdgeWidth: number, unit: string): number {
  return getBleedInPixelsBase(bleedEdgeWidth, unit, DPI);
}

export function getLocalBleedImageUrl(originalUrl: string): string {
  return toProxied(originalUrl);
}

export async function urlToDataUrl(url: string): Promise<string> {
  const resp = await fetch(toProxied(url));
  if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}

export function pngToNormal(pngUrl: string) {
  try {
    const u = new URL(pngUrl);
    if (u.hostname.endsWith("scryfall.io")) {
      u.pathname = u.pathname.replace("/png/", "/normal/").replace(/\.png$/i, ".jpg");
    }
    return u.toString();
  } catch {
    return pngUrl;
  }
}

export async function fetchWithRetry(url: string, retries = 3, baseDelay = 250): Promise<Response> {
  return fetchWithRetryBase(url, retries, baseDelay);
}