import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { searchMpcAutofill, type MpcAutofillCard } from "@/helpers/mpcAutofillApi";
import { buildMpcSearchParams, TOKEN_TYPE_COLLISIONS, type MpcCardType } from "@/helpers/tokenQueryUtils";
import { useSettingsStore } from "@/store";

export interface MpcFilterState {
    minDpi: number;
    sourceFilters: Set<string>;
    tagFilters: Set<string>;
    sortBy: "name" | "dpi" | "source";
    sortDir: "asc" | "desc";
    fuzzySearch: boolean;
}

export interface MpcSearchResult {
    /** Raw search results (unfiltered) */
    cards: MpcAutofillCard[];
    /** Filtered and sorted results */
    filteredCards: MpcAutofillCard[];
    /** Whether a search is currently in progress */
    isLoading: boolean;
    /** Whether at least one search has been performed */
    hasSearched: boolean;
    /** Whether there are any results */
    hasResults: boolean;
    /** Filter state and setters */
    filters: MpcFilterState;
    /** Available sources from results */
    sources: { name: string; hasResults: boolean }[];
    /** Available tags from results */
    tags: { name: string; hasResults: boolean }[];
    /** Grouped results by source (when sortBy is 'source') */
    groupedBySource: Map<string, MpcAutofillCard[]> | null;
    /** Filter handlers */
    setMinDpi: (dpi: number) => void;
    setSourceFilters: React.Dispatch<React.SetStateAction<Set<string>>>;
    setTagFilters: React.Dispatch<React.SetStateAction<Set<string>>>;
    setSortBy: (sort: "name" | "dpi" | "source") => void;
    setSortDir: (dir: "asc" | "desc") => void;
    toggleSource: (source: string) => void;
    toggleTag: (tag: string) => void;
    toggleDpi: (dpi: number) => void;
    clearFilters: () => void;
    /** Count of active filters */
    activeFilterCount: number;
}

export interface UseMpcSearchOptions {
    /** Whether to auto-search on query change */
    autoSearch?: boolean;
    /** Card data for auto-detecting token type (optional) */
    cardData?: { type_line?: string };
    /** Override card type (CARD, TOKEN, CARDBACK) - if not set, auto-detects */
    cardType?: MpcCardType;
}

/**
 * Hook for searching MPC Autofill cards with filtering and sorting.
 * Extracts search/filter logic from MpcArtContent for reuse.
 */
