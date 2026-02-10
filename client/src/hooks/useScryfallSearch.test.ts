import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useScryfallSearch, resetGlobalSearchCache } from './useScryfallSearch';

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
    constructScryfallQuery: vi.fn((query: string) => query),
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
        resetGlobalSearchCache();
    });

    describe('initial state', () => {
        it('should return empty results and not loading initially', async () => {
            const { result } = renderHook(() => useScryfallSearch(''));

            // The hook might have an initial effect run
            expect(result.current.isLoading).toBe(false);

            expect(result.current.cards).toEqual([]);
            expect(result.current.hasSearched).toBe(false);
            expect(result.current.hasResults).toBe(false);
        });
    });

    describe('autoSearch option', () => {
        it('should not search when autoSearch is false', async () => {
            const { result } = renderHook(() => useScryfallSearch('Unique AutoSearch', { autoSearch: false }));

            // Wait for debounce (500ms) + buffer
            await new Promise(resolve => setTimeout(resolve, 600));

            expect(global.fetch).not.toHaveBeenCalled();
            expect(result.current.isLoading).toBe(false);
        });
    });

    describe('search behavior', () => {
        it('should debounce and call search API', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ data: [] }),
            });

            const { result } = renderHook(() => useScryfallSearch('Unique Lightning Bolt'));

            // Wait for debounce and search completion
            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    expect.stringContaining('/api/scryfall/search?q=Unique%20Lightning%20Bolt'),
                    expect.anything()
                );
            }, { timeout: 3000 });

            expect(result.current.isLoading).toBe(false);
        });

        it('should update cards on successful search', async () => {
            const mockCards = {
                data: [
                    {
                        name: 'Unique Sol Ring',
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

            const { result } = renderHook(() => useScryfallSearch('Unique Sol Ring'));

            // Wait for debounce and result
            await waitFor(() => {
                expect(result.current.hasSearched).toBe(true);
            }, { timeout: 3000 });

            expect(result.current.cards.length).toBe(1);
            expect(result.current.cards[0].name).toBe('Unique Sol Ring');
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

            const { result } = renderHook(() => useScryfallSearch('[CMD-129]'));

            // Wait for debounce and callback
            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    expect.stringContaining('/api/scryfall/cards/cmd/129'),
                    expect.anything()
                );
            }, { timeout: 3000 });

            expect(result.current.isLoading).toBe(false);
        });
    });

    describe('incomplete syntax', () => {
        it('should not search when query has incomplete tag syntax', async () => {
            const { result } = renderHook(() => useScryfallSearch('Sol ['));

            // Advance timers
            await new Promise(resolve => setTimeout(resolve, 600));

            expect(global.fetch).not.toHaveBeenCalled();
            expect(result.current.isLoading).toBe(false);
        });
    });

    describe('error handling', () => {
        it('should handle API errors gracefully', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

            const { result } = renderHook(() => useScryfallSearch('Error Test'));

            // Wait for debounce and fetch attempt
            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalled();
            }, { timeout: 1000 });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            expect(result.current.cards).toEqual([]);
        });

        it('should handle non-ok responses', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
            });

            const { result } = renderHook(() => useScryfallSearch('Unknown Card'));

            // Wait for debounce and fetch attempt
            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalled();
            }, { timeout: 1000 });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            expect(result.current.cards).toEqual([]);
        });
    });

    describe('Scryfall syntax passthrough', () => {
        it('should pass through is: syntax unchanged', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ data: [] }),
            });

            const { result } = renderHook(() => useScryfallSearch('is:mdfc'));

            // Wait for debounce and callback
            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    expect.stringContaining('/api/scryfall/search?q=is%3Amdfc'),
                    expect.anything()
                );
            }, { timeout: 3000 });

            expect(result.current.isLoading).toBe(false);
        });

        it('should pass through complex syntax like is:legend set:ecc unchanged', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ data: [] }),
            });

            const { result } = renderHook(() => useScryfallSearch('is:legend set:ecc'));

            // Wait for debounce and callback
            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    expect.stringContaining('/api/scryfall/search?q=is%3Alegend%20set%3Aecc'),
                    expect.anything()
                );
            }, { timeout: 3000 });

            expect(result.current.isLoading).toBe(false);
        });

        it('should pass through c: color syntax unchanged', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ data: [] }),
            });

            const { result } = renderHook(() => useScryfallSearch('c:r t:creature'));

            // Wait for debounce and callback
            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    expect.stringContaining('/api/scryfall/search?q=c%3Ar%20t%3Acreature'),
                    expect.anything()
                );
            }, { timeout: 3000 });

            expect(result.current.isLoading).toBe(false);
        });
    });
});
