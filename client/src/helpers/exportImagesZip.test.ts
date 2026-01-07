import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted for mock functions to ensure they are available for module mocks
const mocks = vi.hoisted(() => ({
    file: vi.fn(),
    generateAsync: vi.fn().mockResolvedValue(new Blob(['zip-content'])),
    saveAs: vi.fn(),
    dbPut: vi.fn(),
    dbGet: vi.fn(),
    getState: vi.fn(() => ({
        dpi: 300,
        darkenMode: 'none',
    })),
    hasAdvancedOverrides: vi.fn(),
    overridesToRenderParams: vi.fn(),
    renderCardWithOverridesWorker: vi.fn(),
}));

// Mock JSZip
vi.mock('jszip', () => {
    return {
        default: class MockJSZip {
            file = mocks.file;
            generateAsync = mocks.generateAsync;
        },
    };
});

// Mock file-saver
vi.mock('file-saver', () => ({
    saveAs: mocks.saveAs,
}));

// Mock DB
vi.mock('@/db', () => ({
    db: {
        effectCache: {
            put: mocks.dbPut,
        },
        images: {
            get: mocks.dbGet,
        }
    },
}));

// Mock Settings Store
vi.mock('@/store/settings', () => ({
    useSettingsStore: {
        getState: mocks.getState,
    },
}));

// Mock Worker Helpers
vi.mock('./cardCanvasWorker', () => ({
    hasAdvancedOverrides: mocks.hasAdvancedOverrides,
    overridesToRenderParams: mocks.overridesToRenderParams,
    renderCardWithOverridesWorker: mocks.renderCardWithOverridesWorker,
}));

// Mock Constants
vi.mock('@/constants', () => ({
    API_BASE: 'http://localhost:3000',
}));

import { ExportImagesZip, ExportImagesIndividual } from './exportImagesZip';
import type { CardOption } from '../../../shared/types';
import type { Image as ImageType } from '@/db';

