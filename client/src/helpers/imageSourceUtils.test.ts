import { describe, it, expect, vi } from 'vitest';
import { inferImageSource, inferSourceFromUrl, getImageSourceSync, isMpcSource, isScryfallSource, isUploadLibrarySource } from './imageSourceUtils';

// Mock the mpcAutofillApi
vi.mock('./mpcAutofillApi', () => ({
    extractMpcIdentifierFromImageId: vi.fn((imageId: string) => {
        if (!imageId) return null;
        // Match URLs with MPC path
        if (imageId.includes('/api/cards/images/mpc')) {
            const match = imageId.match(/id=([^&]+)/);
            return match ? match[1] : null;
        }
        // Match bare MPC Drive IDs (15+ chars, alphanumeric with dashes/underscores)
        if (/^[a-zA-Z0-9_-]{15,}$/.test(imageId) && !/^[a-f0-9]{64}(-[a-z]+)?$/i.test(imageId)) {
            return imageId;
        }
        return null;
    }),
}));

describe('imageSourceUtils', () => {
    describe('inferImageSource', () => {
        it('should return null for undefined/empty', () => {
            expect(inferImageSource(undefined)).toBeNull();
            expect(inferImageSource('')).toBeNull();
        });

        it('should detect cardback prefix', () => {
            expect(inferImageSource('cardback_123456')).toBe('cardback');
        });

        it('should detect scryfall prefix', () => {
            expect(inferImageSource('scryfall_abc123')).toBe('scryfall');
            expect(inferImageSource('local_something')).toBe('scryfall');
        });

        it('should detect custom upload SHA-256 hash', () => {
            const hash = 'a'.repeat(64);
            expect(inferImageSource(hash)).toBe('upload-library');
        });

        it('should detect custom upload hash with -mpc suffix', () => {
            const hashWithSuffix = 'a'.repeat(64) + '-mpc';
            expect(inferImageSource(hashWithSuffix)).toBe('upload-library');
        });

        it('should detect custom upload hash with -std suffix', () => {
            const hashWithSuffix = 'a'.repeat(64) + '-std';
            expect(inferImageSource(hashWithSuffix)).toBe('upload-library');
        });

        it('should detect scryfall URL', () => {
            expect(inferImageSource('https://cards.scryfall.io/png/front/a/1/abc.png')).toBe('scryfall');
        });

        it('should detect MPC URL', () => {
            expect(inferImageSource('/api/cards/images/mpc?id=abc123')).toBe('mpc');
        });

        it('should detect bare MPC Drive ID', () => {
            // 33-char alphanumeric (typical Drive ID)
            const driveId = '1abc2DEF_-GhIjKlMnOpQrStUvWxYz123';
            expect(inferImageSource(driveId)).toBe('mpc');
        });
    });

    describe('inferSourceFromUrl', () => {
        it('should return null for undefined/empty', () => {
            expect(inferSourceFromUrl(undefined)).toBeNull();
            expect(inferSourceFromUrl('')).toBeNull();
        });

        it('should detect scryfall URL', () => {
            expect(inferSourceFromUrl('https://cards.scryfall.io/png/front/a/1/abc.png')).toBe('scryfall');
        });

        it('should detect MPC URL', () => {
            expect(inferSourceFromUrl('/api/cards/images/mpc?id=abc123')).toBe('mpc');
        });
    });

    describe('getImageSourceSync', () => {
        it('should return existing source if provided', () => {
            expect(getImageSourceSync('anything', 'mpc')).toBe('mpc');
            expect(getImageSourceSync('anything', 'scryfall')).toBe('scryfall');
        });

        it('should infer source if not provided', () => {
            const hash = 'a'.repeat(64);
            expect(getImageSourceSync(hash, undefined)).toBe('upload-library');
        });
    });

    describe('helper functions', () => {
        it('isMpcSource should return true only for mpc', () => {
            expect(isMpcSource('mpc')).toBe(true);
            expect(isMpcSource('scryfall')).toBe(false);
            expect(isMpcSource(null)).toBe(false);
        });

        it('isScryfallSource should return true only for scryfall', () => {
            expect(isScryfallSource('scryfall')).toBe(true);
            expect(isScryfallSource('mpc')).toBe(false);
            expect(isScryfallSource(null)).toBe(false);
        });

        it('isUploadLibrarySource should return true only for upload-library', () => {
            expect(isUploadLibrarySource('upload-library')).toBe(true);
            expect(isUploadLibrarySource('mpc')).toBe(false);
            expect(isUploadLibrarySource(null)).toBe(false);
        });
    });
});
