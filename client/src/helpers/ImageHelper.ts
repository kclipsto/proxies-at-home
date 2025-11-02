import { API_BASE } from "../constants";

const DPI = 300;
const IN = (inches: number) => Math.round(inches * DPI);

export function toProxied(url: string) {
  if (!url) return url;
  if (url.startsWith("data:")) return url;
  const prefix = `${API_BASE}/api/cards/images/proxy?url=`;
  if (url.startsWith(prefix)) return url;
  return `${prefix}${encodeURIComponent(url)}`;
}

export function getBleedInPixels(bleedEdgeWidth: number, unit: string): number {
  return unit === "mm" ? IN(bleedEdgeWidth / 25.4) : IN(bleedEdgeWidth);
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
    u.pathname = u.pathname.replace("/png/", "/normal/").replace(/\.png$/i, ".jpg");
    return u.toString();
  } catch {
    return pngUrl;
  }
}

async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type = "image/png",
  quality?: number
): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return (canvas as any).convertToBlob({ type, quality });
  }
  return await new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      type,
      quality
    );
  });
}

async function canvasToObjectUrl(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type = "image/png",
  quality?: number
): Promise<string> {
  const blob = await canvasToBlob(canvas, type, quality);
  return URL.createObjectURL(blob);
}


