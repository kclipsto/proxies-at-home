import { useState, useRef, useEffect } from "react";
import { extractCardInfo, hasIncompleteTagSyntax } from "@/helpers/cardInfoHelper";
import { getImages, mapResponseToCards } from "@/helpers/scryfallApi";
import { debugLog } from "@/helpers/debug";
import { API_BASE } from "@/constants";
import type { ScryfallCard } from "../../../shared/types";



export function useScryfallPreview(query: string) {
    const [setVariations, setSetVariations] = useState<ScryfallCard[]>([]);
    const [validatedPreviewUrl, setValidatedPreviewUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    // Cache for search results
    const searchCache = useRef<Record<string, ScryfallCard[]>>({});
    // AbortController for canceling in-flight requests
    const abortControllerRef = useRef<AbortController | null>(null);
    // Track the current query to prevent stale updates
    const currentQueryRef = useRef<string>("");

    useEffect(() => {
        // Abort any in-flight request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const performSearch = async () => {
            // Store current query to check for staleness
            currentQueryRef.current = query;

            // Skip if incomplete syntax (user still typing a tag)
            if (hasIncompleteTagSyntax(query)) {
                return;
            }

            // Trim the query and skip if too short or ends with whitespace being typed
            const trimmedQuery = query.trim();
            if (trimmedQuery.length < 2) {
                setSetVariations([]);
                setValidatedPreviewUrl(null);
                return;
            }

            // Use trimmed query for the search
            const { name: cleanedName, set, number } = extractCardInfo(trimmedQuery);

            // Build the search query based on input format
            let searchQuery: string;
            let cacheKey: string;

            if (set && number) {
                // Specific card lookup: Name [Set] {Number}
                // Use the direct card endpoint for this case
                cacheKey = `card|${set}|${number}`;
                if (searchCache.current[cacheKey] !== undefined) {
                    setSetVariations(searchCache.current[cacheKey]);
                    setValidatedPreviewUrl(null);
                    return;
                }

                // Create abort controller for this request
                const controller = new AbortController();
                abortControllerRef.current = controller;

                try {
                    setIsLoading(true);
                    const res = await fetch(`${API_BASE}/api/scryfall/cards/${set}/${number}`, {
                        signal: controller.signal
                    });

                    // Check if this is still the current query
                    if (currentQueryRef.current !== query) return;

                    if (res.ok) {
                        const data = await res.json();
                        // Validate name if provided
                        if (cleanedName && !data.name.toLowerCase().includes(cleanedName.toLowerCase())) {
                            searchCache.current[cacheKey] = [];
                            setSetVariations([]);
                        } else {
                            const card: ScryfallCard = {
                                name: data.name,
                                set: data.set,
                                number: data.collector_number,
                                imageUrls: getImages(data),
                                lang: data.lang,
                                cmc: data.cmc,
                                type_line: data.type_line,
                                rarity: data.rarity,
                            };
                            searchCache.current[cacheKey] = [card];
                            setSetVariations([card]);
                        }
                    } else {
                        searchCache.current[cacheKey] = [];
                        setSetVariations([]);
                    }
                } catch (err) {
                    if (err instanceof Error && err.name !== 'AbortError') {
                        searchCache.current[cacheKey] = [];
                        setSetVariations([]);
                    }
                } finally {
                    setIsLoading(false);
                }
                setValidatedPreviewUrl(null);
                return;
            }

            if (set && cleanedName) {
                // Card name in specific set: "Forest [m21]" -> !"Forest" set:m21
                searchQuery = `!"${cleanedName}" set:${set} unique:prints`;
                cacheKey = `set|${cleanedName}|${set}`;
            } else if (trimmedQuery.includes(':')) {
                // Scryfall syntax: pass query directly
                searchQuery = trimmedQuery;
                cacheKey = `syntax|${trimmedQuery}`;
            } else {
                // Simple card name: search for it
                searchQuery = cleanedName || trimmedQuery;
                cacheKey = `name|${searchQuery}`;
            }

            // Check cache
            if (searchCache.current[cacheKey] !== undefined) {
                setSetVariations(searchCache.current[cacheKey]);
                setValidatedPreviewUrl(null);
                return;
            }

            // Create abort controller for this request
            const controller = new AbortController();
            abortControllerRef.current = controller;

            // Perform search
            try {
                setIsLoading(true);
                const res = await fetch(`${API_BASE}/api/scryfall/search?q=${encodeURIComponent(searchQuery)}`, {
                    signal: controller.signal
                });

                // Check if this is still the current query
                if (currentQueryRef.current !== query) return;

                if (res.ok) {
                    const data = await res.json();
                    debugLog('[AdvancedSearch] Search results:', data.data?.length);
                    let cards = mapResponseToCards(data);

                    // Dedupe by card name - keep only the first/best version of each card
                    const seen = new Set<string>();
                    cards = cards.filter(card => {
                        const key = card.name.toLowerCase();
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });

                    // Sort by relevance: exact > starts with > word boundary > contains
                    const queryLower = (cleanedName || trimmedQuery).toLowerCase();
                    cards = cards.sort((a, b) => {
                        const aName = a.name.toLowerCase();
                        const bName = b.name.toLowerCase();

                        // Priority 1: Exact match
                        const aExact = aName === queryLower;
                        const bExact = bName === queryLower;
                        if (aExact && !bExact) return -1;
                        if (bExact && !aExact) return 1;

                        // Priority 2: Starts with query
                        const aStarts = aName.startsWith(queryLower);
                        const bStarts = bName.startsWith(queryLower);
                        if (aStarts && !bStarts) return -1;
                        if (bStarts && !aStarts) return 1;

                        // Priority 3: Word boundary match (query at start of a word)
                        const wordBoundaryRegex = new RegExp(`\\b${queryLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
                        const aWordMatch = wordBoundaryRegex.test(aName);
                        const bWordMatch = wordBoundaryRegex.test(bName);
                        if (aWordMatch && !bWordMatch) return -1;
                        if (bWordMatch && !aWordMatch) return 1;

                        // Priority 4: Alphabetical for equal relevance
                        return aName.localeCompare(bName);
                    });

                    searchCache.current[cacheKey] = cards;
                    setSetVariations(cards);
                } else {
                    searchCache.current[cacheKey] = [];
                    setSetVariations([]);
                }
            } catch (err) {
                if (err instanceof Error && err.name !== 'AbortError') {
                    searchCache.current[cacheKey] = [];
                    setSetVariations([]);
                }
            } finally {
                setIsLoading(false);
                setHasSearched(true);
            }
            setValidatedPreviewUrl(null);
        };

        const timeoutId = setTimeout(performSearch, 500); // Debounce
        return () => {
            clearTimeout(timeoutId);
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [query]);

    return { setVariations, validatedPreviewUrl, isLoading, hasSearched };
}
