import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useScryfallSearch } from './useScryfallSearch';

// Mock dependencies
vi.mock('@/helpers/cardInfoHelper', () => ({
    extractCardInfo: vi.fn((query: string) => {
        const match = query.match(/\[([A-Z0-9]+)-(\d+)\]/i);
        if (match) {
            return { name: query.replace(/\[[^\]]+\]/, '').trim(), set: match[1].toLowerCase(), number: match[2] };
        }
        const setMatch = query.match(/\[([A-Z0-9]+)\]/i);
        if (setMatch) {
            return { name: query.replace(/\[[^\]]+\]/, '').trim(), set: setMatch[1].toLowerCase(), number: null };
        }
        return { name: query.trim(), set: null, number: null };
    }),
    hasIncompleteTagSyntax: vi.fn((query: string) => {
        return query.includes('[') && !query.includes(']');
    }),
}));

vi.mock('@/helpers/scryfallApi', () => ({
    getImages: vi.fn((card) => {
        if (card.image_uris?.normal) return [card.image_uris.normal];
        if (card.card_faces) return card.card_faces.map((f: { image_uris?: { normal?: string } }) => f.image_uris?.normal).filter(Boolean);
        return [];
    }),
    mapResponseToCards: vi.fn((data: { data?: Array<{ name: string; set: string; collector_number: string; lang: string; image_uris?: { normal?: string } }> }) => {
        if (!data.data || data.data.length === 0) return [];
        return data.data.map((card) => ({
            name: card.name,
            set: card.set,
            number: card.collector_number,
            imageUrls: card.image_uris?.normal ? [card.image_uris.normal] : [],
            lang: card.lang,
        }));
    }),
}));

vi.mock('@/helpers/debug', () => ({
    debugLog: vi.fn(),
}));

vi.mock('@/constants', () => ({
    API_BASE: 'http://localhost:3001',
}));

vi.mock('@/helpers/scryfallSyntax', () => ({
    containsScryfallSyntax: vi.fn((query: string) => {
        // Return true for is: syntax to allow it to pass through
        return query.includes(':') && !query.includes('http');
    }),
}));

describe('useScryfallSearch', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
    });

    describe('initial state', () => {
        it('should return empty results and not loading initially', () => {
            const { result } = renderHook(() => useScryfallSearch(''));

            expect(result.current.cards).toEqual([]);
            expect(result.current.isLoading).toBe(false);
            expect(result.current.hasSearched).toBe(false);
            expect(result.current.hasResults).toBe(false);
        });
    });

    describe('autoSearch option', () => {
        it('should not search when autoSearch is false', async () => {
            renderHook(() => useScryfallSearch('Sol Ring', { autoSearch: false }));

            // Wait for potential debounce
            await new Promise(r => setTimeout(r, 600));

            expect(global.fetch).not.toHaveBeenCalled();
        });
    });

    describe('search behavior (real timers)', () => {
        it('should debounce and call search API', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ data: [] }),
            });

            renderHook(() => useScryfallSearch('Lightning Bolt'));

            // Wait for debounce + API call
            await vi.waitFor(() => {
                expect(global.fetch).toHaveBeenCalled();
            }, { timeout: 3000 });

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/scryfall/search?q=Lightning%20Bolt'),
                expect.anything()
            );
        });

        it('should update cards on successful search', async () => {
            const mockCards = {
                data: [
                    {
                        name: 'Sol Ring',
                        set: 'cmd',
                        set_name: 'Commander',
                        collector_number: '129',
                        lang: 'en',
                        image_uris: { normal: 'https://example.com/sol-ring.jpg' },
                    },
                ],
            };

            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockCards),
            });

            const { result } = renderHook(() => useScryfallSearch('Sol Ring'));

            await vi.waitFor(() => {
                expect(result.current.hasSearched).toBe(true);
            }, { timeout: 1000 });

            expect(result.current.cards.length).toBe(1);
            expect(result.current.cards[0].name).toBe('Sol Ring');
            expect(result.current.hasResults).toBe(true);
        });
    });

    describe('set and number lookup', () => {
        it('should use card endpoint for set/number queries', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    name: 'Sol Ring',
                    set: 'cmd',
                    collector_number: '129',
                    lang: 'en',
                    image_uris: { normal: 'https://example.com/sol-ring.jpg' },
                }),
            });

            renderHook(() => useScryfallSearch('[CMD-129]'));

            await vi.waitFor(() => {
                expect(global.fetch).toHaveBeenCalled();
            }, { timeout: 3000 });

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/scryfall/cards/cmd/129'),
                expect.anything()
            );
        });
    });

    describe('incomplete syntax', () => {
        it('should not search when query has incomplete tag syntax', async () => {
            renderHook(() => useScryfallSearch('Sol ['));

            // Wait for potential debounce
            await new Promise(r => setTimeout(r, 600));

            expect(global.fetch).not.toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        it('should handle API errors gracefully', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

            const { result } = renderHook(() => useScryfallSearch('Error Test'));

            await vi.waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            }, { timeout: 1000 });

            expect(result.current.cards).toEqual([]);
        });

        it('should handle non-ok responses', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
            });

            const { result } = renderHook(() => useScryfallSearch('Unknown Card'));

            await vi.waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            }, { timeout: 1000 });

            expect(result.current.cards).toEqual([]);
        });
    });

    describe('Scryfall syntax passthrough', () => {
        it('should pass through is: syntax unchanged', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ data: [] }),
            });

            renderHook(() => useScryfallSearch('is:mdfc'));

            await vi.waitFor(() => {
                expect(global.fetch).toHaveBeenCalled();
            }, { timeout: 3000 });

            // Should pass through as-is, not wrapped in quotes
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/scryfall/search?q=is%3Amdfc'),
                expect.anything()
            );
        });

        it('should pass through complex syntax like is:legend set:ecc unchanged', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ data: [] }),
            });

            renderHook(() => useScryfallSearch('is:legend set:ecc'));

            await vi.waitFor(() => {
                expect(global.fetch).toHaveBeenCalled();
            }, { timeout: 3000 });

            // Should pass through as-is, NOT become !"is:legend" set:ecc
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/scryfall/search?q=is%3Alegend%20set%3Aecc'),
                expect.anything()
            );
        });

        it('should pass through c: color syntax unchanged', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ data: [] }),
            });

            renderHook(() => useScryfallSearch('c:r t:creature'));

            await vi.waitFor(() => {
                expect(global.fetch).toHaveBeenCalled();
            }, { timeout: 3000 });

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/scryfall/search?q=c%3Ar%20t%3Acreature'),
                expect.anything()
            );
        });
    });
});
