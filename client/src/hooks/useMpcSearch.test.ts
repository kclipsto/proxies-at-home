import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMpcSearch } from './useMpcSearch';

// Mock dependencies
vi.mock('@/helpers/mpcAutofillApi', () => ({
    searchMpcAutofill: vi.fn(),
}));

vi.mock('@/store', () => ({
    useSettingsStore: vi.fn((selector) => {
        const state = {
            mpcFuzzySearch: true,
        };
        return selector(state);
    }),
    useUserPreferencesStore: vi.fn((selector) => {
        const state = {
            preferences: {
                favoriteMpcSources: [],
                favoriteMpcTags: [],
                favoriteMpcDpi: 800,
                favoriteMpcSort: 'dpi',
            },
        };
        return selector(state);
    }),
}));

import { searchMpcAutofill } from '@/helpers/mpcAutofillApi';

describe('useMpcSearch', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('initial state', () => {
        it('should return empty results and not loading initially', () => {
            const { result } = renderHook(() => useMpcSearch(''));

            expect(result.current.cards).toEqual([]);
            expect(result.current.filteredCards).toEqual([]);
            expect(result.current.isLoading).toBe(false);
            expect(result.current.hasSearched).toBe(false);
            expect(result.current.hasResults).toBe(false);
        });

        it('should have default filter state', () => {
            const { result } = renderHook(() => useMpcSearch(''));

            expect(result.current.filters.minDpi).toBe(800);
            expect(result.current.filters.sourceFilters.size).toBe(0);
            expect(result.current.filters.tagFilters.size).toBe(0);
            expect(result.current.filters.sortBy).toBe('dpi');
            expect(result.current.filters.sortDir).toBe('desc');
        });
    });

    describe('search behavior', () => {
        it('should call searchMpcAutofill on query change', async () => {
            (searchMpcAutofill as ReturnType<typeof vi.fn>).mockResolvedValue([]);

            renderHook(() => useMpcSearch('Sol Ring'));

            await act(async () => {
                vi.advanceTimersByTime(600);
            });

            await vi.waitFor(() => {
                expect(searchMpcAutofill).toHaveBeenCalled();
            });

            expect(searchMpcAutofill).toHaveBeenCalledWith('Sol Ring', 'CARD', true);
        });

        it('should update cards on successful search', async () => {
            const mockCards = [
                { id: '1', name: 'Sol Ring', dpi: 1200, sourceName: 'Source A' },
                { id: '2', name: 'Sol Ring Alt', dpi: 800, sourceName: 'Source B' },
            ];

            (searchMpcAutofill as ReturnType<typeof vi.fn>).mockResolvedValue(mockCards);

            const { result } = renderHook(() => useMpcSearch('Sol Ring'));

            await act(async () => {
                vi.advanceTimersByTime(600);
            });

            await vi.waitFor(() => {
                expect(result.current.cards.length).toBe(2);
                expect(result.current.isLoading).toBe(false);
            });

            expect(result.current.cards.length).toBe(2);
            expect(result.current.hasResults).toBe(true);
        });
    });

    describe('autoSearch option', () => {
        it('should not search when autoSearch is false', async () => {
            renderHook(() => useMpcSearch('Sol Ring', { autoSearch: false }));

            await act(async () => {
                vi.advanceTimersByTime(600);
            });

            expect(searchMpcAutofill).not.toHaveBeenCalled();
        });
    });

    describe('token collision dual-search', () => {
        it('should search both CARD and TOKEN for collision names like treasure', async () => {
            const mockCardResults = [{ id: '1', name: 'Treasure Nabber', dpi: 1200, sourceName: 'Source A' }];
            const mockTokenResults = [{ id: '2', name: 'Treasure', dpi: 1200, sourceName: 'Source B' }];

            (searchMpcAutofill as ReturnType<typeof vi.fn>)
                .mockResolvedValueOnce(mockCardResults)
                .mockResolvedValueOnce(mockTokenResults);

            const { result } = renderHook(() => useMpcSearch('treasure'));

            await act(async () => {
                vi.advanceTimersByTime(600);
            });

            expect(searchMpcAutofill).toHaveBeenCalledTimes(2);
            expect(result.current.isLoading).toBe(false);

            // Should have called searchMpcAutofill twice - once for CARD, once for TOKEN
            expect(searchMpcAutofill).toHaveBeenCalledWith('treasure', 'CARD', true);
            expect(searchMpcAutofill).toHaveBeenCalledWith('treasure', 'TOKEN', true);
        });

        it('should merge token and card results for collision names', async () => {
            const mockCardResults = [{ id: '1', name: 'Treasure Nabber', dpi: 1200, sourceName: 'Source A' }];
            const mockTokenResults = [{ id: '2', name: 'Treasure Token', dpi: 1200, sourceName: 'Source B' }];

            (searchMpcAutofill as ReturnType<typeof vi.fn>)
                .mockResolvedValueOnce(mockCardResults)
                .mockResolvedValueOnce(mockTokenResults);

            const { result } = renderHook(() => useMpcSearch('blood'));

            await act(async () => {
                vi.advanceTimersByTime(600);
            });

            await vi.waitFor(() => {
                expect(result.current.cards.length).toBe(2);
                expect(result.current.isLoading).toBe(false);
            });

            // Should have both results
            expect(result.current.cards.length).toBe(2);
        });

        it('should not do dual-search for non-collision names', async () => {
            (searchMpcAutofill as ReturnType<typeof vi.fn>).mockResolvedValue([]);

            renderHook(() => useMpcSearch('Sol Ring'));

            await act(async () => {
                vi.advanceTimersByTime(600);
            });

            await vi.waitFor(() => {
                expect(searchMpcAutofill).toHaveBeenCalled();
            });

            // Should only call once with CARD type
            expect(searchMpcAutofill).toHaveBeenCalledTimes(1);
            expect(searchMpcAutofill).toHaveBeenCalledWith('Sol Ring', 'CARD', true);
        });
    });

    describe('filtering', () => {
        const mockCards = [
            { id: '1', name: 'Card A', dpi: 1200, sourceName: 'Source A', tags: ['Tag1'] },
            { id: '2', name: 'Card B', dpi: 800, sourceName: 'Source B', tags: ['Tag2'] },
            { id: '3', name: 'Card C', dpi: 600, sourceName: 'Source A', tags: ['Tag1', 'Tag2'] },
        ];

        it('should filter by minimum DPI', async () => {
            (searchMpcAutofill as ReturnType<typeof vi.fn>).mockResolvedValue(mockCards);

            const { result } = renderHook(() => useMpcSearch('Sol Ring'));

            await act(async () => {
                vi.advanceTimersByTime(600);
            });

            await vi.waitFor(() => {
                expect(result.current.cards.length).toBe(3);
                expect(result.current.isLoading).toBe(false);
            });

            // Default minDpi is 800, so Card C (600 dpi) should be filtered out
            expect(result.current.filteredCards.length).toBe(2);
            expect(result.current.filteredCards.map(c => c.name)).not.toContain('Card C');
        });

        it('should filter by source', async () => {
            (searchMpcAutofill as ReturnType<typeof vi.fn>).mockResolvedValue(mockCards);

            const { result } = renderHook(() => useMpcSearch('Sol Ring'));

            await act(async () => {
                vi.advanceTimersByTime(600);
            });

            await vi.waitFor(() => {
                expect(result.current.cards.length).toBe(3);
                expect(result.current.isLoading).toBe(false);
            });

            await act(async () => {
                result.current.toggleSource('Source A');
                vi.advanceTimersByTime(10);
            });

            // With minDpi 800 and Source A filter, only Card A should remain
            expect(result.current.filteredCards.length).toBe(1);
            expect(result.current.filteredCards[0].name).toBe('Card A');
        });

        it('should clear all filters', async () => {
            (searchMpcAutofill as ReturnType<typeof vi.fn>).mockResolvedValue(mockCards);

            const { result } = renderHook(() => useMpcSearch('Sol Ring'));

            await act(async () => {
                vi.advanceTimersByTime(600);
            });

            await vi.waitFor(() => {
                expect(result.current.cards.length).toBe(3);
                expect(result.current.isLoading).toBe(false);
            });

            await act(async () => {
                result.current.setMinDpi(1200);
                result.current.toggleSource('Source A');
                vi.advanceTimersByTime(10);
            });

            expect(result.current.filteredCards.length).toBe(1);

            await act(async () => {
                result.current.clearFilters();
                vi.advanceTimersByTime(10);
            });

            // After clearing, all 3 cards should be visible (minDpi becomes 0)
            expect(result.current.filteredCards.length).toBe(3);
        });
    });

    describe('sorting', () => {
        const mockCards = [
            { id: '1', name: 'Zebra', dpi: 800, sourceName: 'C Source' },
            { id: '2', name: 'Alpha', dpi: 1200, sourceName: 'A Source' },
            { id: '3', name: 'Middle', dpi: 1000, sourceName: 'B Source' },
        ];

        it('should sort by DPI descending by default', async () => {
            (searchMpcAutofill as ReturnType<typeof vi.fn>).mockResolvedValue(mockCards);

            const { result } = renderHook(() => useMpcSearch('Test'));

            await act(async () => {
                vi.advanceTimersByTime(600);
            });

            await vi.waitFor(() => {
                expect(result.current.cards.length).toBe(3);
                expect(result.current.isLoading).toBe(false);
            });

            await act(async () => {
                result.current.setMinDpi(0);
                vi.advanceTimersByTime(10);
            });

            expect(result.current.filteredCards[0].dpi).toBe(1200);
            expect(result.current.filteredCards[1].dpi).toBe(1000);
            expect(result.current.filteredCards[2].dpi).toBe(800);
        });

        it('should sort by name when setSortBy is called', async () => {
            (searchMpcAutofill as ReturnType<typeof vi.fn>).mockResolvedValue(mockCards);

            const { result } = renderHook(() => useMpcSearch('Test'));

            await act(async () => {
                vi.advanceTimersByTime(600);
            });

            await vi.waitFor(() => {
                expect(result.current.cards.length).toBe(3);
                expect(result.current.isLoading).toBe(false);
            });

            await act(async () => {
                result.current.setMinDpi(0);
                result.current.setSortBy('name');
                result.current.setSortDir('asc');
                vi.advanceTimersByTime(10);
            });

            expect(result.current.filteredCards[0].name).toBe('Alpha');
            expect(result.current.filteredCards[1].name).toBe('Middle');
            expect(result.current.filteredCards[2].name).toBe('Zebra');
        });
    });

    describe('activeFilterCount', () => {
        it('should count active filters correctly', async () => {
            (searchMpcAutofill as ReturnType<typeof vi.fn>).mockResolvedValue([]);

            const { result } = renderHook(() => useMpcSearch('Test'));

            await act(async () => {
                vi.advanceTimersByTime(600);
            });

            expect(result.current.hasSearched).toBe(true);
            expect(result.current.isLoading).toBe(false);

            expect(result.current.activeFilterCount).toBe(0);

            await act(async () => {
                result.current.setMinDpi(1200); // Different from default 800
                result.current.toggleSource('Source A');
                result.current.toggleTag('Tag1');
                vi.advanceTimersByTime(10);
            });

            // 1 for DPI change + 1 for source + 1 for tag
            expect(result.current.activeFilterCount).toBe(3);
        });
    });
});