export function useMpcSearch(
    query: string,
    options: UseMpcSearchOptions = {}
): MpcSearchResult {
    const { autoSearch = true, cardData, cardType: overrideCardType } = options;

    // Settings store for favorites
    const favoriteMpcSources = useSettingsStore(s => s.favoriteMpcSources);
    const favoriteMpcTags = useSettingsStore(s => s.favoriteMpcTags);
    const favoriteMpcDpi = useSettingsStore(s => s.favoriteMpcDpi);
    const favoriteMpcSort = useSettingsStore(s => s.favoriteMpcSort);
    const mpcFuzzySearch = useSettingsStore(s => s.mpcFuzzySearch);

    // Search state
    const [cards, setCards] = useState<MpcAutofillCard[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    // Filter state
    const [minDpi, setMinDpi] = useState<number>(() => favoriteMpcDpi ?? 800);
    const [sourceFilters, setSourceFilters] = useState<Set<string>>(() => new Set(favoriteMpcSources));
    const [tagFilters, setTagFilters] = useState<Set<string>>(() => new Set(favoriteMpcTags));
    const [sortBy, setSortByInternal] = useState<"name" | "dpi" | "source">(() => favoriteMpcSort ?? "dpi");
    // Default direction: ascending for name/source, descending for DPI
    const getDefaultSortDir = (sort: "name" | "dpi" | "source") => sort === "dpi" ? "desc" : "asc";
    const [sortDir, setSortDir] = useState<"asc" | "desc">(() => getDefaultSortDir(favoriteMpcSort ?? "dpi"));

    // Wrapper for setSortBy that also updates direction to smart default
    const setSortBy = (sort: "name" | "dpi" | "source") => {
        setSortByInternal(sort);
        setSortDir(getDefaultSortDir(sort));
    };

    // Refs for search deduplication
    const lastSearchParams = useRef<{ name: string; fuzzy: boolean; cardType: MpcCardType; isCollision?: boolean } | null>(null);
    const lastSearchedName = useRef<string>("");

    // Search handler
    const performSearch = useCallback(async () => {
        if (!query || !query.trim()) return;

        // Parse query for token prefix and determine card type
        const { query: searchQuery, cardType: detectedType } = buildMpcSearchParams(query, cardData);
        // Use override if provided, otherwise use detected type
        const effectiveCardType = overrideCardType ?? detectedType;

        // Check if query matches a token/type collision (e.g., "treasure", "blood", "clue")
        // For these, search BOTH CARD and TOKEN and merge results
        const isCollision = TOKEN_TYPE_COLLISIONS.has(searchQuery.toLowerCase()) && effectiveCardType === 'CARD';

        // Skip if same search params (use ref to avoid dependency on cards state)
        if (lastSearchParams.current?.name === searchQuery &&
            lastSearchParams.current?.fuzzy === mpcFuzzySearch &&
            lastSearchParams.current?.cardType === effectiveCardType &&
            lastSearchParams.current?.isCollision === isCollision) return;

        lastSearchParams.current = { name: searchQuery, fuzzy: mpcFuzzySearch, cardType: effectiveCardType, isCollision };
        lastSearchedName.current = query;
        setIsLoading(true);
        setHasSearched(true);

        try {
            if (isCollision) {
                // Dual search: get both regular cards and tokens for collision names
                const [cardResults, tokenResults] = await Promise.all([
                    searchMpcAutofill(searchQuery, 'CARD', mpcFuzzySearch),
                    searchMpcAutofill(searchQuery, 'TOKEN', mpcFuzzySearch),
                ]);
                // Merge results (tokens first, then cards)
                setCards([...tokenResults, ...cardResults]);
            } else {
                const results = await searchMpcAutofill(searchQuery, effectiveCardType, mpcFuzzySearch);
                setCards(results);
            }
        } catch (err) {
            console.error("MPC search error:", err);
            setCards([]);
        } finally {
            setIsLoading(false);
        }
    }, [query, mpcFuzzySearch, cardData, overrideCardType]);

    // Auto-search effect
    useEffect(() => {
        // When query is empty, only reset if autoSearch is enabled AND we haven't already reset
        if (!query || !query.trim()) {
            if (autoSearch && lastSearchedName.current !== "") {
                setHasSearched(false);
                setIsLoading(false);
                setCards([]);
                lastSearchedName.current = "";
                lastSearchParams.current = null;
            }
            return;
        }

        if (!autoSearch || query === lastSearchedName.current) return;

        const timeoutId = setTimeout(() => {
            performSearch();
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [autoSearch, query, performSearch]);

    // Re-search when fuzzy toggle changes
    useEffect(() => {
        if (!hasSearched || !query || query !== lastSearchedName.current) return;
        if (lastSearchParams.current?.fuzzy === mpcFuzzySearch) return;
        performSearch();
    }, [mpcFuzzySearch, hasSearched, query, performSearch]);

    // Filtered results
    const filteredCards = useMemo(() => {
        let filtered = cards;

        // Filter by DPI
        if (minDpi > 0) {
            filtered = filtered.filter(c => (c.dpi || 0) >= minDpi);
        }

        // Filter by source
        if (sourceFilters.size > 0) {
            filtered = filtered.filter(c => sourceFilters.has(c.sourceName));
        }

        // Filter by tags
        if (tagFilters.size > 0) {
            filtered = filtered.filter(c =>
                c.tags?.some(tag => tagFilters.has(tag))
            );
        }

        // Sort
        filtered = [...filtered].sort((a, b) => {
            let cmp = 0;
            if (sortBy === "dpi") {
                cmp = (a.dpi || 0) - (b.dpi || 0);
            } else if (sortBy === "name") {
                cmp = a.name.localeCompare(b.name);
            } else if (sortBy === "source") {
                cmp = a.sourceName.localeCompare(b.sourceName);
            }
            return sortDir === "asc" ? cmp : -cmp;
        });

        // Note: Pin-to-top sorting is now done in CardArtContent for consistency with Scryfall

        return filtered;
    }, [cards, minDpi, sourceFilters, tagFilters, sortBy, sortDir]);

    // Available sources
    const sources = useMemo(() => {
        const sourcesInResults = new Set(cards.map(c => c.sourceName));
        const allSources = new Set([...sourcesInResults, ...favoriteMpcSources]);
        return Array.from(allSources)
            .map(name => ({ name, hasResults: sourcesInResults.has(name) }))
            .sort((a, b) => {
                const aFav = favoriteMpcSources.includes(a.name);
                const bFav = favoriteMpcSources.includes(b.name);
                if (aFav && !bFav) return -1;
                if (!aFav && bFav) return 1;
                return a.name.localeCompare(b.name);
            });
    }, [cards, favoriteMpcSources]);

    // Available tags
    const tags = useMemo(() => {
        const tagsInResults = new Set(cards.flatMap(c => c.tags || []));
        const allTags = new Set([...tagsInResults, ...favoriteMpcTags]);
        return Array.from(allTags)
            .map(name => ({ name, hasResults: tagsInResults.has(name) }))
            .sort((a, b) => {
                const aFav = favoriteMpcTags.includes(a.name);
                const bFav = favoriteMpcTags.includes(b.name);
                if (aFav && !bFav) return -1;
                if (!aFav && bFav) return 1;
                return a.name.localeCompare(b.name);
            });
    }, [cards, favoriteMpcTags]);

    // Grouped by source
    const groupedBySource = useMemo(() => {
        if (sortBy !== "source") return null;
        const groups = new Map<string, MpcAutofillCard[]>();
        for (const card of filteredCards) {
            const existing = groups.get(card.sourceName) || [];
            existing.push(card);
            groups.set(card.sourceName, existing);
        }
        return groups;
    }, [filteredCards, sortBy]);

    // Filter handlers
    const toggleSource = useCallback((source: string) => {
        setSourceFilters(prev => {
            const next = new Set(prev);
            if (next.has(source)) next.delete(source);
            else next.add(source);
            return next;
        });
    }, []);

    const toggleTag = useCallback((tag: string) => {
        setTagFilters(prev => {
            const next = new Set(prev);
            if (next.has(tag)) next.delete(tag);
            else next.add(tag);
            return next;
        });
    }, []);

    const toggleDpi = useCallback((dpi: number) => {
        const thresholds = [1400, 1200, 1000, 800, 600];
        const roundedDpi = thresholds.find(t => dpi >= t) ?? 0;
        setMinDpi(prev => prev === roundedDpi ? 0 : roundedDpi);
    }, []);

    const clearFilters = useCallback(() => {
        setMinDpi(0); // 0 = "Any" DPI
        setSourceFilters(new Set());
        setTagFilters(new Set());
    }, []);

    // Active filter count
    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (sourceFilters.size > 0) count += sourceFilters.size;
        if (tagFilters.size > 0) count += tagFilters.size;
        const defaultDpi = favoriteMpcDpi ?? 800;
        if (minDpi > 0 && minDpi !== defaultDpi) count += 1;
        return count;
    }, [sourceFilters, tagFilters, minDpi, favoriteMpcDpi]);

    return {
        cards,
        filteredCards,
        isLoading,
        hasSearched,
        hasResults: cards.length > 0,
        filters: {
            minDpi,
            sourceFilters,
            tagFilters,
            sortBy,
            sortDir,
            fuzzySearch: mpcFuzzySearch,
        },
        sources,
        tags,
        groupedBySource,
        setMinDpi,
        setSourceFilters,
        setTagFilters,
        setSortBy,
        setSortDir,
        toggleSource,
        toggleTag,
        toggleDpi,
        clearFilters,
        activeFilterCount,
    };
}
