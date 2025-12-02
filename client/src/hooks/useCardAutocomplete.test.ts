import { renderHook, act } from '@testing-library/react';
import { useCardAutocomplete } from './useCardAutocomplete';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as scryfallApi from '@/helpers/scryfallApi';

// Mock scryfallApi
vi.mock('@/helpers/scryfallApi', () => ({
    autocomplete: vi.fn(),
    searchCards: vi.fn(),
    getCardByName: vi.fn(),
}));

describe('useCardAutocomplete', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should initialize with default values', () => {
        const { result } = renderHook(() => useCardAutocomplete({ onSelect: vi.fn() }));
        expect(result.current.query).toBe('');
        expect(result.current.suggestions).toEqual([]);
        expect(result.current.showAutocomplete).toBe(false);
    });

    it('should update query on input change', () => {
        const { result } = renderHook(() => useCardAutocomplete({ onSelect: vi.fn() }));

        act(() => {
            result.current.handleInputChange({ target: { value: 'Sol' } } as React.ChangeEvent<HTMLInputElement>);
        });

        expect(result.current.query).toBe('Sol');
    });

    it('should fetch suggestions when query length >= 2', async () => {
        (scryfallApi.autocomplete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(['Sol Ring', 'Solar']);

        const { result } = renderHook(() => useCardAutocomplete({ onSelect: vi.fn() }));

        await act(async () => {
            result.current.handleInputChange({ target: { value: 'Sol' } } as React.ChangeEvent<HTMLInputElement>);
            // Fast-forward timers for debounce if implemented, or wait for promise
            // Assuming debounce is used, we might need fake timers.
            // For now, let's assume the hook might debounce.
            await new Promise(resolve => setTimeout(resolve, 350));
        });

        expect(scryfallApi.autocomplete).toHaveBeenCalledWith('Sol', expect.any(AbortSignal));
        expect(result.current.suggestions).toEqual(['Sol Ring', 'Solar']);
        expect(result.current.showAutocomplete).toBe(true);
    });

    it('should handle selection', () => {
        const onSelect = vi.fn();
        const { result } = renderHook(() => useCardAutocomplete({ onSelect }));

        act(() => {
            result.current.handleSelect('Sol Ring');
        });

        expect(onSelect).toHaveBeenCalledWith('Sol Ring');
        expect(result.current.query).toBe('Sol Ring');
        expect(result.current.showAutocomplete).toBe(false);
    });

    it('should handle clear', () => {
        const { result } = renderHook(() => useCardAutocomplete({ onSelect: vi.fn() }));

        act(() => {
            result.current.handleInputChange({ target: { value: 'Sol' } } as React.ChangeEvent<HTMLInputElement>);
            result.current.handleClear();
        });

        expect(result.current.query).toBe('');
        expect(result.current.suggestions).toEqual([]);
        expect(result.current.showAutocomplete).toBe(false);
    });
});
