import { useState, useEffect, useRef, useCallback } from 'react';
import { autocomplete } from '@/helpers/scryfallApi';

interface ScryfallAutocompleteInputProps {
    initialValue: string;
    onSelect: (cardName: string) => void;
    onCancel: () => void;
    placeholder?: string;
    className?: string;
}

export function ScryfallAutocompleteInput({
    initialValue,
    onSelect,
    onCancel,
    placeholder = 'Search Scryfall...',
    className,
}: ScryfallAutocompleteInputProps) {
    const [query, setQuery] = useState(initialValue);

    useEffect(() => {
        setQuery(initialValue);
        setSuggestions([]);
    }, [initialValue]);

    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [isLoading, setIsLoading] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const fetchSuggestions = useCallback((q: string) => {
        abortRef.current?.abort();
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const trimmed = q.trim();
        if (trimmed.length < 2) {
            setSuggestions([]);
            return;
        }
        debounceRef.current = setTimeout(async () => {
            const controller = new AbortController();
            abortRef.current = controller;
            setIsLoading(true);
            try {
                const results = await autocomplete(trimmed, controller.signal);
                if (!controller.signal.aborted) {
                    setSuggestions(results.slice(0, 8));
                    setSelectedIndex(-1);
                }
            } catch {
                if (!controller.signal.aborted) setSuggestions([]);
            } finally {
                if (!controller.signal.aborted) setIsLoading(false);
            }
        }, 200);
    }, []);

    useEffect(() => {
        return () => {
            abortRef.current?.abort();
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    const handleChange = (value: string) => {
        setQuery(value);
        fetchSuggestions(value);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, -1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const selected = selectedIndex >= 0 ? suggestions[selectedIndex] : query;
            if (selected.trim()) {
                onSelect(selected.trim());
                setSuggestions([]);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
        }
    };

    const handleSuggestionClick = (name: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect(name);
        setSuggestions([]);
    };

    return (
        <div
            ref={containerRef}
            className={`relative w-full ${className || ''}`}
            onClick={(e) => e.stopPropagation()}
        >
            <input
                type="text"
                value={query}
                onChange={(e) => handleChange(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                placeholder={placeholder}
                className="w-full text-xs bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 focus:outline-none focus:border-blue-500"
            />
            {isLoading && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                </div>
            )}
            {suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-0.5 bg-gray-800 border border-gray-600 rounded shadow-lg max-h-40 overflow-y-auto z-50">
                    {suggestions.map((name, i) => (
                        <button
                            key={name}
                            type="button"
                            onMouseDown={(e) => handleSuggestionClick(name, e)}
                            className={`w-full text-left text-xs px-2 py-1.5 truncate transition-colors ${i === selectedIndex
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-200 hover:bg-gray-700'
                                }`}
                        >
                            {name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
