/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamCards } from './streamCards';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { undoableAddCards } from './undoableActions';
import { addRemoteImage } from './dbUtils';

// ------------------------------------------------------------------
// Mocks
// ------------------------------------------------------------------

// Mock SSE client
vi.mock('@microsoft/fetch-event-source', () => ({
    fetchEventSource: vi.fn(),
}));

// Mock DB actions
vi.mock('./undoableActions', () => ({
    undoableAddCards: vi.fn(),
}));

vi.mock('./dbUtils', () => ({
    addCards: vi.fn(),
    addRemoteImage: vi.fn(),
    createLinkedBackCardsBulk: vi.fn(),
}));

// Mock DB itself
vi.mock('@/db', () => ({
    db: {
        cards: {
            orderBy: vi.fn(() => ({
                last: vi.fn().mockResolvedValue({ order: 100 }), // initialMaxOrder
            })),
        },
    },
}));

// Mock Settings
vi.mock('../store', () => ({
    useSettingsStore: {
        getState: vi.fn(() => ({
            preferredArtSource: 'scryfall', // Default to scryfall
            setSortBy: vi.fn(),
        })),
    },
}));

// Mock MPC Integration
vi.mock('./mpcImportIntegration', () => ({
    findBestMpcMatches: vi.fn().mockResolvedValue([]),
    parseMpcCardLogic: vi.fn(),
}));

vi.mock('./mpcAutofillApi', () => ({
    getMpcAutofillImageUrl: vi.fn(id => `http://mpc/${id}`),
}));

