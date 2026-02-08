import { useState, useMemo, useEffect, useRef } from "react";
import {
  ArrowUpNarrowWide,
  ArrowDownWideNarrow,
  Star,
  X,
  Rows3,
  ChevronsUp,
  ChevronsDown,
} from "lucide-react";
import { SelectDropdown, MultiSelectDropdown } from "./";
import { useSettingsStore, useUserPreferencesStore } from "@/store";
import type { MpcAutofillCard } from "@/helpers/mpcAutofillApi";
import type { MpcFilterState } from "@/hooks/useMpcSearch";
import { fetchScryfallSets } from "@/helpers/scryfallApi";
import type { ScryfallSet } from "../../../../shared/types";
import { FilterBarShell } from "./FilterBarShell";

interface DisplayScryfallSet extends ScryfallSet {
  isAvailable: boolean;
}

const EMPTY_ARRAY: never[] = [];


interface CommonFilterBarProps {
  className?: string;
}

interface MpcFilterProps extends CommonFilterBarProps {
  mode: "mpc";
  filters: MpcFilterState;
  cards: MpcAutofillCard[];
  filteredCards: MpcAutofillCard[];
  groupedBySource: Map<string, MpcAutofillCard[]> | null;
  setMinDpi: (dpi: number) => void;
  setSortBy: (sort: "name" | "dpi") => void;
  setSortDir: (dir: "asc" | "desc") => void;
  toggleSource: (source: string) => void;
  toggleTag: (tag: string) => void;
  clearFilters: () => void;
  setSourceFilters: React.Dispatch<React.SetStateAction<Set<string>>>;
  setTagFilters: React.Dispatch<React.SetStateAction<Set<string>>>;
  collapsedSources: Set<string>;
  setCollapsedSources: React.Dispatch<React.SetStateAction<Set<string>>>;
  allSourcesCollapsed: boolean;
  setAllSourcesCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  groupBySource: boolean;
  onToggleGroupBySource: () => void;
}

export interface ScryfallFilterProps extends CommonFilterBarProps {
  mode: "scryfall";
  availableSets: Set<string>;
  selectedSets: Set<string>;
  onSelectSet: (setCodes: Set<string>) => void;
  sortBy: "name" | "released";
  setSortBy: (sort: "name" | "released") => void;
  sortDir: "asc" | "desc";
  setSortDir: (dir: "asc" | "desc") => void;
  groupBySet: boolean;
  onToggleGroupBySet: () => void;
  collapsedSets: Set<string>;
  setCollapsedSets: React.Dispatch<React.SetStateAction<Set<string>>>;
  allSetsCollapsed: boolean;
  setAllSetsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  totalCount?: number;
  filteredCount?: number;
  searchMode: "cards" | "prints";
  setSearchMode: (mode: "cards" | "prints") => void;
  hideSearchModeSelector?: boolean;
}

export type CardArtFilterBarProps = MpcFilterProps | ScryfallFilterProps;

/**
 * Unified filter bar for both MPC and Scryfall art search.
 * Provides adaptive controls based on the `mode` prop.
 */
