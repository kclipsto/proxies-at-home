import { API_BASE } from "../constants";

export function inferCardNameFromFilename(filename: string): string {
  const noExt = filename.replace(/\.[a-z0-9]+$/i, "");
  const beforeParen = noExt.split("(")[0];
  const cleaned = beforeParen
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned;
}

export function getMpcImageUrl(frontId?: string | null, size: "small" | "large" | "full" = "full"): string | null {
  if (!frontId) return null;
  // Omit size param when "full" to maintain cache compatibility with legacy URLs
  const sizeParam = size === "full" ? "" : `&size=${size}`;
  return `${API_BASE}/api/cards/images/mpc?id=${encodeURIComponent(frontId)}${sizeParam}`;
}

export function extractDriveId(
  s: string | null | undefined
): string | undefined {
  if (!s) return undefined;
  const v = s.trim();
  const DRIVE_ID_RE = /^[A-Za-z0-9_-]{12,}$/;

  if (DRIVE_ID_RE.test(v)) return v;

  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      const qid = u.searchParams.get("id");
      if (qid && DRIVE_ID_RE.test(qid)) return qid;

      const pathParts = u.pathname.split("/").filter(Boolean);
      const dIndex = pathParts.indexOf("d");
      if (dIndex !== -1 && dIndex < pathParts.length - 1) {
        const id = pathParts[dIndex + 1];
        if (DRIVE_ID_RE.test(id)) {
          return id;
        }
      }

      const last = u.pathname.split("/").filter(Boolean).pop();
      if (last && DRIVE_ID_RE.test(last)) return last;
    } catch (e) {
      console.error("Error in extractDriveId:", e);
      return undefined;
    }
  }

  return undefined;
}
