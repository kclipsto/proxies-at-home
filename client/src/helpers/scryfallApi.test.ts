import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchCardWithPrints, searchCards, getImages, autocomplete, getCardByName } from './scryfallApi';
import axios from 'axios';
import { API_BASE } from '@/constants';

// Mock axios
const { mockGet, mockPost } = vi.hoisted(() => {
    return {
        mockGet: vi.fn(),
        mockPost: vi.fn(),
    };
});

vi.mock('axios', () => {
    return {
        default: {
            create: vi.fn(() => ({
                get: mockGet,
                post: mockPost,
            })),
            isCancel: vi.fn(() => false),
            isAxiosError: vi.fn(() => false),
            post: vi.fn(), // For the direct axios.post call in fetchCardWithPrints
        },
    };
});

describe('scryfallApi', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset the mock implementations
        mockGet.mockResolvedValue({ data: { data: [] } });
        (axios.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    });

    describe('getImages', () => {
        it('should extract large image_uris if available', () => {
            const card = { image_uris: { large: 'http://large.jpg', normal: 'http://normal.jpg' } };
            expect(getImages(card as never)).toEqual(['http://large.jpg']);
        });

        it('should fallback to normal if large is not available', () => {
            const card = { image_uris: { normal: 'http://normal.jpg' } };
            expect(getImages(card as never)).toEqual(['http://normal.jpg']);
        });

        it('should extract images from card_faces for DFCs', () => {
            const card = {
                card_faces: [
                    { image_uris: { large: 'http://front.jpg' } },
                    { image_uris: { normal: 'http://back.jpg' } },
                ],
            };
            expect(getImages(card as never)).toEqual(['http://front.jpg', 'http://back.jpg']);
        });

        it('should return empty array if no images found', () => {
            const card = {} as never;
            expect(getImages(card)).toEqual([]);
        });
    });

    describe('searchCards', () => {
        it('should return mapped cards on success', async () => {
            const mockScryfallResponse = {
                data: {
                    data: [
                        {
                            name: 'Sol Ring',
                            set: 'cmd',
                            collector_number: '1',
                            image_uris: { normal: 'http://example.com/sol-ring.jpg' },
                            lang: 'en',
                            cmc: 1,
                            type_line: 'Artifact',
                            rarity: 'uncommon',
                        },
                    ],
                },
            };
            mockGet.mockResolvedValue(mockScryfallResponse);

            const result = await searchCards('Sol Ring');
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Sol Ring');
            expect(result[0].imageUrls).toEqual(['http://example.com/sol-ring.jpg']);
        });

        it('should return empty array on failure', async () => {
            mockGet.mockRejectedValue(new Error('Network Error'));
            await expect(searchCards('Fail')).rejects.toThrow('An unexpected error occurred. Please try again.');
        });

        it('should throw friendly error for 404', async () => {
            const axiosError = { response: { status: 404 }, isAxiosError: true };
            mockGet.mockRejectedValue(axiosError);
            (axios.isAxiosError as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

            await expect(searchCards('Unknown')).rejects.toThrow('No cards found for your search.');
        });

        it('should throw friendly error for 500', async () => {
            const axiosError = { response: { status: 500 }, isAxiosError: true };
            mockGet.mockRejectedValue(axiosError);
            (axios.isAxiosError as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

            await expect(searchCards('ServerError')).rejects.toThrow('There was a problem with the server. Please try again later.');
        });

        it('should throw network error for request timeout', async () => {
            const axiosError = { request: {}, isAxiosError: true };
            mockGet.mockRejectedValue(axiosError);
            (axios.isAxiosError as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

            await expect(searchCards('NetworkError')).rejects.toThrow('Could not connect to the server. Please check your internet connection.');
        });

        it('should rethrow cancel errors', async () => {
            const cancelError = new Error('Cancelled');
            mockGet.mockRejectedValue(cancelError);
            (axios.isCancel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

            await expect(searchCards('Cancelled')).rejects.toThrow('Cancelled');
        });
    });

    describe('autocomplete', () => {
        it('should return autocomplete suggestions', async () => {
            mockGet.mockResolvedValue({ data: { data: ['Sol Ring', 'Solo Ring'] } });
            const result = await autocomplete('sol');
            expect(result).toEqual(['Sol Ring', 'Solo Ring']);
        });
    });

    describe('getCardByName', () => {
        it('should return exact card by name', async () => {
            mockGet.mockResolvedValue({
                data: {
                    name: 'Lightning Bolt',
                    set: 'sta',
                    collector_number: '57',
                    image_uris: { large: 'http://bolt.jpg' },
                    lang: 'en',
                },
            });
            const result = await getCardByName('Lightning Bolt');
            expect(result.name).toBe('Lightning Bolt');
            expect(result.imageUrls).toEqual(['http://bolt.jpg']);
        });
    });

    describe('fetchCardWithPrints', () => {
        beforeEach(() => {
            // Mock global fetch for this suite
            global.fetch = vi.fn();
        });

        it('should return null if search returns no cards', async () => {
            mockGet.mockResolvedValue({ data: { data: [] } }); // Search returns empty
            const result = await fetchCardWithPrints('Unknown Card');
            expect(result).toBeNull();
        });

        it('should return card without fetching prints when includePrints is false', async () => {
            const mockSearchResponse = {
                data: {
                    data: [
                        {
                            name: 'Sol Ring',
                            set: 'cmd',
                            collector_number: '1',
                            image_uris: { normal: 'http://example.com/sol-ring.jpg' },
                        },
                    ],
                },
            };
            mockGet.mockResolvedValue(mockSearchResponse);

            const result = await fetchCardWithPrints('Sol Ring', false, false);

            expect(result).not.toBeNull();
            expect(result?.name).toBe('Sol Ring');
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should use exact search when exact is true', async () => {
            mockGet.mockResolvedValue({
                data: {
                    name: 'Sol Ring',
                    set: 'cmd',
                    collector_number: '1',
                    image_uris: { normal: 'http://example.com/sol-ring.jpg' },
                },
            });

            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
            });

            const result = await fetchCardWithPrints('Sol Ring', true, true);

            expect(result?.name).toBe('Sol Ring');
            expect(mockGet).toHaveBeenCalledWith('/cards/named', expect.anything());
        });

        it('should return card with prints if search and print fetch succeed', async () => {
            // 1. Mock Search Response
            const mockSearchResponse = {
                data: {
                    data: [
                        {
                            name: 'Sol Ring',
                            set: 'cmd',
                            collector_number: '1',
                            image_uris: { normal: 'http://example.com/sol-ring.jpg' },
                        },
                    ],
                },
            };
            mockGet.mockResolvedValue(mockSearchResponse);

            // 2. Mock Print Fetch Stream (SSE)
            const streamData = [
                'event: print-found\n',
                'data: {"imageUrls":["http://example.com/print1.jpg"]}\n\n',
                'event: print-found\n',
                'data: {"imageUrls":["http://example.com/print2.jpg"]}\n\n'
            ].join("");

            const mockRead = vi.fn()
                .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(streamData) })
                .mockResolvedValueOnce({ done: true });

            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                body: {
                    getReader: () => ({
                        read: mockRead,
                        releaseLock: vi.fn(),
                    }),
                },
            });

            const result = await fetchCardWithPrints('Sol Ring');

            expect(result).not.toBeNull();
            expect(result?.name).toBe('Sol Ring');
            // The implementation collects all print URLs
            expect(result?.imageUrls).toContain('http://example.com/print1.jpg');
            expect(result?.imageUrls).toContain('http://example.com/print2.jpg');

            expect(global.fetch).toHaveBeenCalledWith(
                `${API_BASE}/api/stream/cards`,
                expect.objectContaining({
                    method: "POST",
                    body: expect.stringContaining('"cardArt":"prints"')
                })
            );
        });

        it('should return card with original images if print fetch fails', async () => {
            // 1. Mock Search Response
            const mockSearchResponse = {
                data: {
                    data: [
                        {
                            name: 'Sol Ring',
                            image_uris: { normal: 'http://example.com/sol-ring.jpg' },
                        },
                    ],
                },
            };
            mockGet.mockResolvedValue(mockSearchResponse);

            // 2. Mock Print Fetch Failure
            (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Print fetch failed'));

            const result = await fetchCardWithPrints('Sol Ring');

            expect(result).not.toBeNull();
            expect(result?.name).toBe('Sol Ring');
            expect(result?.imageUrls).toEqual(['http://example.com/sol-ring.jpg']); // Fallback to original
        });

        it('should return card with original images if response is not ok', async () => {
            const mockSearchResponse = {
                data: {
                    data: [
                        {
                            name: 'Sol Ring',
                            image_uris: { normal: 'http://example.com/sol-ring.jpg' },
                        },
                    ],
                },
            };
            mockGet.mockResolvedValue(mockSearchResponse);

            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
            });

            const result = await fetchCardWithPrints('Sol Ring');

            expect(result?.imageUrls).toEqual(['http://example.com/sol-ring.jpg']);
        });
    });
});

