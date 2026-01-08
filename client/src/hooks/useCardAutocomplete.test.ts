import { renderHook, act } from '@testing-library/react';
import { useCardAutocomplete } from './useCardAutocomplete';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('useCardAutocomplete', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should initialize with default values', () => {
        const { result } = renderHook(() => useCardAutocomplete({ onSelect: vi.fn() }));
        expect(result.current.query).toBe('');
        expect(result.current.hoveredIndex).toBeNull();
    });

    it('should update query on input change', () => {
        const { result } = renderHook(() => useCardAutocomplete({ onSelect: vi.fn() }));

        act(() => {
            result.current.handleInputChange({ target: { value: 'Sol' } } as React.ChangeEvent<HTMLInputElement>);
        });

        expect(result.current.query).toBe('Sol');
        expect(result.current.hoveredIndex).toBeNull();
    });

    it('should handle clear', () => {
        const { result } = renderHook(() => useCardAutocomplete({ onSelect: vi.fn() }));

        act(() => {
            result.current.handleInputChange({ target: { value: 'Sol' } } as React.ChangeEvent<HTMLInputElement>);
            result.current.handleClear();
        });

        expect(result.current.query).toBe('');
        expect(result.current.hoveredIndex).toBeNull();
    });

    describe('keyboard navigation', () => {
        it('should navigate down with ArrowDown', () => {
            const { result } = renderHook(() => useCardAutocomplete({ onSelect: vi.fn() }));

            act(() => {
                const handler = result.current.createKeyDownHandler(5);
                handler({ key: 'ArrowDown', preventDefault: vi.fn() } as unknown as React.KeyboardEvent);
            });

            expect(result.current.hoveredIndex).toBe(0);
        });

        it('should navigate up with ArrowUp', () => {
            const { result } = renderHook(() => useCardAutocomplete({ onSelect: vi.fn() }));

            // Start from index 2
            act(() => {
                result.current.setHoveredIndex(2);
            });

            act(() => {
                const handler = result.current.createKeyDownHandler(5);
                handler({ key: 'ArrowUp', preventDefault: vi.fn() } as unknown as React.KeyboardEvent);
            });

            expect(result.current.hoveredIndex).toBe(1);
        });

        it('should call onSelect on Enter with query', () => {
            const onSelect = vi.fn();
            const { result } = renderHook(() => useCardAutocomplete({ onSelect }));

            act(() => {
                result.current.handleInputChange({ target: { value: 'Sol Ring' } } as React.ChangeEvent<HTMLInputElement>);
            });

            act(() => {
                const handler = result.current.createKeyDownHandler(0);
                handler({ key: 'Enter', preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.KeyboardEvent);
            });

            expect(onSelect).toHaveBeenCalledWith('Sol Ring');
        });

        it('should not call onSelect on Enter with empty query', () => {
            const onSelect = vi.fn();
            const { result } = renderHook(() => useCardAutocomplete({ onSelect }));

            act(() => {
                const handler = result.current.createKeyDownHandler(0);
                handler({ key: 'Enter', preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.KeyboardEvent);
            });

            expect(onSelect).not.toHaveBeenCalled();
        });

        it('should reset hoveredIndex on Escape', () => {
            const { result } = renderHook(() => useCardAutocomplete({ onSelect: vi.fn() }));

            act(() => {
                result.current.setHoveredIndex(2);
            });

            act(() => {
                const handler = result.current.createKeyDownHandler(5);
                handler({ key: 'Escape' } as React.KeyboardEvent);
            });

            expect(result.current.hoveredIndex).toBeNull();
        });
    });
});