describe('exportImagesZip', () => {
    // Setup global browser mocks
    const originalFetch = global.fetch;
    const originalCreateImageBitmap = global.createImageBitmap;

    beforeEach(() => {
        vi.clearAllMocks();

        // Default mock implementations
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            blob: async () => new Blob(['image-content'], { type: 'image/png' }),
        });

        global.createImageBitmap = vi.fn().mockResolvedValue({
            close: vi.fn(),
            width: 100,
            height: 100,
        });

        mocks.getState.mockReturnValue({ dpi: 300, darkenMode: 'none' });
        mocks.hasAdvancedOverrides.mockReturnValue(false);
    });

    afterEach(() => {
        global.fetch = originalFetch;
        global.createImageBitmap = originalCreateImageBitmap;
    });

    const createMockCard = (overrides: Partial<CardOption> = {}): CardOption => ({
        id: 'card-1',
        name: 'Test Card',
        count: 1,
        ...overrides,
    } as unknown as CardOption);

    const createMockImage = (overrides: Partial<ImageType> = {}): ImageType => ({
        id: 'img-1',
        sourceUrl: 'https://example.com/image.png',
        ...overrides,
    } as unknown as ImageType);

    describe('ExportImagesZip', () => {
        it('should create and save a zip file with no cards', async () => {
            await ExportImagesZip({ cards: [], images: [] });
            expect(mocks.saveAs).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/card_images_.*\.zip/));
        });

        it('should export a single card using sourceUrl', async () => {
            const card = createMockCard({ imageId: 'img-1' });
            const image = createMockImage({ id: 'img-1' });

            await ExportImagesZip({ cards: [card], images: [image] });

            // Should fetch the image
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('http://localhost:3000/api/cards/images/proxy'), // proxied because !isUserUpload
                expect.any(Object)
            );
            // Should add to zip
            expect(mocks.file).toHaveBeenCalledWith(
                '001 - Test Card.png',
                expect.any(Blob)
            );
            // Should save zip
            expect(mocks.saveAs).toHaveBeenCalled();
        });

        it('should export a single card using originalBlob if available and no overrides', async () => {
            const blob = new Blob(['blob-content'], { type: 'image/jpeg' });
            const card = createMockCard({ imageId: 'img-1', isUserUpload: true }); // user upload = no proxy
            const image = createMockImage({ id: 'img-1', originalBlob: blob, sourceUrl: '' });

            await ExportImagesZip({ cards: [card], images: [image] });

            expect(global.fetch).not.toHaveBeenCalled();
            expect(mocks.file).toHaveBeenCalledWith(
                '001 - Test Card.jpg',
                blob
            );
        });

        it('should handle filename deduplication', async () => {
            const card1 = createMockCard({ name: 'Forest', imageId: 'img-1' });
            const card2 = createMockCard({ name: 'Forest', imageId: 'img-1' });
            const image = createMockImage({ id: 'img-1' });

            await ExportImagesZip({ cards: [card1, card2], images: [image] });

            expect(mocks.file).toHaveBeenCalledWith('001 - Forest.png', expect.any(Blob));
            expect(mocks.file).toHaveBeenCalledWith('002 - Forest (2).png', expect.any(Blob));
        });

        it('should use exportBlob when available', async () => {
            const exportBlob = new Blob(['processed'], { type: 'image/png' });
            const card = createMockCard({ imageId: 'img-1' });
            const image = createMockImage({ id: 'img-1', exportBlob });

            await ExportImagesZip({ cards: [card], images: [image] });

            expect(global.fetch).not.toHaveBeenCalled();
            expect(mocks.file).toHaveBeenCalledWith('001 - Test Card.png', exportBlob);
        });

        it('should apply advanced overrides', async () => {
            mocks.hasAdvancedOverrides.mockReturnValue(true);
            const renderedBlob = new Blob(['rendered'], { type: 'image/png' });
            mocks.renderCardWithOverridesWorker.mockResolvedValue(renderedBlob);

            const exportBlob = new Blob(['base'], { type: 'image/png' });
            const card = createMockCard({ imageId: 'img-1', overrides: { brightness: 1.2 } });
            const image = createMockImage({ id: 'img-1', exportBlob });

            await ExportImagesZip({ cards: [card], images: [image] });

            expect(mocks.renderCardWithOverridesWorker).toHaveBeenCalled();
            expect(mocks.dbPut).toHaveBeenCalled(); // Should cache result
            expect(mocks.file).toHaveBeenCalledWith('001 - Test Card.png', renderedBlob);
        });

        it('should handle darken modes correctly', async () => {
            const exportBlob = new Blob(['normal'], { type: 'image/png' });
            const exportBlobDarkened = new Blob(['darkened'], { type: 'image/png' });

            const card = createMockCard({ imageId: 'img-1', overrides: { darkenMode: 'darken-all' } });
            const image = createMockImage({
                id: 'img-1',
                exportBlob,
                exportBlobDarkened
            });

            await ExportImagesZip({ cards: [card], images: [image] });

            expect(mocks.file).toHaveBeenCalledWith('001 - Test Card.png', exportBlobDarkened);
        });

        it('should skip cards with no image data', async () => {
            const card = createMockCard({ imageId: undefined });

            await ExportImagesZip({ cards: [card], images: [] });

            expect(mocks.file).not.toHaveBeenCalled();
        });

        it('should handle fetch errors gracefully', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

            const card = createMockCard({ imageId: 'img-1' });
            const image = createMockImage({ id: 'img-1' });

            await ExportImagesZip({ cards: [card], images: [image] });

            expect(mocks.file).not.toHaveBeenCalled();
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('should handle 404 responses gracefully', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
                blob: async () => new Blob([''], { type: 'text/html' }),
            });
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

            const card = createMockCard({ imageId: 'img-1' });
            const image = createMockImage({ id: 'img-1' });

            await ExportImagesZip({ cards: [card], images: [image] });

            expect(mocks.file).not.toHaveBeenCalled();
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Could not fetch'));
            consoleSpy.mockRestore();
        });
    });

    describe('ExportImagesIndividual', () => {
        it('should export single files using saveAs', async () => {
            const card = createMockCard({ imageId: 'img-1' });
            const image = createMockImage({ id: 'img-1' });

            await ExportImagesIndividual({ cards: [card], images: [image] });

            expect(mocks.saveAs).toHaveBeenCalledWith(
                expect.any(Blob),
                '001 - Test Card.png'
            );
        });

        it('should deduplicate filenames for individual downloads', async () => {
            const card1 = createMockCard({ name: 'Forest', imageId: 'img-1' });
            const card2 = createMockCard({ name: 'Forest', imageId: 'img-1' });
            const image = createMockImage({ id: 'img-1' });

            await ExportImagesIndividual({ cards: [card1, card2], images: [image] });

            expect(mocks.saveAs).toHaveBeenCalledWith(expect.any(Blob), '001 - Forest.png');
            expect(mocks.saveAs).toHaveBeenCalledWith(expect.any(Blob), '002 - Forest (2).png');
        });
    });
});
