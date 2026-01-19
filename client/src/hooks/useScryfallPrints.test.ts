import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useScryfallPrints } from './useScryfallPrints';

// Mock dependencies
vi.mock('@/helpers/debug', () => ({
    debugLog: vi.fn(),
}));

vi.mock('@/constants', () => ({
    API_BASE: 'http://localhost:3001',
}));

describe('useScryfallPrints', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
        // Reset module to clear global cache between tests
        vi.resetModules();
    });

    describe('initial state', () => {
        it('should return empty results and not loading initially', () => {
            const { result } = renderHook(() => useScryfallPrints(''));

            expect(result.current.prints).toEqual([]);
            expect(result.current.isLoading).toBe(false);
            expect(result.current.hasSearched).toBe(false);
            expect(result.current.hasResults).toBe(false);
        });
    });

    describe('fetch behavior', () => {
        it('should call prints API with card name', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ prints: [], total: 0 }),
            });

            // Use unique card name to avoid global cache collisions
            renderHook(() => useScryfallPrints('Sol Ring API Test'));

            await vi.waitFor(() => {
                expect(global.fetch).toHaveBeenCalled();
            }, { timeout: 1000 });

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/scryfall/prints?name=Sol%20Ring%20API%20Test'),
                expect.anything()
            );
        });

        it('should update prints on successful fetch', async () => {
            const mockPrints = {
                prints: [
                    { set: 'cmd', setName: 'Commander', number: '129', imageUrl: 'https://example.com/img.jpg' },
                    { set: 'c21', setName: 'Commander 2021', number: '129', imageUrl: 'https://example.com/img2.jpg' },
                ],
                total: 2,
            };

            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockPrints),
            });

            // Use unique card name to avoid cache issues
            const { result } = renderHook(() => useScryfallPrints('Sol Ring Update Test'));

            await vi.waitFor(() => {
                expect(result.current.hasSearched).toBe(true);
            }, { timeout: 1000 });

            expect(result.current.prints.length).toBe(2);
            expect(result.current.hasResults).toBe(true);
        });

        it('should include lang parameter in request', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ prints: [], total: 0 }),
            });

            // Use unique card name to avoid global cache collisions
            renderHook(() => useScryfallPrints('Sol Ring Lang Test', { lang: 'ja' }));

            await vi.waitFor(() => {
                expect(global.fetch).toHaveBeenCalled();
            }, { timeout: 1000 });

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('lang=ja'),
                expect.anything()
            );
        });
    });

    describe('autoFetch option', () => {
        it('should not fetch when autoFetch is false', async () => {
            // Use unique card name to avoid global cache collisions
            renderHook(() => useScryfallPrints('Sol Ring AutoFetch Test', { autoFetch: false }));

            await new Promise(r => setTimeout(r, 300));

            expect(global.fetch).not.toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        it('should handle API errors gracefully', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

            const { result } = renderHook(() => useScryfallPrints('Error Test'));

            await vi.waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            }, { timeout: 1000 });

            expect(result.current.prints).toEqual([]);
        });

        it('should handle non-ok responses', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                status: 404,
            });

            const { result } = renderHook(() => useScryfallPrints('Unknown Card'));

            await vi.waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            }, { timeout: 1000 });

            expect(result.current.prints).toEqual([]);
        });
    });

    describe('empty card name', () => {
        it('should not fetch for empty card name', async () => {
            renderHook(() => useScryfallPrints(''));

            await new Promise(r => setTimeout(r, 300));

            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should not fetch for whitespace-only card name', async () => {
            renderHook(() => useScryfallPrints('   '));

            await new Promise(r => setTimeout(r, 300));

            expect(global.fetch).not.toHaveBeenCalled();
        });
    });
});
