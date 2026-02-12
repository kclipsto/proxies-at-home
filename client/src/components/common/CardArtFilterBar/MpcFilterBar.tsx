import React, { useState, useMemo, useEffect } from "react";
import { Star } from "lucide-react";
import { SelectDropdown, MultiSelectDropdown } from "..";
import { SharedFilterLayout } from "./SharedFilterLayout";
import { useUserPreferencesStore, useSettingsStore } from "@/store";
import type { MpcAutofillCard } from "@/helpers/mpcAutofillApi";
import type { MpcFilterState } from "@/hooks/useMpcSearch";

// Re-export this interface from main file, or redefine here to match
export interface MpcFilterProps {
    // Common
    className?: string;
    // Specific
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

const EMPTY_ARRAY: never[] = [];

export function MpcFilterBar(props: MpcFilterProps) {
    const { className, cards } = props;

    // --- State & Handlers ---
    const [showMinDpiDropdown, setShowMinDpiDropdown] = useState(false);
    const [showSourceDropdown, setShowSourceDropdown] = useState(false);
    const [showTagDropdown, setShowTagDropdown] = useState(false);

    // Search queries for dropdowns
    const [sourceSearchQuery, setSourceSearchQuery] = useState("");
    const [tagSearchQuery, setTagSearchQuery] = useState("");

    // --- Stable Sort States (Freeze order while dropdown is open) ---
    const [stableMpcSources, setStableMpcSources] = useState<
        { name: string; hasResults: boolean }[]
    >([]);
    const [stableMpcTags, setStableMpcTags] = useState<
        { name: string; hasResults: boolean }[]
    >([]);

    // --- Hooks & Data ---

    // Select stable references from store
    const preferences = useUserPreferencesStore((state) => state.preferences);

    // Actions are stable in Zustand
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
    const setFavoriteMpcGroupBySource = useUserPreferencesStore(
        (s) => s.setFavoriteMpcGroupBySource
    );

    // Derived values
    const favoriteMpcDpi = preferences?.favoriteMpcDpi || null;
    const favoriteMpcSort = preferences?.favoriteMpcSort || null;
    const mpcFuzzySearch = useSettingsStore((s) => s.mpcFuzzySearch);
    const setMpcFuzzySearch = useSettingsStore((s) => s.setMpcFuzzySearch);

    // Favorites
    const favoriteMpcSources = preferences?.favoriteMpcSources || EMPTY_ARRAY;
    const favoriteMpcTags = preferences?.favoriteMpcTags || EMPTY_ARRAY;

    // Track recently-unfavorited items so they stay visible until dropdown closes
    const [recentlyUnfavoritedSources, setRecentlyUnfavoritedSources] = useState<
        Set<string>
    >(new Set());
    const [recentlyUnfavoritedTags, setRecentlyUnfavoritedTags] = useState<
        Set<string>
    >(new Set());

    // --- Computed Data ---

    // MPC: Available Sources & Tags
    const mpcData = useMemo(() => {
        const sourcesInResults = new Set(cards.map((c) => c.sourceName));
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

        const tagsInResults = new Set(cards.flatMap((c) => c.tags || []));
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
        cards,
        favoriteMpcSources,
        favoriteMpcTags,
        recentlyUnfavoritedSources,
        recentlyUnfavoritedTags,
    ]);

    // --- Stable Sort Effects ---

    // Sync stable sources when dropdown is closed or on first load (if empty)
    useEffect(() => {
        if (!showSourceDropdown || stableMpcSources.length === 0) {
            setStableMpcSources(mpcData.allSources || []);
        }
    }, [mpcData, showSourceDropdown, stableMpcSources.length]);

    // Sync stable tags
    useEffect(() => {
        if (!showTagDropdown || stableMpcTags.length === 0) {
            setStableMpcTags(mpcData.allTags || []);
        }
    }, [mpcData, showTagDropdown, stableMpcTags.length]);


    // --- Selection Helpers ---

    const isAllFavoritesSelected = () => {
        const { filters } = props;
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
    };

    const hasAnyFavorites =
        favoriteMpcSources.length > 0 ||
        favoriteMpcTags.length > 0 ||
        favoriteMpcDpi !== null ||
        favoriteMpcSort !== null;

    const allFavoritesSelected = isAllFavoritesSelected();

    const handleToggleAllFavorites = () => {
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
    };

    return (
        <SharedFilterLayout
            className={className}
            favorites={{
                isAllSelected: allFavoritesSelected,
                hasAny: hasAnyFavorites,
                onToggle: handleToggleAllFavorites,
            }}
            sort={{
                options: [
                    { value: "name", label: "Name" },
                    { value: "dpi", label: "DPI" },
                ],
                value: props.filters.sortBy,
                onChange: (val) => props.setSortBy(val as "name" | "dpi"),
                dir: props.filters.sortDir,
                onDirChange: props.setSortDir,
                favoriteSortValue: favoriteMpcSort,
                onToggleFavoriteSort: (val) => setFavoriteMpcSort((val as "name" | "dpi") === favoriteMpcSort ? null : (val as "name" | "dpi"))
            }}
            viewOptions={{
                groupBy: props.groupBySource,
                onToggleGroupBy: props.onToggleGroupBySource,
                favoriteGroupBy: !!preferences?.favoriteMpcGroupBySource,
                onToggleFavoriteGroupBy: () => setFavoriteMpcGroupBySource(!preferences?.favoriteMpcGroupBySource),
                isCollapsed: props.allSourcesCollapsed,
                onToggleCollapse: () => {
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
                }
            }}
            clear={{
                show: props.filters.minDpi > 0 ||
                    props.filters.sourceFilters.size > 0 ||
                    props.filters.tagFilters.size > 0,
                onClear: props.clearFilters
            }}
            count={{
                total: props.cards.length,
                filtered: props.filteredCards.length
            }}
            extraControls={
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setMpcFuzzySearch(!mpcFuzzySearch)}
                        className={`h-10 px-3 flex items-center gap-1.5 rounded-md border text-sm whitespace-nowrap transition-colors flex-shrink-0 ${mpcFuzzySearch
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
                </div>
            }
        >
            {/* 2. Filters */}

            {/* DPI Dropdown */}
            <SelectDropdown
                label="DPI"
                buttonText={
                    props.filters.minDpi === 0 ? "Any" : `${props.filters.minDpi}+`
                }
                selectedLabel={
                    // Note: SelectDropdown doesn't strictly require this but good for accessibility/consistency 
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

            {/* Source Dropdown */}
            {/* Always render trigger, conditionally render content if needed by parent (but MultiSelectDropdown usually handles its own trigger rendering) */}
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

            {/* Tag Dropdown */}
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
        </SharedFilterLayout>
    );
}
