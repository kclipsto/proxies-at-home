import { Router } from 'express';
import { randomBytes, createHash } from 'crypto';
import { getDatabase } from '../db/db.js';
import { gzipSync, gunzipSync } from 'zlib';

const router = Router();

// TTL in milliseconds (30 days)
const SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Generate a random 8-character alphanumeric ID.
 * Uses crypto.randomBytes for secure random generation.
 */
function generateShareId(): string {
    // 6 bytes = 48 bits = 8 base64url characters
    return randomBytes(6).toString('base64url');
}

/**
 * Generate a stable 8-character ID from projectId.
 * Same projectId always produces same share ID.
 */
function projectIdToShareId(projectId: string): string {
    return createHash('sha256')
        .update(projectId)
        .digest('base64url')
        .substring(0, 8);
}

/**
 * Clean up expired shares.
 * Called on router init and can be called periodically.
 */
export function cleanupExpiredShares(): number {
    const db = getDatabase();
    const now = Date.now();
    const result = db.prepare('DELETE FROM shares WHERE expires_at < ?').run(now);
    if (result.changes > 0) {
        console.log(`[Share] Cleaned up ${result.changes} expired shares`);
    }
    return result.changes;
}

/**
 * POST /api/share
 * Create or update a share from JSON data.
 * If projectId is provided, uses stable ID (UPSERT). Otherwise generates random ID.
 * Request body: { data: object, projectId?: string }
 * Response: { id: string, expiresAt: number }
 */
router.post('/', (req, res) => {
    try {
        const { data, projectId } = req.body;

        if (!data || typeof data !== 'object') {
            res.status(400).json({ error: 'Missing or invalid data' });
            return;
        }

        const db = getDatabase();
        const now = Date.now();
        const expiresAt = now + SHARE_TTL_MS;

        // Serialize and compress
        const jsonStr = JSON.stringify(data);
        const compressed = gzipSync(Buffer.from(jsonStr, 'utf-8'));

        let id: string;

        if (projectId && typeof projectId === 'string') {
            // Stable ID from projectId - use UPSERT
            id = projectIdToShareId(projectId);

            // UPSERT: update if exists, insert if not
            const existing = db.prepare('SELECT id FROM shares WHERE id = ?').get(id);
            if (existing) {
                db.prepare(
                    'UPDATE shares SET data = ?, expires_at = ? WHERE id = ?'
                ).run(compressed, expiresAt, id);
                console.log(`[Share] Updated share ${id} (${compressed.length} bytes)`);
            } else {
                db.prepare(
                    'INSERT INTO shares (id, data, created_at, expires_at) VALUES (?, ?, ?, ?)'
                ).run(id, compressed, now, expiresAt);
                console.log(`[Share] Created share ${id} (${compressed.length} bytes)`);
            }
        } else {
            // Random ID (legacy behavior)
            id = generateShareId();
            let attempts = 0;
            const checkStmt = db.prepare('SELECT id FROM shares WHERE id = ?');

            while (checkStmt.get(id) && attempts < 10) {
                id = generateShareId();
                attempts++;
            }

            if (attempts >= 10) {
                res.status(500).json({ error: 'Failed to generate unique ID' });
                return;
            }

            db.prepare(
                'INSERT INTO shares (id, data, created_at, expires_at) VALUES (?, ?, ?, ?)'
            ).run(id, compressed, now, expiresAt);
            console.log(`[Share] Created share ${id} (${compressed.length} bytes)`);
        }

        res.json({
            id,
            expiresAt,
        });
    } catch (error) {
        console.error('[Share] Error creating share:', error);
        res.status(500).json({ error: 'Failed to create share' });
    }
});

/**
 * GET /api/share/:id
 * Retrieve a share and refresh its TTL.
 * Response: { data: object, expiresAt: number }
 */
router.get('/:id', (req, res) => {
    try {
        const { id } = req.params;

        if (!id || id.length !== 8) {
            res.status(400).json({ error: 'Invalid share ID' });
            return;
        }

        const db = getDatabase();
        const row = db.prepare('SELECT data, expires_at FROM shares WHERE id = ?').get(id) as
            | { data: Buffer; expires_at: number }
            | undefined;

        if (!row) {
            res.status(404).json({ error: 'Share not found or expired' });
            return;
        }

        // Check if expired
        const now = Date.now();
        if (row.expires_at < now) {
            // Clean up this expired share
            db.prepare('DELETE FROM shares WHERE id = ?').run(id);
            res.status(404).json({ error: 'Share not found or expired' });
            return;
        }

        // Refresh TTL (rolling expiration)
        const newExpiresAt = now + SHARE_TTL_MS;
        db.prepare('UPDATE shares SET expires_at = ? WHERE id = ?').run(newExpiresAt, id);

        // Decompress and parse
        const decompressed = gunzipSync(row.data).toString('utf-8');
        const data = JSON.parse(decompressed);

        res.json({
            data,
            expiresAt: newExpiresAt,
        });
    } catch (error) {
        console.error('[Share] Error retrieving share:', error);
        res.status(500).json({ error: 'Failed to retrieve share' });
    }
});

export { router as shareRouter };