export function CardArtFilterBar(props: CardArtFilterBarProps) {
  const { mode, className } = props;

  // Extracted props for stable dependencies (Lint fixes)
  const mpcCards = mode === "mpc" ? (props as MpcFilterProps).cards : EMPTY_ARRAY;
  const scryfallAvailableSets =
    mode === "scryfall" ? (props as ScryfallFilterProps).availableSets : null;
  const scryfallSelectedSets =
    mode === "scryfall" ? (props as ScryfallFilterProps).selectedSets : null;
  const scryfallSortByParam =
    mode === "scryfall" ? (props as ScryfallFilterProps).sortBy : null;
  const scryfallSortDirParam =
    mode === "scryfall" ? (props as ScryfallFilterProps).sortDir : null;

  // --- State & Handlers ---

  // Dropdown visibility state (shared)
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // MPC-specific state
  const [showMinDpiDropdown, setShowMinDpiDropdown] = useState(false);
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  // Scryfall-specific state
  const [showSetDropdown, setShowSetDropdown] = useState(false);
  const [showSearchModeDropdown, setShowSearchModeDropdown] = useState(false);
  const [allSets, setAllSets] = useState<ScryfallSet[]>([]);
  const [isSetsLoading, setIsSetsLoading] = useState(false);

  // Search queries for dropdowns
  const [sourceSearchQuery, setSourceSearchQuery] = useState("");
  const [tagSearchQuery, setTagSearchQuery] = useState("");
  const [setSearchQuery, setSetSearchQuery] = useState("");

  // --- Stable Sort States (Freeze order while dropdown is open) ---
  const [stableMpcSources, setStableMpcSources] = useState<
    { name: string; hasResults: boolean }[]
  >([]);
  const [stableMpcTags, setStableMpcTags] = useState<
    { name: string; hasResults: boolean }[]
  >([]);
  const [stableScryfallSets, setStableScryfallSets] = useState<DisplayScryfallSet[]>(
    []
  );

  // Track previous sort params to force updates
  const lastSortByRef = useRef<string | null>(null);
  const lastSortDirRef = useRef<string | null>(null);

  // --- Hooks & Data ---

  // Select stable references from store
  const preferences = useUserPreferencesStore((state) => state.preferences);

  // Actions are stable in Zustand
  const toggleFavoriteScryfallSet = useUserPreferencesStore(
    (s) => s.toggleFavoriteScryfallSet
  );
  const toggleFavoriteMpcSource = useUserPreferencesStore(
    (s) => s.toggleFavoriteMpcSource
  );
  const toggleFavoriteMpcTag = useUserPreferencesStore(
    (s) => s.toggleFavoriteMpcTag
  );
  const setFavoriteMpcDpi = useUserPreferencesStore((s) => s.setFavoriteMpcDpi);
  const setFavoriteMpcSort = useUserPreferencesStore(
    (s) => s.setFavoriteMpcSort
  );
  const setFavoriteScryfallSort = useUserPreferencesStore(
    (s) => s.setFavoriteScryfallSort
  );
  const setFavoriteScryfallGroupBySet = useUserPreferencesStore(
    (s) => s.setFavoriteScryfallGroupBySet
  );
  const setFavoriteMpcGroupBySource = useUserPreferencesStore(
    (s) => s.setFavoriteMpcGroupBySource
  );
  const setFavoriteScryfallSearchMode = useUserPreferencesStore(
    (s) => s.setFavoriteScryfallSearchMode
  );

  // Derived values
  const favoriteMpcDpi = preferences?.favoriteMpcDpi || null;
  const favoriteMpcSort = preferences?.favoriteMpcSort || null;
  const favoriteScryfallSets = useMemo(
    () => new Set(preferences?.favoriteScryfallSets || []),
    [preferences?.favoriteScryfallSets]
  );
  const favoriteScryfallSearchMode =
    preferences?.favoriteScryfallSearchMode ?? null;
  const mpcFuzzySearch = useSettingsStore((s) => s.mpcFuzzySearch);
  const setMpcFuzzySearch = useSettingsStore((s) => s.setMpcFuzzySearch);

  // Favorites
  const favoriteMpcSources = preferences?.favoriteMpcSources || EMPTY_ARRAY;
  const favoriteMpcTags = preferences?.favoriteMpcTags || EMPTY_ARRAY;
  // const favoriteMpcDpi = preferences?.favoriteMpcDpi ?? null; // Now destructured
  // const favoriteMpcSort = preferences?.favoriteMpcSort ?? null; // Now destructured
  // const favoriteScryfallSets = useMemo(() => new Set(preferences?.favoriteScryfallSets || []), [preferences?.favoriteScryfallSets]); // Now destructured

  // Track recently-unfavorited items so they stay visible until dropdown closes (MPC)
  const [recentlyUnfavoritedSources, setRecentlyUnfavoritedSources] = useState<
    Set<string>
  >(new Set());
  const [recentlyUnfavoritedTags, setRecentlyUnfavoritedTags] = useState<
    Set<string>
  >(new Set());

  // Load Scryfall Sets
  useEffect(() => {
    if (mode === "scryfall" && allSets.length === 0) {
      let mounted = true;
      const loadSets = async () => {
        setIsSetsLoading(true);
        try {
          const sets = await fetchScryfallSets();
          if (mounted) setAllSets(sets);
        } catch (error) {
          console.error("Failed to load Scryfall sets", error);
        } finally {
          if (mounted) setIsSetsLoading(false);
        }
      };
      loadSets();
      return () => {
        mounted = false;
      };
    }
  }, [mode, allSets.length]);

  // --- Computed Data ---

  // MPC: Available Sources & Tags
  const mpcData = useMemo(() => {
    if (mode !== "mpc") return null;

    const sourcesInResults = new Set(mpcCards.map((c) => c.sourceName));
    const allSourcesSet = new Set([
      ...sourcesInResults,
      ...favoriteMpcSources,
      ...recentlyUnfavoritedSources,
    ]);
    const allSources = Array.from(allSourcesSet)
      .map((name) => ({ name, hasResults: sourcesInResults.has(name) }))
      .sort((a, b) => {
        const aFav = favoriteMpcSources.includes(a.name);
        const bFav = favoriteMpcSources.includes(b.name);
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;
        return a.name.localeCompare(b.name);
      });

    const tagsInResults = new Set(mpcCards.flatMap((c) => c.tags || []));
    const allTagsSet = new Set([
      ...tagsInResults,
      ...favoriteMpcTags,
      ...recentlyUnfavoritedTags,
    ]);
    const allTags = Array.from(allTagsSet)
      .map((name) => ({ name, hasResults: tagsInResults.has(name) }))
      .sort((a, b) => {
        const aFav = favoriteMpcTags.includes(a.name);
        const bFav = favoriteMpcTags.includes(b.name);
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;
        return a.name.localeCompare(b.name);
      });

    return { allSources, allTags, sourcesInResults, tagsInResults };
  }, [
    mode,
    mpcCards,
    favoriteMpcSources,
    favoriteMpcTags,
    recentlyUnfavoritedSources,
    recentlyUnfavoritedTags,
  ]);

  // Scryfall: Filtered Sets
  const scryfallData = useMemo(() => {
    if (mode !== "scryfall") return null;

    // Use extracted vars (they might be null if mode mismatches, but mode check guards it)
    const availableSets = scryfallAvailableSets || new Set();
    const selectedSets = scryfallSelectedSets || new Set();

    // 1. Filter sets that match query
    const matchingSearch = allSets.filter((set) => {
      if (!setSearchQuery) return true;
      const q = setSearchQuery.toLowerCase();
      return (
        set.name.toLowerCase().includes(q) || set.code.toLowerCase().includes(q)
      );
    });

    // 2. Filter to show only available, selected, or favorite sets
    const validSets = matchingSearch.filter((set) => {
      return (
        availableSets.has(set.code) ||
        selectedSets.has(set.code) ||
        favoriteScryfallSets.has(set.code)
      );
    });

    const displaySets = validSets
      .map((set) => ({
        ...set,
        isAvailable: availableSets.has(set.code),
      }))
      .sort((a, b) => {
        // Favorites first - Strict Check
        // Normalize to handle potential case mismatches (though unlikely)
        const codeA = (a.code || "").toLowerCase();
        const codeB = (b.code || "").toLowerCase();

        // Check against the Set (which should have lowercase codes if coming from prefs)
        // But let's check both raw and lower just in case
        const isFavA =
          favoriteScryfallSets.has(a.code) || favoriteScryfallSets.has(codeA);
        const isFavB =
          favoriteScryfallSets.has(b.code) || favoriteScryfallSets.has(codeB);

        if (isFavA && !isFavB) return -1; // A is fav, B is not -> A first
        if (!isFavA && isFavB) return 1; // B is fav, A is not -> B first

        // If both are fav or both not fav, proceed to secondary sort

        const sortBy = scryfallSortByParam;
        const sortDir = scryfallSortDirParam;

        if (sortBy === "name") {
          return sortDir === "asc"
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name);
        }

        // Date Sort
        const dateA = a.released_at ? new Date(a.released_at).getTime() : 0;
        const dateB = b.released_at ? new Date(b.released_at).getTime() : 0;

        return sortDir === "asc" ? dateA - dateB : dateB - dateA;
      });

    return { displaySets };
  }, [
    mode,
    allSets,
    setSearchQuery,
    scryfallAvailableSets,
    scryfallSelectedSets,
    favoriteScryfallSets,
    scryfallSortByParam,
    scryfallSortDirParam,
  ]);

  // --- Stable Sort Effects ---

  // Sync stable sources when dropdown is closed or on first load (if empty)
  useEffect(() => {
    if (!mpcData) return;
    if (!showSourceDropdown || stableMpcSources.length === 0) {
      setStableMpcSources(mpcData?.allSources || []);
    }
  }, [mpcData, showSourceDropdown, stableMpcSources.length]);
  // Only re-run if source data changes or visibility toggles

  // Sync stable tags
  useEffect(() => {
    if (!mpcData) return;
    if (!showTagDropdown || stableMpcTags.length === 0) {
      setStableMpcTags(mpcData?.allTags || []);
    }
  }, [mpcData, showTagDropdown, stableMpcTags.length]);

  // Sync stable sets - Force update if sort params change
  const currentSortBy =
    mode === "scryfall" ? (props as ScryfallFilterProps).sortBy : null;
  const currentSortDir =
    mode === "scryfall" ? (props as ScryfallFilterProps).sortDir : null;

  useEffect(() => {
    if (!scryfallData) return;

    const sortChanged =
      currentSortBy !== lastSortByRef.current ||
      currentSortDir !== lastSortDirRef.current;

    if (!showSetDropdown || stableScryfallSets.length === 0 || sortChanged) {
      setStableScryfallSets(scryfallData.displaySets);
      lastSortByRef.current = currentSortBy;
      lastSortDirRef.current = currentSortDir;
    }
  }, [
    scryfallData?.displaySets,
    showSetDropdown,
    currentSortBy,
    currentSortDir,
    scryfallData,
    stableScryfallSets.length,
  ]);

  // --- Selection Helpers ---

  const isAllFavoritesSelected = () => {
    if (mode === "mpc") {
      // Type guard: props is MpcFilterProps
      const mpcProps = props as MpcFilterProps;
      const { filters } = mpcProps;
      const { sourcesInResults, tagsInResults } = mpcData!;
      const allFavSources =
        favoriteMpcSources.length === 0 ||
        favoriteMpcSources.every(
          (s) => !sourcesInResults.has(s) || filters.sourceFilters.has(s)
        );
      const allFavTags =
        favoriteMpcTags.length === 0 ||
        favoriteMpcTags.every(
          (t) => !tagsInResults.has(t) || filters.tagFilters.has(t)
        );
      const favDpi =
        favoriteMpcDpi === null || filters.minDpi === favoriteMpcDpi;
      const favSort =
        favoriteMpcSort === null || filters.sortBy === favoriteMpcSort;
      return allFavSources && allFavTags && favDpi && favSort;
    } else {
      // Type guard: props is ScryfallFilterProps
      const scryfallProps = props as ScryfallFilterProps;
      const { availableSets, selectedSets } = scryfallProps;
      if (favoriteScryfallSets.size === 0) return true;
      // Check if every favorite set (that is available) is selected
      return Array.from(favoriteScryfallSets).every(
        (code) => !availableSets.has(code) || selectedSets.has(code)
      );
    }
  };

  const hasAnyFavorites =
    mode === "mpc"
      ? favoriteMpcSources.length > 0 ||
      favoriteMpcTags.length > 0 ||
      favoriteMpcDpi !== null ||
      favoriteMpcSort !== null
      : favoriteScryfallSets.size > 0;

  const allFavoritesSelected = isAllFavoritesSelected();

  const handleToggleAllFavorites = () => {
    if (mode === "mpc") {
      if (allFavoritesSelected) {
        // Deselect
        props.setSourceFilters((prev) => {
          const next = new Set(prev);
          favoriteMpcSources.forEach((s) => next.delete(s));
          return next;
        });
        props.setTagFilters((prev) => {
          const next = new Set(prev);
          favoriteMpcTags.forEach((t) => next.delete(t));
          return next;
        });
        if (favoriteMpcDpi !== 800) props.setMinDpi(800);
        if (favoriteMpcSort !== "dpi") props.setSortBy("dpi");
      } else {
        // Select
        if (favoriteMpcSources.length > 0) {
          props.setSourceFilters((prev) => {
            const next = new Set(prev);
            favoriteMpcSources.forEach((s) => {
              if (mpcData!.sourcesInResults.has(s)) next.add(s);
            });
            return next;
          });
        }
        if (favoriteMpcTags.length > 0) {
          props.setTagFilters((prev) => {
            const next = new Set(prev);
            favoriteMpcTags.forEach((t) => {
              if (mpcData!.tagsInResults.has(t)) next.add(t);
            });
            return next;
          });
        }
        if (favoriteMpcDpi !== null) props.setMinDpi(favoriteMpcDpi);
        if (favoriteMpcSort !== null && favoriteMpcSort !== "source")
          props.setSortBy(favoriteMpcSort);
      }
    } else {
      // Scryfall
      const { selectedSets, availableSets, onSelectSet } = props;
      if (allFavoritesSelected) {
        // Deselect
        const next = new Set(selectedSets);
        favoriteScryfallSets.forEach((code) => next.delete(code));
        onSelectSet(next);
      } else {
        // Select
        const next = new Set(selectedSets);
        favoriteScryfallSets.forEach((code) => {
          if (availableSets.has(code)) next.add(code);
        });
        onSelectSet(next);
      }
    }
  };

  // --- Render ---

  return (
    <FilterBarShell className={className}>
      {/* 1. Global Favorites Toggle */}
      {hasAnyFavorites && (
        <button
          onClick={handleToggleAllFavorites}
          className="h-10 w-10 flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
          title={
            allFavoritesSelected
              ? "Deselect all favorites"
              : "Select all favorites"
          }
        >
          <Star
            className={`w-5 h-5 ${allFavoritesSelected ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`}
          />
        </button>
      )}

      {/* 2. Filters (Conditional) */}

      {/* MPC: DPI Dropdown */}
      {mode === "mpc" && (
        <SelectDropdown
          label="DPI"
          buttonText={
            props.filters.minDpi === 0 ? "Any" : `${props.filters.minDpi}+`
          }
          selectedLabel={
            props.filters.minDpi === 0 ? "Any" : `${props.filters.minDpi}+`
          }
          singleSelectMode
          disableFavorites
          isOpen={showMinDpiDropdown}
          onToggle={() => setShowMinDpiDropdown(!showMinDpiDropdown)}
          onClose={() => setShowMinDpiDropdown(false)}
        >
          {[0, 600, 800, 1000, 1200, 1400].map((dpi) => (
            <div
              key={dpi}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFavoriteMpcDpi(favoriteMpcDpi === dpi ? null : dpi);
                }}
                className="p-0.5 hover:text-yellow-500 transition-colors"
                title={
                  favoriteMpcDpi === dpi
                    ? "Remove from favorites"
                    : "Set as favorite"
                }
              >
                <Star
                  className={`w-3.5 h-3.5 ${favoriteMpcDpi === dpi ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`}
                />
              </button>
              <button
                type="button"
                onClick={() => {
                  props.setMinDpi(dpi);
                  setShowMinDpiDropdown(false);
                }}
                className={`flex-1 text-left text-sm transition-colors whitespace-nowrap ${props.filters.minDpi === dpi ? "text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-white"}`}
              >
                {dpi === 0 ? "Any" : `${dpi}+`}
              </button>
            </div>
          ))}
        </SelectDropdown>
      )}

      {/* MPC: Source Dropdown */}
      {mode === "mpc" && mpcData && (
        <MultiSelectDropdown
          label="Source"
          buttonText="Any"
          selectedCount={props.filters.sourceFilters.size}
          isOpen={showSourceDropdown}
          onToggle={() => setShowSourceDropdown(!showSourceDropdown)}
          onClose={() => {
            setShowSourceDropdown(false);
            setRecentlyUnfavoritedSources(new Set());
            setSourceSearchQuery("");
          }}
        >
          <div className="sticky top-0 z-10 p-2 bg-white dark:bg-gray-700 border-b border-gray-100 dark:border-gray-600">
            <input
              type="text"
              placeholder="Search sources..."
              value={sourceSearchQuery}
              onChange={(e) => setSourceSearchQuery(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <button
            onClick={() => {
              if (props.filters.sourceFilters.size > 0) {
                props.setSourceFilters(new Set());
              } else {
                // Select all from CURRENT stable list
                props.setSourceFilters(
                  new Set(
                    stableMpcSources
                      .filter((s) => s.hasResults)
                      .map((s) => s.name)
                  )
                );
              }
            }}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400"
          >
            {props.filters.sourceFilters.size > 0 ? "Clear All" : "Select All"}
          </button>
          {favoriteMpcSources.length > 0 && (
            <button
              onClick={() => {
                const anyFavsSelected = favoriteMpcSources.some((s) =>
                  props.filters.sourceFilters.has(s)
                );
                if (anyFavsSelected) {
                  props.setSourceFilters((prev) => {
                    const next = new Set(prev);
                    favoriteMpcSources.forEach((s) => next.delete(s));
                    return next;
                  });
                } else {
                  props.setSourceFilters((prev) => {
                    const next = new Set(prev);
                    favoriteMpcSources.forEach((s) => next.add(s));
                    return next;
                  });
                }
              }}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400 border-t border-gray-100 dark:border-gray-600"
            >
              {favoriteMpcSources.some((s) =>
                props.filters.sourceFilters.has(s)
              )
                ? "Clear Favorites"
                : "Select Favorites"}
            </button>
          )}
          {stableMpcSources
            .filter(
              (s) =>
                !sourceSearchQuery ||
                s.name.toLowerCase().includes(sourceSearchQuery.toLowerCase())
            )
            .map((s) => (
              <div
                key={s.name}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (favoriteMpcSources.includes(s.name)) {
                      setRecentlyUnfavoritedSources(
                        (prev) => new Set([...prev, s.name])
                      );
                    }
                    toggleFavoriteMpcSource(s.name);
                  }}
                  className="p-0.5 hover:text-yellow-500 transition-colors"
                  title={
                    favoriteMpcSources.includes(s.name)
                      ? "Remove from favorites"
                      : "Add to favorites"
                  }
                >
                  <Star
                    className={`w-3.5 h-3.5 ${favoriteMpcSources.includes(s.name) ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`}
                  />
                </button>
                <label
                  className={`flex items-center gap-2 flex-1 min-w-0 ${s.hasResults ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                >
                  <input
                    type="checkbox"
                    checked={
                      props.filters.sourceFilters.has(s.name) && s.hasResults
                    }
                    onChange={() => s.hasResults && props.toggleSource(s.name)}
                    disabled={!s.hasResults}
                    className="rounded"
                  />
                  <span
                    className={`text-sm truncate ${s.hasResults ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500"}`}
                  >
                    {s.name}
                    {!s.hasResults && " (no results)"}
                  </span>
                </label>
              </div>
            ))}
        </MultiSelectDropdown>
      )}

      {/* MPC: Tag Dropdown */}
      {mode === "mpc" && mpcData && (
        <MultiSelectDropdown
          label="Tags"
          buttonText="Any"
          selectedCount={props.filters.tagFilters.size}
          isOpen={showTagDropdown}
          onToggle={() => setShowTagDropdown(!showTagDropdown)}
          onClose={() => {
            setShowTagDropdown(false);
            setRecentlyUnfavoritedTags(new Set());
            setTagSearchQuery("");
          }}
        >
          <div className="sticky top-0 z-10 p-2 bg-white dark:bg-gray-700 border-b border-gray-100 dark:border-gray-600">
            <input
              type="text"
              placeholder="Search tags..."
              value={tagSearchQuery}
              onChange={(e) => setTagSearchQuery(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <button
            onClick={() => {
              if (props.filters.tagFilters.size > 0) {
                props.setTagFilters(new Set());
              } else {
                props.setTagFilters(
                  new Set(
                    stableMpcTags.filter((t) => t.hasResults).map((t) => t.name)
                  )
                );
              }
            }}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400"
          >
            {props.filters.tagFilters.size > 0 ? "Clear All" : "Select All"}
          </button>
          {favoriteMpcTags.length > 0 && (
            <button
              onClick={() => {
                const anyFavsSelected = favoriteMpcTags.some((t) =>
                  props.filters.tagFilters.has(t)
                );
                if (anyFavsSelected) {
                  props.setTagFilters((prev) => {
                    const next = new Set(prev);
                    favoriteMpcTags.forEach((t) => next.delete(t));
                    return next;
                  });
                } else {
                  props.setTagFilters((prev) => {
                    const next = new Set(prev);
                    favoriteMpcTags.forEach((t) => next.add(t));
                    return next;
                  });
                }
              }}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400 border-t border-gray-100 dark:border-gray-600"
            >
              {favoriteMpcTags.some((t) => props.filters.tagFilters.has(t))
                ? "Clear Favorites"
                : "Select Favorites"}
            </button>
          )}
          {stableMpcTags
            .filter(
              (t) =>
                !tagSearchQuery ||
                t.name.toLowerCase().includes(tagSearchQuery.toLowerCase())
            )
            .map((t) => (
              <div
                key={t.name}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (favoriteMpcTags.includes(t.name)) {
                      setRecentlyUnfavoritedTags(
                        (prev) => new Set([...prev, t.name])
                      );
                    }
                    toggleFavoriteMpcTag(t.name);
                  }}
                  className="p-0.5 hover:text-yellow-500 transition-colors"
                  title={
                    favoriteMpcTags.includes(t.name)
                      ? "Remove from favorites"
                      : "Add to favorites"
                  }
                >
                  <Star
                    className={`w-3.5 h-3.5 ${favoriteMpcTags.includes(t.name) ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`}
                  />
                </button>
                <label
                  className={`flex items-center gap-2 flex-1 min-w-0 ${t.hasResults ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                >
                  <input
                    type="checkbox"
                    checked={
                      props.filters.tagFilters.has(t.name) && t.hasResults
                    }
                    onChange={() => t.hasResults && props.toggleTag(t.name)}
                    disabled={!t.hasResults}
                    className="rounded"
                  />
                  <span
                    className={`text-sm truncate ${t.hasResults ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500"}`}
                  >
                    {t.name}
                    {!t.hasResults && " (no results)"}
                  </span>
                </label>
              </div>
            ))}
        </MultiSelectDropdown>
      )}

      {/* Scryfall: Set Dropdown */}
      {mode === "scryfall" && scryfallData && (
        <SelectDropdown
          label="Set"
          buttonText="Any"
          selectedCount={props.selectedSets.size}
          isOpen={showSetDropdown}
          onToggle={() => setShowSetDropdown(!showSetDropdown)}
          onClose={() => {
            setShowSetDropdown(false);
            setSetSearchQuery("");
          }}
        >
          {/* Search Input */}
          <div className="sticky top-0 z-10 p-2 bg-white dark:bg-gray-700 border-b border-gray-100 dark:border-gray-600">
            <input
              type="text"
              placeholder="Search sets..."
              value={setSearchQuery}
              onChange={(e) => setSetSearchQuery(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Quick Actions */}
          <button
            onClick={() => {
              if (props.selectedSets.size > 0) {
                props.onSelectSet(new Set());
              } else {
                // Select all available from stable list
                props.onSelectSet(
                  props.availableSets.size > 0
                    ? props.availableSets
                    : new Set(stableScryfallSets.map((s) => s.code))
                );
              }
            }}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400"
          >
            {props.selectedSets.size > 0 ? "Clear All" : "Select All"}
          </button>

          {favoriteScryfallSets.size > 0 && (
            <button
              onClick={() => {
                // Check if any favorites are selected (internal to dropdown logic)
                const anyFavSelected = Array.from(favoriteScryfallSets).some(
                  (code) => props.selectedSets.has(code)
                );

                if (anyFavSelected) {
                  // Deselect favorites
                  const next = new Set(props.selectedSets);
                  favoriteScryfallSets.forEach((code) => next.delete(code));
                  props.onSelectSet(next);
                } else {
                  // Select favorites
                  const next = new Set(props.selectedSets);
                  favoriteScryfallSets.forEach((code) => {
                    if (props.availableSets.has(code)) next.add(code);
                  });
                  props.onSelectSet(next);
                }
              }}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400 border-t border-gray-100 dark:border-gray-600"
            >
              {Array.from(favoriteScryfallSets).some((code) =>
                props.selectedSets.has(code)
              )
                ? "Clear Favorites"
                : "Select Favorites"}
            </button>
          )}

          {/* Set List */}
          {isSetsLoading ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              Loading sets...
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto">
              {stableScryfallSets
                .filter(
                  (set) =>
                    !setSearchQuery ||
                    set.name
                      .toLowerCase()
                      .includes(setSearchQuery.toLowerCase()) ||
                    set.code
                      .toLowerCase()
                      .includes(setSearchQuery.toLowerCase())
                )
                .map((set) => (
                  <div
                    key={set.code}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavoriteScryfallSet(set.code);
                      }}
                      className="p-0.5 hover:text-yellow-500 transition-colors"
                      title={
                        favoriteScryfallSets.has(set.code)
                          ? "Remove from favorites"
                          : "Add to favorites"
                      }
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${favoriteScryfallSets.has(set.code) ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`}
                      />
                    </button>

                    <label
                      className={`flex items-center gap-2 flex-1 min-w-0 ${set.isAvailable ? "cursor-pointer" : "opacity-50 cursor-not-allowed"}`}
                      title={
                        !set.isAvailable
                          ? "No cards from this set in current results"
                          : ""
                      }
                    >
                      <input
                        type="checkbox"
                        checked={props.selectedSets.has(set.code)}
                        onChange={() => {
                          const next = new Set(props.selectedSets);
                          if (next.has(set.code)) next.delete(set.code);
                          else next.add(set.code);
                          props.onSelectSet(next);
                        }}
                        disabled={!set.isAvailable}
                        className="rounded border-gray-300 dark:border-gray-500 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
                      />

                      {/* Set Icon */}
                      {set.icon_svg_uri && (
                        <img
                          src={set.icon_svg_uri}
                          alt=""
                          className={`w-4 h-4 text-gray-900 dark:text-white ${!set.isAvailable ? "grayscale opacity-70" : ""} dark:invert`}
                        />
                      )}

                      <span
                        className={`text-sm truncate ${set.isAvailable ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500"}`}
                      >
                        {set.name}{" "}
                        <span className="text-gray-500 text-xs">
                          ({set.code.toUpperCase()})
                        </span>
                      </span>
                    </label>
                  </div>
                ))}
              {scryfallData.displaySets.length === 0 && (
                <div className="p-4 text-center text-gray-500 text-sm">
                  No sets found
                </div>
              )}
            </div>
          )}
        </SelectDropdown>
      )}

      {/* Search Mode Dropdown (Scryfall only) */}
      {mode === "scryfall" &&
        !(props as ScryfallFilterProps).hideSearchModeSelector && (
          <SelectDropdown
            label="Mode"
            buttonText={
              (props as ScryfallFilterProps).searchMode === "cards"
                ? "Cards"
                : "Prints"
            }
            singleSelectMode
            disableFavorites
            isOpen={showSearchModeDropdown}
            onToggle={() => setShowSearchModeDropdown(!showSearchModeDropdown)}
            onClose={() => setShowSearchModeDropdown(false)}
          >
            {[
              {
                value: "cards",
                label: "Cards",
                description: "Unique cards only",
              },
              {
                value: "prints",
                label: "Prints",
                description: "All prints/versions",
              },
            ].map((option) => (
              <div
                key={option.value}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600"
              >
                {/* Favorite Star Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFavoriteScryfallSearchMode(
                      favoriteScryfallSearchMode === option.value
                        ? null
                        : (option.value as "cards" | "prints")
                    );
                  }}
                  className="flex-shrink-0 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-500"
                  title={
                    favoriteScryfallSearchMode === option.value
                      ? "Remove default"
                      : "Set as default"
                  }
                >
                  <Star
                    className={`w-4 h-4 ${favoriteScryfallSearchMode === option.value
                      ? "text-yellow-400 fill-yellow-400"
                      : "text-gray-400 dark:text-gray-500"
                      }`}
                  />
                </button>
                <button
                  onClick={() => {
                    (props as ScryfallFilterProps).setSearchMode(
                      option.value as "cards" | "prints"
                    );
                    setShowSearchModeDropdown(false);
                  }}
                  className={`flex-1 text-left py-1 text-sm ${(props as ScryfallFilterProps).searchMode === option.value
                    ? "text-blue-600 dark:text-blue-400 font-medium"
                    : "text-gray-900 dark:text-white"
                    }`}
                >
                  <div>{option.label}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {option.description}
                  </div>
                </button>
              </div>
            ))}
          </SelectDropdown>
        )}

      {/* 3. Sort (Shared) */}
      <div className="flex items-center gap-2">
        <SelectDropdown
          label="Sort"
          buttonText={
            mode === "mpc"
              ? (props as MpcFilterProps).filters.sortBy === "name"
                ? "Name"
                : (props as MpcFilterProps).filters.sortBy === "dpi"
                  ? "DPI"
                  : "Source"
              : (props as ScryfallFilterProps).sortBy === "name"
                ? "Set Name"
                : "Release Date"
          }
          selectedLabel={
            mode === "mpc"
              ? (props as MpcFilterProps).filters.sortBy === "name"
                ? "Name"
                : (props as MpcFilterProps).filters.sortBy === "dpi"
                  ? "DPI"
                  : "Source"
              : (props as ScryfallFilterProps).sortBy === "name"
                ? "Set Name"
                : "Release Date"
          }
          singleSelectMode
          disableFavorites
          isOpen={showSortDropdown}
          onToggle={() => setShowSortDropdown(!showSortDropdown)}
          onClose={() => setShowSortDropdown(false)}
        >
          {(mode === "mpc"
            ? [
              { value: "name", label: "Name" },
              { value: "dpi", label: "DPI" },
            ]
            : [
              { value: "released", label: "Release Date" },
              { value: "name", label: "Set Name" },
            ]
          ).map((option) => (
            <div
              key={option.value}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600"
            >
              {/* Favorite Star Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (mode === "mpc") {
                    setFavoriteMpcSort(
                      favoriteMpcSort === option.value
                        ? null
                        : (option.value as "name" | "dpi")
                    );
                  } else {
                    // Scryfall Favoriting
                    const currentFav = preferences?.favoriteScryfallSort;
                    setFavoriteScryfallSort(
                      currentFav === option.value ? null : (option.value as "released" | "name")
                    );
                  }
                }}
                className="p-0.5 hover:text-yellow-500 transition-colors"
                title={
                  (mode === "mpc"
                    ? favoriteMpcSort
                    : preferences?.favoriteScryfallSort) === option.value
                    ? "Remove from favorites"
                    : "Set as favorite"
                }
              >
                <Star
                  className={`w-3.5 h-3.5 ${(mode === "mpc"
                    ? favoriteMpcSort
                    : preferences?.favoriteScryfallSort) === option.value
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-gray-400"
                    }`}
                />
              </button>

              <button
                type="button"
                onClick={() => {
                  if (mode === "mpc") {
                    props.setSortBy(option.value as "name" | "dpi");
                  } else {
                    props.setSortBy(option.value as "name" | "released");
                  }
                  setShowSortDropdown(false);
                }}
                className={`flex-1 text-left text-sm transition-colors whitespace-nowrap ${(mode === "mpc"
                  ? (props as MpcFilterProps).filters.sortBy
                  : (props as ScryfallFilterProps).sortBy) === option.value
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-gray-900 dark:text-white"
                  }`}
              >
                {option.label}
              </button>
            </div>
          ))}
        </SelectDropdown>
        <button
          onClick={() => {
            if (mode === "mpc") {
              props.setSortDir(
                props.filters.sortDir === "asc" ? "desc" : "asc"
              );
            } else {
              props.setSortDir(props.sortDir === "asc" ? "desc" : "asc");
            }
          }}
          onMouseDown={(e) => {
            // Prevent this click from closing the Set dropdown in Scryfall mode
            // For other modes/dropdowns, we want standard behavior (close on outside click)
            if (mode === "scryfall") {
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
              // Explicitly close the Sort dropdown since we stopped the global listener
              setShowSortDropdown(false);
            }
          }}
          className="h-10 w-10 flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600"
          title={
            (mode === "mpc"
              ? (props as MpcFilterProps).filters.sortDir
              : (props as ScryfallFilterProps).sortDir) === "asc"
              ? "Ascending"
              : "Descending"
          }
        >
          {(mode === "mpc"
            ? (props as MpcFilterProps).filters.sortDir
            : (props as ScryfallFilterProps).sortDir) === "asc" ? (
            <ArrowUpNarrowWide className="w-5 h-5" />
          ) : (
            <ArrowDownWideNarrow className="w-5 h-5" />
          )}
        </button>
      </div>

      {mode === "scryfall" && (
        <div className="flex items-center">
          <button
            onClick={() => (props as ScryfallFilterProps).onToggleGroupBySet()}
            className={`h-10 w-10 flex items-center justify-center border ${(props as ScryfallFilterProps).groupBySet
              ? "rounded-l-md border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
              : "rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
              }`}
            title={
              (props as ScryfallFilterProps).groupBySet
                ? "Ungroup"
                : "Group by Set"
            }
          >
            <Rows3 className="w-5 h-5" />
          </button>
          {(props as ScryfallFilterProps).groupBySet && (
            <>
              {/* Star button to favorite this grouping state */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const currentFav = preferences?.favoriteScryfallGroupBySet;
                  setFavoriteScryfallGroupBySet(!currentFav);
                }}
                className="h-10 w-10 flex items-center justify-center border-y border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                title={
                  preferences?.favoriteScryfallGroupBySet
                    ? "Remove grouping from favorites"
                    : "Set grouping as favorite (default)"
                }
              >
                <Star
                  className={`w-4 h-4 ${preferences?.favoriteScryfallGroupBySet ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`}
                />
              </button>
              {/* Collapse/Expand All button */}
              <button
                onClick={() => {
                  const scryfallProps = props as ScryfallFilterProps;
                  if (scryfallProps.allSetsCollapsed) {
                    scryfallProps.setCollapsedSets(new Set());
                    scryfallProps.setAllSetsCollapsed(false);
                  } else {
                    // Collapse all displayed sets
                    const allDisplayedSetCodes = stableScryfallSets.map(
                      (s) => s.code
                    );
                    scryfallProps.setCollapsedSets(
                      new Set(allDisplayedSetCodes)
                    );
                    scryfallProps.setAllSetsCollapsed(true);
                  }
                }}
                className="h-10 w-10 flex items-center justify-center rounded-r-md border border-l-0 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
                title={
                  (props as ScryfallFilterProps).allSetsCollapsed
                    ? "Expand All Groups"
                    : "Collapse All Groups"
                }
              >
                {
                  (props as ScryfallFilterProps).allSetsCollapsed ? (
                    <ChevronsDown className="w-5 h-5" /> // Expand (Down to show content)
                  ) : (
                    <ChevronsUp className="w-5 h-5" />
                  ) // Collapse (Up to hide content)
                }
              </button>
            </>
          )}
        </div>
      )}

      {/* 4. Extra Controls (MPC) */}
      {mode === "mpc" && (
        <button
          onClick={() => setMpcFuzzySearch(!mpcFuzzySearch)}
          className={`h-10 px-3 flex items-center gap-1.5 rounded-md border text-sm whitespace-nowrap transition-colors ${mpcFuzzySearch
            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
            : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
            }`}
          title={
            mpcFuzzySearch
              ? "Fuzzy search enabled - matches similar names"
              : "Exact search - matches exact name only"
          }
        >
          {mpcFuzzySearch ? "Fuzzy" : "Exact"}
        </button>
      )}

      {/* 6. Group by Source (MPC) toggle button - mirrors Scryfall Group by Set */}
      {mode === "mpc" && (
        <div className="flex items-center">
          <button
            onClick={props.onToggleGroupBySource}
            className={`h-10 w-10 flex items-center justify-center border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors ${props.groupBySource
              ? "rounded-l-md border-r-0 bg-gray-100 dark:bg-gray-600"
              : "rounded-md"
              }`}
            title={
              props.groupBySource
                ? "Disable grouping by source"
                : "Group by source"
            }
          >
            <Rows3 className="w-5 h-5" />
          </button>
          {props.groupBySource && (
            <>
              {/* Star button to favorite this grouping state */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const currentFav = preferences?.favoriteMpcGroupBySource;
                  setFavoriteMpcGroupBySource(!currentFav);
                }}
                className="h-10 w-10 flex items-center justify-center border-y border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                title={
                  preferences?.favoriteMpcGroupBySource
                    ? "Remove grouping from favorites"
                    : "Set grouping as favorite (default)"
                }
              >
                <Star
                  className={`w-4 h-4 ${preferences?.favoriteMpcGroupBySource ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`}
                />
              </button>
              {/* Collapse/Expand All button */}
              <button
                onClick={() => {
                  if (props.allSourcesCollapsed) {
                    props.setCollapsedSources(new Set());
                    props.setAllSourcesCollapsed(false);
                  } else {
                    // Collapse all sources
                    const allSourceNames = props.groupedBySource
                      ? Array.from(props.groupedBySource.keys())
                      : [];
                    props.setCollapsedSources(new Set(allSourceNames));
                    props.setAllSourcesCollapsed(true);
                  }
                }}
                className="h-10 w-10 flex items-center justify-center rounded-r-md border border-l-0 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600"
                title={
                  props.allSourcesCollapsed
                    ? "Expand all groups"
                    : "Collapse all groups"
                }
              >
                {props.allSourcesCollapsed ? (
                  <ChevronsDown className="w-5 h-5" />
                ) : (
                  <ChevronsUp className="w-5 h-5" />
                )}
              </button>
            </>
          )}
        </div>
      )}

      {/* 7. Clear Button */}
      {(() => {
        const shouldShowClear =
          mode === "mpc"
            ? props.filters.minDpi > 0 ||
            props.filters.sourceFilters.size > 0 ||
            props.filters.tagFilters.size > 0
            : props.selectedSets.size > 0;

        if (!shouldShowClear) return null;

        return (
          <button
            onClick={() => {
              if (mode === "mpc") props.clearFilters();
              else props.onSelectSet(new Set());
            }}
            className="h-10 w-10 flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-red-50 dark:hover:bg-red-900/30 hover:border-red-300 dark:hover:border-red-600 hover:text-red-600 dark:hover:text-red-400"
            title="Clear all filters"
          >
            <X className="w-5 h-5" strokeWidth={2.5} />
          </button>
        );
      })()}

      {/* 7. Results Count */}
      {(() => {
        const totalCount =
          mode === "mpc"
            ? props.cards.length
            : (props as ScryfallFilterProps).totalCount;
        const filteredCount =
          mode === "mpc"
            ? props.filteredCards.length
            : (props as ScryfallFilterProps).filteredCount;

        if (totalCount === undefined) return null;

        return (
          <span className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 ml-auto whitespace-nowrap text-xs flex items-center overflow-hidden">
            {filteredCount !== undefined && filteredCount !== totalCount && (
              <>
                <span className="h-full flex items-center px-2 text-gray-900 dark:text-white">
                  {filteredCount}
                </span>
                <span className="w-px h-full bg-gray-300 dark:bg-gray-500" />
              </>
            )}
            <span className="h-full flex items-center px-2 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-600">
              {totalCount}
            </span>
          </span>
        );
      })()}
    </FilterBarShell>
  );
}
