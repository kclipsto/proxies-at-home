import { useState, useRef, useEffect } from "react";
import { debugLog } from "@/helpers/debug";
import { API_BASE } from "@/constants";
import type { PrintInfo } from "@/types";
import { db } from "@/db";

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
  name: string;
  lang?: string;
  enabled?: boolean;
  initialPrints?: PrintInfo[];
}

/**
 * Hook for fetching all prints of a specific card with full metadata.
 * Returns prints[] with faceName for DFC filtering.
 *
 * @param cardName - Exact card name to fetch prints for
 * @param options - Configuration options
 * @returns ScryfallPrintsResult with prints, loading state, and fetch status
 */
export function useScryfallPrints({
  name,
  lang = "en",
  enabled = true,
  initialPrints,
}: UseScryfallPrintsOptions): ScryfallPrintsResult {
  const [prints, setPrints] = useState<PrintInfo[]>(initialPrints || []);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(
    !!initialPrints && initialPrints.length > 0
  );

  // Refs for request management
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentNameRef = useRef<string>("");

  // Fetch effect
  useEffect(() => {
    // Don't fetch if disabled or empty name
    if (!enabled || !name || !name.trim()) {
      return;
    }

    const trimmedName = name.trim();

    // Skip if same name requested
    if (currentNameRef.current === trimmedName && hasSearched) return;

    const performFetch = async () => {
      currentNameRef.current = trimmedName;

      // Abort any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        // 1. Check Local DB (Metatadata Cache)
        // We verify 'hasFullPrints' to ensure we have the complete list
        const cached = await db.cardMetadataCache
          .where("name")
          .equals(trimmedName)
          .first();

        if (
          cached &&
          cached.hasFullPrints &&
          cached.data?.prints &&
          Array.isArray(cached.data.prints)
        ) {
          // Cache Hit!
          debugLog("[ScryfallPrints] Local cache HIT for:", trimmedName);
          if (currentNameRef.current === trimmedName) {
            setPrints(cached.data.prints);
            setHasSearched(true);
            return; // Done, no network needed
          }
        }

        // 2. Network Fetch (Cache Miss)
        setIsLoading(true);
        const url = `${API_BASE}/api/scryfall/prints?name=${encodeURIComponent(trimmedName)}&lang=${lang}`;

        const response = await fetch(url, { signal: controller.signal });

        if (currentNameRef.current !== trimmedName) return;

        if (response.ok) {
          const data = await response.json();
          debugLog("[ScryfallPrints] Fetched prints:", data.total);

          const resultPrints: PrintInfo[] = data.prints || [];

          // 3. Update Local DB
          // Update ALL matching records for this card name to include the prints
          // This ensures future lookups find it
          await db.cardMetadataCache
            .where("name")
            .equals(trimmedName)
            .modify((entry) => {
              entry.hasFullPrints = true;
              // Merge prints into data object
              if (typeof entry.data === "object" && entry.data !== null) {
                // We know it's an object, safe to spread and assign
                entry.data = { ...entry.data, prints: resultPrints };
              } else {
                // Fallback: entry.data was somehow not an object (primitive), overwrite it
                entry.data = { prints: resultPrints };
              }
            });

          setPrints(resultPrints);
          setHasSearched(true);
        } else {
          console.error(
            "[ScryfallPrints] Error fetching prints:",
            response.status
          );
          setPrints([]);
          setHasSearched(true);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          debugLog("[ScryfallPrints] Fetch error:", err);
          setPrints([]);
          setHasSearched(true);
        }
      } finally {
        if (currentNameRef.current === trimmedName) {
          setIsLoading(false);
        }
      }
    };

    // Small debounce
    const timeoutId = setTimeout(performFetch, 100);

    return () => {
      clearTimeout(timeoutId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [name, lang, enabled, hasSearched, initialPrints]);

  return {
    prints,
    isLoading,
    hasSearched,
    hasResults: prints.length > 0,
  };
}
