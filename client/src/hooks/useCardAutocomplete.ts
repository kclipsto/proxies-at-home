import { useState, useRef, useEffect, useCallback } from "react";

interface UseCardAutocompleteProps {
    onSelect: (value: string) => void;
}

/**
 * Hook for managing card search input state and keyboard navigation.
 * Does NOT perform any API fetching - that's handled by useScryfallPreview.
 */
export function useCardAutocomplete({ onSelect }: UseCardAutocompleteProps) {
    const [query, setQuery] = useState("");
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setQuery(e.target.value);
        setHoveredIndex(null);
    }, []);

    const handleClear = useCallback(() => {
        setQuery("");
        setHoveredIndex(null);
    }, []);

    /**
     * Creates a keyboard handler for arrow/enter navigation.
     * @param itemCount - Total number of items to navigate through
     */
    const createKeyDownHandler = useCallback((itemCount: number) => {
        return (e: React.KeyboardEvent) => {
            if (e.key === "Escape") {
                setHoveredIndex(null);
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setHoveredIndex((prev) => {
                    if (itemCount === 0) return null;
                    if (prev === null) return 0;
                    return Math.min(prev + 1, itemCount - 1);
                });
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHoveredIndex((prev) => {
                    if (itemCount === 0) return null;
                    if (prev === null) return itemCount - 1;
                    return Math.max(prev - 1, 0);
                });
            } else if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                // Callback with trimmed query
                const trimmed = query.trim();
                if (trimmed) {
                    onSelect(trimmed);
                }
            }
        };
    }, [query, onSelect]);

    // Legacy handleKeyDown that doesn't know about item count
    // Components should use createKeyDownHandler instead
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        createKeyDownHandler(0)(e);
    }, [createKeyDownHandler]);

    // Click outside handler
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            ) {
                setHoveredIndex(null);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    return {
        query,
        setQuery,
        hoveredIndex,
        setHoveredIndex,
        containerRef,
        handleInputChange,
        handleClear,
        handleKeyDown,
        createKeyDownHandler,
    };
}
