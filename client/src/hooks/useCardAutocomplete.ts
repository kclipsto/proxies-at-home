import { useState, useRef, useEffect, useCallback } from "react";
import { autocomplete, searchCards, getCardByName } from "@/helpers/scryfallApi";
import { hasIncompleteTagSyntax } from "@/helpers/CardInfoHelper";

interface UseCardAutocompleteProps {
    onSelect: (value: string) => void;
}

export function useCardAutocomplete({ onSelect }: UseCardAutocompleteProps) {
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showAutocomplete, setShowAutocomplete] = useState(false);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [hoverPreviewUrl, setHoverPreviewUrl] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setQuery(value);
        setShowAutocomplete(true);

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        if (value.length < 2) {
            setSuggestions([]);
            return;
        }

        timeoutRef.current = setTimeout(async () => {
            const controller = new AbortController();
            abortControllerRef.current = controller;
            try {
                let newSuggestions: string[] = [];
                if (value.includes(":")) {
                    // Skip search if query ends with incomplete tag: syntax (e.g., "set:", "c:", "t:")
                    if (hasIncompleteTagSyntax(value)) {
                        return;
                    }
                    const cards = await searchCards(value, controller.signal);
                    newSuggestions = Array.from(new Set(cards.map((c) => c.name)));
                } else {
                    newSuggestions = await autocomplete(value, controller.signal);
                }
                setSuggestions(newSuggestions);
                // Batch update: reset index immediately with new suggestions
                if (newSuggestions.length > 0) {
                    setHoveredIndex(0);
                } else {
                    setHoveredIndex(null);
                }
            } catch (err: unknown) {
                if (err instanceof Error && err.name !== "CanceledError") {
                    // Silently handle errors (404s are normal when no cards match)
                    setSuggestions([]);
                    setHoveredIndex(null);
                }
            }
        }, 300);
    }, []);

    const handleSelect = useCallback((value: string) => {
        setQuery(value);
        setSuggestions([]);
        setShowAutocomplete(false);
        setHoverPreviewUrl(null);
        setHoveredIndex(null);
        onSelect(value);
    }, [onSelect]);

    const handleClear = useCallback(() => {
        setQuery("");
        setSuggestions([]);
        setShowAutocomplete(false);
        setHoverPreviewUrl(null);
        setHoveredIndex(null);
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            setShowAutocomplete(false);
            setHoverPreviewUrl(null);
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setHoveredIndex((prev) => {
                if (prev === null) return 0;
                return Math.min(prev + 1, suggestions.length - 1);
            });
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHoveredIndex((prev) => {
                if (prev === null) return suggestions.length - 1;
                return Math.max(prev - 1, 0);
            });
        } else if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            if (hoveredIndex !== null && suggestions.length > 0) {
                handleSelect(suggestions[hoveredIndex]);
            } else {
                // If no suggestion is highlighted, submit the current query
                // We trim it to avoid empty spaces
                if (query.trim()) {
                    onSelect(query.trim());
                    // We also close the autocomplete
                    setSuggestions([]);
                    setShowAutocomplete(false);
                    setHoverPreviewUrl(null);
                    setHoveredIndex(null);
                }
            }
        }
    }, [suggestions, hoveredIndex, handleSelect, query, onSelect]);

    // Click outside handler
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            ) {
                setShowAutocomplete(false);
                setHoverPreviewUrl(null);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    // Fetch preview on hover
    useEffect(() => {
        if (hoveredIndex !== null && suggestions[hoveredIndex]) {
            const cardName = suggestions[hoveredIndex];
            const timer = setTimeout(async () => {
                try {
                    const card = await getCardByName(cardName);
                    if (card.imageUrls?.length) {
                        setHoverPreviewUrl(card.imageUrls[0]);
                    } else {
                        setHoverPreviewUrl(null);
                    }
                } catch {
                    // console.error("Failed to fetch preview", e); // Optional logging
                    setHoverPreviewUrl(null);
                }
            }, 200);
            return () => clearTimeout(timer);
        } else {
            setHoverPreviewUrl(null);
        }
    }, [hoveredIndex, suggestions]);

    return {
        query,
        setQuery,
        suggestions,
        showAutocomplete,
        setShowAutocomplete,
        hoveredIndex,
        setHoveredIndex,
        hoverPreviewUrl,
        containerRef,
        handleInputChange,
        handleSelect,
        handleClear,
        handleKeyDown,
    };
}
