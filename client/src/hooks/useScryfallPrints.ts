import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { debugLog } from "@/helpers/debug";
import { API_BASE } from "@/constants";
import type { PrintInfo } from "@/helpers/dfcHelpers";

export interface ScryfallPrintsResult {
    /** Array of print metadata */
    prints: PrintInfo[];
    /** Whether a fetch is currently in progress */
    isLoading: boolean;
    /** Whether at least one fetch has been performed */
    hasSearched: boolean;
    /** Whether there are any results */
    hasResults: boolean;
}

export interface UseScryfallPrintsOptions {
    /** Whether to auto-fetch on card name change (default: true) */
    autoFetch?: boolean;
    /** Language code (default: en) */
    lang?: string;
}

// Global cache shared across all instances - persists across mode switches
const globalPrintsCache: Record<string, PrintInfo[]> = {};

/**
 * Hook for fetching all prints of a specific card with full metadata.
 * Returns prints[] with faceName for DFC filtering.
 * 
 * @param cardName - Exact card name to fetch prints for
 * @param options - Configuration options
 * @returns ScryfallPrintsResult with prints, loading state, and fetch status
 */
export function useScryfallPrints(
    cardName: string,
    options: UseScryfallPrintsOptions = {}
): ScryfallPrintsResult {
    const { autoFetch = true, lang = "en" } = options;

    const [prints, setPrints] = useState<PrintInfo[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    // Refs for request management
    const abortControllerRef = useRef<AbortController | null>(null);
    const currentCardNameRef = useRef<string>("");
    const lastFetchedCardNameRef = useRef<string>("");

    // Compute cache key for the current card name
    const getCacheKey = useCallback((name: string, language: string): string | null => {
        const trimmed = name.trim();
        if (!trimmed) return null;
        return `prints|${trimmed.toLowerCase()}|${language}`;
    }, []);

    // Check if we have cached results
    const cachedResult = useMemo(() => {
        const cacheKey = getCacheKey(cardName, lang);
        if (cacheKey && globalPrintsCache[cacheKey] !== undefined) {
            return globalPrintsCache[cacheKey];
        }
        return null;
    }, [cardName, lang, getCacheKey]);

    // Update prints from cache immediately if available
    useEffect(() => {
        if (cachedResult !== null) {
            setPrints(cachedResult);
            setHasSearched(true);
        }
    }, [cachedResult]);

    // Fetch effect
    useEffect(() => {
        // Don't fetch if autoFetch is disabled
        if (!autoFetch) return;

        // Skip if we have cached results
        if (cachedResult !== null) return;

        // Abort any in-flight request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const performFetch = async () => {
            currentCardNameRef.current = cardName;

            const trimmedName = cardName.trim();
            if (!trimmedName) {
                setPrints([]);
                return;
            }

            // Skip if we already fetched this card
            if (lastFetchedCardNameRef.current === trimmedName) return;

            const cacheKey = getCacheKey(cardName, lang);
            if (!cacheKey) return;

            // Create abort controller
            const controller = new AbortController();
            abortControllerRef.current = controller;

            try {
                setIsLoading(true);

                const url = `${API_BASE}/api/scryfall/prints?name=${encodeURIComponent(trimmedName)}&lang=${lang}`;
                const response = await fetch(url, { signal: controller.signal });

                if (currentCardNameRef.current !== cardName) return;

                if (response.ok) {
                    const data = await response.json();
                    debugLog('[ScryfallPrints] Fetched prints:', data.total);

                    const resultPrints: PrintInfo[] = data.prints || [];

                    // Cache and update state
                    globalPrintsCache[cacheKey] = resultPrints;
                    lastFetchedCardNameRef.current = trimmedName;
                    setPrints(resultPrints);
                    setHasSearched(true);
                } else {
                    console.error('[ScryfallPrints] Error fetching prints:', response.status);
                    // Cache empty result and mark as searched so UI shows "no results" message
                    globalPrintsCache[cacheKey] = [];
                    setPrints([]);
                    setHasSearched(true);
                }

            } catch (err) {
                if (err instanceof Error && err.name !== 'AbortError') {
                    if (cacheKey) globalPrintsCache[cacheKey] = [];
                    setPrints([]);
                    setHasSearched(true);
                }
            } finally {
                setIsLoading(false);
            }
        };

        // Small delay to debounce rapid changes
        const timeoutId = setTimeout(performFetch, 200);
        return () => {
            clearTimeout(timeoutId);
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [cardName, lang, autoFetch, cachedResult, getCacheKey]);

    return {
        prints,
        isLoading,
        hasSearched,
        hasResults: prints.length > 0,
    };
}