vi.mock('./importSession', () => ({
    createImportSession: vi.fn(),
    getCurrentSession: vi.fn(() => ({ markFetchComplete: vi.fn() })),
}));

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe('streamCards', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle direct MPC cards bypassing SSE', async () => {
        const options: any = {
            cardInfos: [
                { name: 'MPC Card', mpcIdentifier: 'mpc-123', quantity: 1 }
            ],
            language: 'en',
            importType: 'deck',
            signal: new AbortController().signal,
        };

        (undoableAddCards as any).mockResolvedValue([{ uuid: 'new-uuid', name: 'MPC Card' }]);
        (addRemoteImage as any).mockResolvedValue('img-123');

        const result = await streamCards(options);

        expect(addRemoteImage).toHaveBeenCalledWith(['http://mpc/mpc-123'], 1);
        expect(undoableAddCards).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ name: 'MPC Card', imageId: 'img-123' })
            ]),
            expect.anything()
        );
        expect(result.addedCardUuids).toEqual(['new-uuid']);
        expect(fetchEventSource).not.toHaveBeenCalled(); // Should not call SSE for pure MPC list
    });

    it('should call fetchEventSource for regular cards', async () => {
        const options: any = {
            cardInfos: [{ name: 'Test Card' }],
            language: 'en',
            importType: 'deck',
            signal: new AbortController().signal,
        };

        // Simulate SSE "done" event immediately to allow promise to resolve
        (fetchEventSource as any).mockImplementation(async (_url: string, opts: any) => {
            opts.onmessage({ event: 'done', data: '' });
        });

        await streamCards(options);

        expect(fetchEventSource).toHaveBeenCalledWith(
            expect.stringContaining('/api/stream/cards'),
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('Test Card'),
            })
        );
    });

    it('should process "card-found" SSE events', async () => {
        const options: any = {
            cardInfos: [{ name: 'Found Card' }],
            language: 'en',
            importType: 'deck',
            signal: new AbortController().signal,
        };

        (undoableAddCards as any).mockResolvedValue([{ uuid: 'uuid-1', name: 'Found Card' }]);
        (addRemoteImage as any).mockResolvedValue('img-1');

        // Simulate SSE flow
        (fetchEventSource as any).mockImplementation(async (_url: string, opts: any) => {
            // 1. Emit card-found
            await opts.onmessage({
                event: 'card-found',
                data: JSON.stringify({
                    name: 'Found Card',
                    imageUrls: ['http://img'],
                    set: 'SET',
                    number: '1',
                    lang: 'en'
                })
            });
            // 2. Emit done
            opts.onmessage({ event: 'done', data: '' });
        });

        const result = await streamCards(options);

        expect(addRemoteImage).toHaveBeenCalledWith(['http://img'], 1, undefined);
        expect(undoableAddCards).toHaveBeenCalled();
        expect(result.addedCardUuids).toContain('uuid-1');
    });

    it('should process "card-error" SSE events (fallback placeholders)', async () => {
        const options: any = {
            cardInfos: [{ name: 'Missing Card' }],
            language: 'en',
            importType: 'deck',
            signal: new AbortController().signal,
        };

        // For placeholders, it calls addCards directly (not undoableAddCards in this specific path? let's check implementation)
        // Implementation: `const added = await addCards(...)` for card-error path.
        const mockAddCards = await import('./dbUtils').then(m => m.addCards);
        (mockAddCards as any).mockResolvedValue([{ uuid: 'uuid-error', name: 'Missing Card' }]);

        (fetchEventSource as any).mockImplementation(async (_url: string, opts: any) => {
            await opts.onmessage({
                event: 'card-error',
                data: JSON.stringify({ query: { name: 'Missing Card' } })
            });
            opts.onmessage({ event: 'done', data: '' });
        });

        await streamCards(options);

        expect(mockAddCards).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ name: 'Missing Card', imageId: undefined })]),
            expect.anything()
        );
    });

    describe('DFC back-face imports', () => {
        it('should use front face art when importing back face name', async () => {
            const options: any = {
                cardInfos: [{ name: 'Insectile Aberration' }], // Back face of Delver of Secrets
                language: 'en',
                importType: 'deck',
                signal: new AbortController().signal,
            };

            (undoableAddCards as any).mockResolvedValue([{ uuid: 'uuid-1', name: 'Delver of Secrets' }]);
            // Order: back face art is fetched first, then front face art for back-face imports
            (addRemoteImage as any).mockResolvedValueOnce('back-img-id').mockResolvedValueOnce('front-img-id');

            // Simulate SSE flow with a DFC response
            (fetchEventSource as any).mockImplementation(async (_url: string, opts: any) => {
                await opts.onmessage({
                    event: 'card-found',
                    data: JSON.stringify({
                        name: 'Delver of Secrets', // Server returns canonical front face name
                        imageUrls: ['http://back-img'], // Server prioritizes requested face
                        set: 'ISD',
                        number: '51',
                        lang: 'en',
                        card_faces: [
                            { name: 'Delver of Secrets', imageUrl: 'http://front-img' },
                            { name: 'Insectile Aberration', imageUrl: 'http://back-img' }
                        ]
                    })
                });
                opts.onmessage({ event: 'done', data: '' });
            });

            await streamCards(options);

            // First call: back face art for linked back card
            expect(addRemoteImage).toHaveBeenNthCalledWith(1, ['http://back-img'], 1);
            // Second call: front face art for the main card (since back face name was imported)
            expect(addRemoteImage).toHaveBeenNthCalledWith(2, ['http://front-img'], 1, undefined);
            // Should have passed isFlipped: true
            expect(undoableAddCards).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: 'Delver of Secrets',
                        imageId: 'front-img-id',
                        isFlipped: true
                    })
                ]),
                expect.anything()
            );
        });

        it('should use normal image when importing front face name', async () => {
            const options: any = {
                cardInfos: [{ name: 'Delver of Secrets' }], // Front face
                language: 'en',
                importType: 'deck',
                signal: new AbortController().signal,
            };

            (undoableAddCards as any).mockResolvedValue([{ uuid: 'uuid-1', name: 'Delver of Secrets' }]);
            // Order: back face art is fetched first, then main image
            (addRemoteImage as any).mockResolvedValueOnce('back-img-id').mockResolvedValueOnce('front-img-id');

            (fetchEventSource as any).mockImplementation(async (_url: string, opts: any) => {
                await opts.onmessage({
                    event: 'card-found',
                    data: JSON.stringify({
                        name: 'Delver of Secrets',
                        imageUrls: ['http://front-img'],
                        set: 'ISD',
                        number: '51',
                        lang: 'en',
                        card_faces: [
                            { name: 'Delver of Secrets', imageUrl: 'http://front-img' },
                            { name: 'Insectile Aberration', imageUrl: 'http://back-img' }
                        ]
                    })
                });
                opts.onmessage({ event: 'done', data: '' });
            });

            await streamCards(options);

            // Should NOT have isFlipped for front face imports
            expect(undoableAddCards).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: 'Delver of Secrets',
                        isFlipped: undefined
                    })
                ]),
                expect.anything()
            );
        });

        it('should create linked back card with back face art', async () => {
            const options: any = {
                cardInfos: [{ name: 'Delver of Secrets' }],
                language: 'en',
                importType: 'deck',
                signal: new AbortController().signal,
            };

            const createLinkedBackCardsBulk = await import('./dbUtils').then(m => m.createLinkedBackCardsBulk);
            (undoableAddCards as any).mockResolvedValue([{ uuid: 'uuid-front', name: 'Delver of Secrets' }]);
            // Order: back face art is fetched first, then main image
            (addRemoteImage as any).mockResolvedValueOnce('back-img-id').mockResolvedValueOnce('front-img-id');

            (fetchEventSource as any).mockImplementation(async (_url: string, opts: any) => {
                await opts.onmessage({
                    event: 'card-found',
                    data: JSON.stringify({
                        name: 'Delver of Secrets',
                        imageUrls: ['http://front-img'],
                        set: 'ISD',
                        number: '51',
                        lang: 'en',
                        card_faces: [
                            { name: 'Delver of Secrets', imageUrl: 'http://front-img' },
                            { name: 'Insectile Aberration', imageUrl: 'http://back-img' }
                        ]
                    })
                });
                opts.onmessage({ event: 'done', data: '' });
            });

            await streamCards(options);

            // Should create linked back cards
            expect(createLinkedBackCardsBulk).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        frontUuid: 'uuid-front',
                        backImageId: 'back-img-id',
                        backName: 'Insectile Aberration'
                    })
                ])
            );
        });
    });
});
