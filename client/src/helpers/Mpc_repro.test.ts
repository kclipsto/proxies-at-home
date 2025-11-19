
import { describe, it, expect } from 'vitest';

const DRIVE_ID_RE = /^[A-Za-z0-9_-]{12,}$/;

function oldExtract(s: string | null | undefined): string | undefined {
    if (!s) return undefined;
    const v = s.trim();

    if (DRIVE_ID_RE.test(v)) return v;

    if (/^https?:\/\//i.test(v)) {
        try {
            const u = new URL(v);
            const qid = u.searchParams.get("id");
            if (qid && DRIVE_ID_RE.test(qid)) return qid;

            const last = u.pathname.split("/").filter(Boolean).pop();
            if (last && DRIVE_ID_RE.test(last)) return last;
        } catch (e) {
            return undefined;
        }
    }

    return undefined;
}

function newExtract(s: string | null | undefined): string | undefined {
    if (!s) return undefined;
    const v = s.trim();

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
            return undefined;
        }
    }

    return undefined;
}

describe('extractDriveId comparison', () => {
    const urls = [
        'https://drive.google.com/file/d/123456789012/view',
        'https://drive.google.com/file/d/123456789012',
        'https://drive.google.com/open?id=123456789012',
        'https://drive.google.com/uc?id=123456789012',
        'https://drive.google.com/drive/folders/123456789012',
        'https://lh3.googleusercontent.com/d/123456789012',
        'https://drive.google.com/file/d/123456789012/preview',
        'https://drive.google.com/file/d/WRONG_ID_BUT_LONG/REAL_ID_12345', // Hypothetical
        'https://example.com/d/123456789012/other',
    ];

    urls.forEach(url => {
        it(`should compare for ${url}`, () => {
            const oldRes = oldExtract(url);
            const newRes = newExtract(url);
            console.log(`URL: ${url}\nOld: ${oldRes}\nNew: ${newRes}\nMatch: ${oldRes === newRes}`);
            if (oldRes !== newRes) {
                console.log('!!! DIFFERENCE FOUND !!!');
            }
        });
    });
});
