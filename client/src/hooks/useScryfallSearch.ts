import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { extractCardInfo, hasIncompleteTagSyntax } from "@/helpers/cardInfoHelper";
import { getImages, type RawScryfallCard } from "@/helpers/scryfallApi";
import { debugLog } from "@/helpers/debug";
import { API_BASE } from "@/constants";
import type { ScryfallCard } from "../../../shared/types";

export interface ScryfallSearchResult {
    /** Array of card results */
    cards: ScryfallCard[];
    /** Whether a search is currently in progress */
    isLoading: boolean;
    /** Whether at least one search has been performed */
    hasSearched: boolean;
    /** Whether there are any results */
    hasResults: boolean;
}

export interface UseScryfallSearchOptions {
    /** Whether to auto-search on query change (default: true) */
    autoSearch?: boolean;
}

// Global cache shared across all instances - persists across mode switches
const globalSearchCache: Record<string, ScryfallCard[]> = {};

/**
 * Helper to map Scryfall API response to ScryfallCard objects
 */
function mapResponseToCards(data: { data?: RawScryfallCard[] }): ScryfallCard[] {
    if (!data.data || data.data.length === 0) return [];
    return data.data.map((card: RawScryfallCard) => ({
        name: card.name,
        set: card.set,
        setName: card.set_name,
        number: card.collector_number,
        imageUrls: getImages(card),
        lang: card.lang,
        cmc: card.cmc,
        type_line: card.type_line,
        rarity: card.rarity,
    } as ScryfallCard));
}

/**
 * Hook for searching Scryfall cards with standardized return interface.
 * Results are cached globally so they persist when switching between modes.
 * 
 * @param query - Search query (card name, set code, scryfall syntax)
 * @param options - Configuration options
 * @returns ScryfallSearchResult with cards, loading state, and search status
 */
export function useScryfallSearch(
    query: string,
    options: UseScryfallSearchOptions = {}
): ScryfallSearchResult {
    const { autoSearch = true } = options;

    const [cards, setCards] = useState<ScryfallCard[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    // Refs for request management
    const abortControllerRef = useRef<AbortController | null>(null);
    const currentQueryRef = useRef<string>("");
    const lastSearchedQueryRef = useRef<string>("");

    // Compute cache key for the current query
    const getCacheKey = useCallback((q: string): string | null => {
        const trimmed = q.trim();
        if (trimmed.length < 2) return null;

        const { name: cleanedName, set, number } = extractCardInfo(trimmed);

        if (set && number) {
            return `card|${set}|${number}`;
        } else if (set && cleanedName) {
            return `set|${cleanedName}|${set}`;
        } else if (trimmed.includes(':')) {
            return `syntax|${trimmed}`;
        } else {
            return `name|${cleanedName || trimmed}`;
        }
    }, []);

    // Check if we have cached results for the current query
    const cachedResult = useMemo(() => {
        const cacheKey = getCacheKey(query);
        if (cacheKey && globalSearchCache[cacheKey] !== undefined) {
            return globalSearchCache[cacheKey];
        }
        return null;
    }, [query, getCacheKey]);

    // Update cards from cache immediately if available
    useEffect(() => {
        if (cachedResult !== null) {
            setCards(cachedResult);
            setHasSearched(true);
        }
    }, [cachedResult]);

    // Search effect
    useEffect(() => {
        // Don't search if autoSearch is disabled
        if (!autoSearch) return;

        // Skip if we have cached results
        if (cachedResult !== null) return;

        // Abort any in-flight request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const performSearch = async () => {
            currentQueryRef.current = query;

            // Skip if incomplete syntax
            if (hasIncompleteTagSyntax(query)) return;

            const trimmedQuery = query.trim();
            if (trimmedQuery.length < 2) {
                setCards([]);
                return;
            }

            // Skip if we already searched this query
            if (lastSearchedQueryRef.current === trimmedQuery) return;

            const cacheKey = getCacheKey(query);
            if (!cacheKey) return;

            const { name: cleanedName, set, number } = extractCardInfo(trimmedQuery);

            // Create abort controller
            const controller = new AbortController();
            abortControllerRef.current = controller;

            try {
                setIsLoading(true);

                let resultCards: ScryfallCard[] = [];

                if (set && number) {
                    // Specific card lookup
                    const res = await fetch(`${API_BASE}/api/scryfall/cards/${set}/${number}`, {
                        signal: controller.signal
                    });

                    if (currentQueryRef.current !== query) return;

                    if (res.ok) {
                        const data = await res.json();
                        if (!cleanedName || data.name.toLowerCase().includes(cleanedName.toLowerCase())) {
                            resultCards = [{
                                name: data.name,
                                set: data.set,
                                number: data.collector_number,
                                imageUrls: getImages(data),
                                lang: data.lang,
                                cmc: data.cmc,
                                type_line: data.type_line,
                                rarity: data.rarity,
                            }];
                        }
                    }
                } else {
                    // Search query
                    let searchQuery: string;
                    if (set && cleanedName) {
                        searchQuery = `!"${cleanedName}" set:${set} unique:prints`;
                    } else if (trimmedQuery.includes(':')) {
                        searchQuery = trimmedQuery;
                    } else {
                        searchQuery = cleanedName || trimmedQuery;
                    }

                    const res = await fetch(`${API_BASE}/api/scryfall/search?q=${encodeURIComponent(searchQuery)}`, {
                        signal: controller.signal
                    });

                    if (currentQueryRef.current !== query) return;

                    if (res.ok) {
                        const data = await res.json();
                        debugLog('[ScryfallSearch] Search results:', data.data?.length);
                        resultCards = mapResponseToCards(data);

                        // Dedupe by card name
                        const seen = new Set<string>();
                        resultCards = resultCards.filter(card => {
                            const key = card.name.toLowerCase();
                            if (seen.has(key)) return false;
                            seen.add(key);
                            return true;
                        });

                        // Sort by relevance
                        const queryLower = (cleanedName || trimmedQuery).toLowerCase();
                        resultCards = resultCards.sort((a, b) => {
                            const aName = a.name.toLowerCase();
                            const bName = b.name.toLowerCase();

                            const aExact = aName === queryLower;
                            const bExact = bName === queryLower;
                            if (aExact && !bExact) return -1;
                            if (bExact && !aExact) return 1;

                            const aStarts = aName.startsWith(queryLower);
                            const bStarts = bName.startsWith(queryLower);
                            if (aStarts && !bStarts) return -1;
                            if (bStarts && !aStarts) return 1;

                            const wordBoundaryRegex = new RegExp(`\\b${queryLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
                            const aWordMatch = wordBoundaryRegex.test(aName);
                            const bWordMatch = wordBoundaryRegex.test(bName);
                            if (aWordMatch && !bWordMatch) return -1;
                            if (bWordMatch && !aWordMatch) return 1;

                            return aName.localeCompare(bName);
                        });
                    }
                }

                // Cache and update state
                globalSearchCache[cacheKey] = resultCards;
                lastSearchedQueryRef.current = trimmedQuery;
                setCards(resultCards);
                setHasSearched(true);

            } catch (err) {
                if (err instanceof Error && err.name !== 'AbortError') {
                    if (cacheKey) globalSearchCache[cacheKey] = [];
                    setCards([]);
                }
            } finally {
                setIsLoading(false);
            }
        };

        const timeoutId = setTimeout(performSearch, 500);
        return () => {
            clearTimeout(timeoutId);
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [query, autoSearch, cachedResult, getCacheKey]);

    return {
        cards,
        isLoading,
        hasSearched,
        hasResults: cards.length > 0,
    };
}
