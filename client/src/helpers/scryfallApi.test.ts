import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchCardWithPrints, searchCards } from './scryfallApi';
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
    });
});
