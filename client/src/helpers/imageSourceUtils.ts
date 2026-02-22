import { db, type ImageSource } from '../db';
import { extractMpcIdentifierFromImageId } from './mpcAutofillApi';

/**
 * Infer image source from ID patterns (legacy support).
 * Used for lazy migration of existing data.
 * @deprecated Use explicit source field instead when possible
 */
export function inferImageSource(imageId?: string): ImageSource | null {
    if (!imageId) return null;

    // Check for known prefixes
    if (imageId.startsWith('cardback_')) return 'cardback';
    if (imageId.startsWith('scryfall_') || imageId.startsWith('local_')) return 'scryfall';

    // Check for SHA-256 hash pattern (custom uploads) - with optional suffix
    if (/^[a-f0-9]{64}(-[a-z]+)?$/i.test(imageId)) return 'upload-library';

    // Check URL patterns
    if (imageId.includes('scryfall')) return 'scryfall';
    if (imageId.includes('/api/cards/images/mpc')) return 'mpc';

    // Check for MPC Drive ID using existing utility
    if (extractMpcIdentifierFromImageId(imageId) !== null) return 'mpc';

    return null;
}

/**
 * Infer source from a URL (for remote images).
 */
export function inferSourceFromUrl(url?: string): ImageSource | null {
    if (!url) return null;

    if (url.includes('scryfall')) return 'scryfall';
    if (url.includes('/api/cards/images/mpc')) return 'mpc';

    return null;
}

/**
 * Get the source of an image - uses explicit field if set,
 * otherwise infers from ID and updates the record (lazy migration).
 */
export async function getImageSource(imageId: string): Promise<ImageSource | null> {
    const image = await db.images.get(imageId);
    if (!image) return null;

    // If source is already set, return it
    if (image.source) return image.source;

    // Infer source from ID patterns
    const inferred = inferImageSource(imageId);

    // Lazy migration: update the record for next time
    if (inferred) {
        await db.images.update(imageId, { source: inferred });
    }

    return inferred;
}

/**
 * Get image source synchronously from an image record.
 * Falls back to inference if source not set.
 */
export function getImageSourceSync(imageId?: string, existingSource?: ImageSource): ImageSource | null {
    if (existingSource) return existingSource;
    return inferImageSource(imageId);
}

/**
 * Check if an image is from MPC source.
 */
export function isMpcSource(source?: ImageSource | null): boolean {
    return source === 'mpc';
}

/**
 * Check if an image is from Scryfall source.
 */
export function isScryfallSource(source?: ImageSource | null): boolean {
    return source === 'scryfall';
}

/**
 * Check if an image is a user upload.
 */
export function isUploadLibrarySource(source?: ImageSource | null): boolean {
    return source === 'upload-library';
}
