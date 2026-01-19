import { useState } from "react";
import { ArrowUpNarrowWide, ArrowDownWideNarrow, Star, X } from "lucide-react";
import { SelectDropdown, MultiSelectDropdown } from "./";
import { useSettingsStore, useUserPreferencesStore } from "@/store";
import type { MpcAutofillCard } from "@/helpers/mpcAutofillApi";
import type { MpcFilterState } from "@/hooks/useMpcSearch";

export interface CardArtFilterBarProps {
    /** Current filter state */
    filters: MpcFilterState;
    /** Raw search results (for filter options) */
    cards: MpcAutofillCard[];
    /** Filtered results (for display count) */
    filteredCards: MpcAutofillCard[];
    /** Grouped results by source (for expand/collapse all button) */
    groupedBySource: Map<string, MpcAutofillCard[]> | null;
    /** Filter handlers */
    setMinDpi: (dpi: number) => void;
    setSortBy: (sort: "name" | "dpi" | "source") => void;
    setSortDir: (dir: "asc" | "desc") => void;
    toggleSource: (source: string) => void;
    toggleTag: (tag: string) => void;
    clearFilters: () => void;
    setSourceFilters: React.Dispatch<React.SetStateAction<Set<string>>>;
    setTagFilters: React.Dispatch<React.SetStateAction<Set<string>>>;
    /** Collapsed sources state (for source sort mode) */
    collapsedSources: Set<string>;
    setCollapsedSources: React.Dispatch<React.SetStateAction<Set<string>>>;
    /** Whether all sources should be collapsed by default (for new sources on card navigation) */
    allSourcesCollapsed: boolean;
    setAllSourcesCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Reusable filter bar for MPC art search.
 * Provides DPI, source, tag, and sort controls with favorites support.
 */
export function CardArtFilterBar({
    filters,
    cards,
    filteredCards,
    groupedBySource,
    setMinDpi,
    setSortBy,
    setSortDir,
    toggleSource,
    toggleTag,
    clearFilters,
    setSourceFilters,
    setTagFilters,
    // Note: collapsedSources is part of interface but unused here - parent reads it via isSourceCollapsed
    setCollapsedSources,
    allSourcesCollapsed,
    setAllSourcesCollapsed,
}: CardArtFilterBarProps) {
    // Settings store for favorites
    const favoriteMpcSources = useUserPreferencesStore(s => s.preferences?.favoriteMpcSources || []);
    const toggleFavoriteMpcSource = useUserPreferencesStore(s => s.toggleFavoriteMpcSource);
    const favoriteMpcTags = useUserPreferencesStore(s => s.preferences?.favoriteMpcTags || []);
    const toggleFavoriteMpcTag = useUserPreferencesStore(s => s.toggleFavoriteMpcTag);
    const favoriteMpcDpi = useUserPreferencesStore(s => s.preferences?.favoriteMpcDpi ?? null);
    const setFavoriteMpcDpi = useUserPreferencesStore(s => s.setFavoriteMpcDpi);
    const favoriteMpcSort = useUserPreferencesStore(s => s.preferences?.favoriteMpcSort ?? null);
    const setFavoriteMpcSort = useUserPreferencesStore(s => s.setFavoriteMpcSort);
    const mpcFuzzySearch = useSettingsStore(s => s.mpcFuzzySearch);
    const setMpcFuzzySearch = useSettingsStore(s => s.setMpcFuzzySearch);

    // Dropdown state
    const [showMinDpiDropdown, setShowMinDpiDropdown] = useState(false);
    const [showSourceDropdown, setShowSourceDropdown] = useState(false);
    const [showTagDropdown, setShowTagDropdown] = useState(false);
    const [showSortDropdown, setShowSortDropdown] = useState(false);

    // Track recently-unfavorited items so they stay visible until dropdown closes
    const [recentlyUnfavoritedSources, setRecentlyUnfavoritedSources] = useState<Set<string>>(new Set());
    const [recentlyUnfavoritedTags, setRecentlyUnfavoritedTags] = useState<Set<string>>(new Set());

    // Search state for dropdowns
    const [sourceSearchQuery, setSourceSearchQuery] = useState('');
    const [tagSearchQuery, setTagSearchQuery] = useState('');

    // Compute available sources including recently-unfavorited
    const allSources = (() => {
        const sourcesInResults = new Set(cards.map(c => c.sourceName));
        const allSourcesSet = new Set([...sourcesInResults, ...favoriteMpcSources, ...recentlyUnfavoritedSources]);
        return Array.from(allSourcesSet)
            .map(name => ({ name, hasResults: sourcesInResults.has(name) }))
            .sort((a, b) => {
                const aFav = favoriteMpcSources.includes(a.name);
                const bFav = favoriteMpcSources.includes(b.name);
                if (aFav && !bFav) return -1;
                if (!aFav && bFav) return 1;
                return a.name.localeCompare(b.name);
            });
    })();

    // Compute available tags including recently-unfavorited
    const allTags = (() => {
        const tagsInResults = new Set(cards.flatMap(c => c.tags || []));
        const allTagsSet = new Set([...tagsInResults, ...favoriteMpcTags, ...recentlyUnfavoritedTags]);
        return Array.from(allTagsSet)
            .map(name => ({ name, hasResults: tagsInResults.has(name) }))
            .sort((a, b) => {
                const aFav = favoriteMpcTags.includes(a.name);
                const bFav = favoriteMpcTags.includes(b.name);
                if (aFav && !bFav) return -1;
                if (!aFav && bFav) return 1;
                return a.name.localeCompare(b.name);
            });
    })();

    // Check if all favorites are selected
    const sourcesInResults = new Set(cards.map(c => c.sourceName));
    const tagsInResults = new Set(cards.flatMap(c => c.tags || []));
    const allFavSourcesSelected = favoriteMpcSources.length === 0 ||
        favoriteMpcSources.every(s => !sourcesInResults.has(s) || filters.sourceFilters.has(s));
    const allFavTagsSelected = favoriteMpcTags.length === 0 ||
        favoriteMpcTags.every(t => !tagsInResults.has(t) || filters.tagFilters.has(t));
    const favDpiSelected = favoriteMpcDpi === null || filters.minDpi === favoriteMpcDpi;
    const favSortSelected = favoriteMpcSort === null || filters.sortBy === favoriteMpcSort;
    const allFavoritesSelected = allFavSourcesSelected && allFavTagsSelected && favDpiSelected && favSortSelected;
    const hasFavorites = favoriteMpcSources.length > 0 || favoriteMpcTags.length > 0 || favoriteMpcDpi !== null || favoriteMpcSort !== null;

    return (
        <div className="sticky top-0 z-40 shadow-md bg-gray-100 dark:bg-gray-800 rounded-lg text-sm border border-gray-200 dark:border-gray-700">
            <div className="flex flex-wrap sm:flex-nowrap sm:overflow-x-auto items-center gap-2 p-2 scrollbar-hide">
                {/* Favorites toggle button */}
                {hasFavorites && (
                    <button
                        onClick={() => {
                            if (allFavoritesSelected) {
                                // Deselect all favorites
                                setSourceFilters(prev => {
                                    const next = new Set(prev);
                                    favoriteMpcSources.forEach(s => next.delete(s));
                                    return next;
                                });
                                setTagFilters(prev => {
                                    const next = new Set(prev);
                                    favoriteMpcTags.forEach(t => next.delete(t));
                                    return next;
                                });
                                if (favoriteMpcDpi !== 800) {
                                    setMinDpi(800);
                                }
                                if (favoriteMpcSort !== 'dpi') {
                                    setSortBy('dpi');
                                }
                            } else {
                                // Select all favorites
                                if (favoriteMpcSources.length > 0) {
                                    setSourceFilters(prev => {
                                        const next = new Set(prev);
                                        favoriteMpcSources.forEach(s => {
                                            if (sourcesInResults.has(s)) next.add(s);
                                        });
                                        return next;
                                    });
                                }
                                if (favoriteMpcTags.length > 0) {
                                    setTagFilters(prev => {
                                        const next = new Set(prev);
                                        favoriteMpcTags.forEach(t => {
                                            if (tagsInResults.has(t)) next.add(t);
                                        });
                                        return next;
                                    });
                                }
                                if (favoriteMpcDpi !== null) {
                                    setMinDpi(favoriteMpcDpi);
                                }
                                if (favoriteMpcSort !== null) {
                                    setSortBy(favoriteMpcSort);
                                }
                            }
                        }}
                        className="h-10 w-10 flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                        title={allFavoritesSelected ? "Deselect all favorites" : "Select all favorites"}
                    >
                        <Star className={`w-5 h-5 ${allFavoritesSelected ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                    </button>
                )}

                {/* DPI Dropdown */}
                <SelectDropdown
                    label="DPI"
                    buttonText={filters.minDpi === 0 ? "Any" : `${filters.minDpi}+`}
                    selectedLabel={filters.minDpi === 0 ? "Any" : `${filters.minDpi}+`}
                    singleSelectMode
                    disableFavorites
                    isOpen={showMinDpiDropdown}
                    onToggle={() => setShowMinDpiDropdown(!showMinDpiDropdown)}
                    onClose={() => setShowMinDpiDropdown(false)}
                >
                    {[0, 600, 800, 1000, 1200, 1400].map((dpi) => (
                        <div key={dpi} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setFavoriteMpcDpi(favoriteMpcDpi === dpi ? null : dpi);
                                }}
                                className="p-0.5 hover:text-yellow-500 transition-colors"
                                title={favoriteMpcDpi === dpi ? "Remove from favorites" : "Set as favorite"}
                            >
                                <Star className={`w-3.5 h-3.5 ${favoriteMpcDpi === dpi ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setMinDpi(dpi);
                                    setShowMinDpiDropdown(false);
                                }}
                                className={`flex-1 text-left text-sm transition-colors whitespace-nowrap ${filters.minDpi === dpi
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : 'text-gray-900 dark:text-white'
                                    }`}
                            >
                                {dpi === 0 ? "Any" : `${dpi}+`}
                            </button>
                        </div>
                    ))}
                </SelectDropdown>

                {/* Source Dropdown */}
                <MultiSelectDropdown
                    label="Source"
                    buttonText="Any"
                    selectedCount={filters.sourceFilters.size}
                    isOpen={showSourceDropdown}
                    onToggle={() => setShowSourceDropdown(!showSourceDropdown)}
                    onClose={() => {
                        setShowSourceDropdown(false);
                        setRecentlyUnfavoritedSources(new Set());
                        setSourceSearchQuery('');
                    }}
                >
                    {/* Search input */}
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
                            if (filters.sourceFilters.size > 0) {
                                setSourceFilters(new Set());
                            } else {
                                setSourceFilters(new Set(allSources.filter(s => s.hasResults).map(s => s.name)));
                            }
                        }}
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400"
                    >
                        {filters.sourceFilters.size > 0 ? 'Clear All' : 'Select All'}
                    </button>
                    {favoriteMpcSources.length > 0 && (
                        <button
                            onClick={() => {
                                const anyFavsSelected = favoriteMpcSources.some(s => filters.sourceFilters.has(s));
                                if (anyFavsSelected) {
                                    setSourceFilters(prev => {
                                        const next = new Set(prev);
                                        favoriteMpcSources.forEach(s => next.delete(s));
                                        return next;
                                    });
                                } else {
                                    setSourceFilters(prev => {
                                        const next = new Set(prev);
                                        favoriteMpcSources.forEach(s => next.add(s));
                                        return next;
                                    });
                                }
                            }}
                            className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400 border-t border-gray-100 dark:border-gray-600"
                        >
                            {favoriteMpcSources.some(s => filters.sourceFilters.has(s)) ? 'Clear Favorites' : 'Select Favorites'}
                        </button>
                    )}
                    {allSources
                        .filter(s => !sourceSearchQuery || s.name.toLowerCase().includes(sourceSearchQuery.toLowerCase()))
                        .map(s => (
                            <div key={s.name} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (favoriteMpcSources.includes(s.name)) {
                                            setRecentlyUnfavoritedSources(prev => new Set([...prev, s.name]));
                                        }
                                        toggleFavoriteMpcSource(s.name);
                                    }}
                                    className="p-0.5 hover:text-yellow-500 transition-colors"
                                    title={favoriteMpcSources.includes(s.name) ? "Remove from favorites" : "Add to favorites"}
                                >
                                    <Star className={`w-3.5 h-3.5 ${favoriteMpcSources.includes(s.name) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                                </button>
                                <label className={`flex items-center gap-2 flex-1 min-w-0 ${s.hasResults ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                                    <input
                                        type="checkbox"
                                        checked={filters.sourceFilters.has(s.name) && s.hasResults}
                                        onChange={() => s.hasResults && toggleSource(s.name)}
                                        disabled={!s.hasResults}
                                        className="rounded"
                                    />
                                    <span className={`text-sm truncate ${s.hasResults ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                                        {s.name}{!s.hasResults && ' (no results)'}
                                    </span>
                                </label>
                            </div>
                        ))}
                </MultiSelectDropdown>

                {/* Tags Dropdown */}
                <MultiSelectDropdown
                    label="Tags"
                    buttonText="Any"
                    selectedCount={filters.tagFilters.size}
                    isOpen={showTagDropdown}
                    onToggle={() => setShowTagDropdown(!showTagDropdown)}
                    onClose={() => {
                        setShowTagDropdown(false);
                        setRecentlyUnfavoritedTags(new Set());
                        setTagSearchQuery('');
                    }}
                >
                    {/* Search input */}
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
                            if (filters.tagFilters.size > 0) {
                                setTagFilters(new Set());
                            } else {
                                setTagFilters(new Set(allTags.filter(t => t.hasResults).map(t => t.name)));
                            }
                        }}
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400"
                    >
                        {filters.tagFilters.size > 0 ? 'Clear All' : 'Select All'}
                    </button>
                    {favoriteMpcTags.length > 0 && (
                        <button
                            onClick={() => {
                                const anyFavsSelected = favoriteMpcTags.some(t => filters.tagFilters.has(t));
                                if (anyFavsSelected) {
                                    setTagFilters(prev => {
                                        const next = new Set(prev);
                                        favoriteMpcTags.forEach(t => next.delete(t));
                                        return next;
                                    });
                                } else {
                                    setTagFilters(prev => {
                                        const next = new Set(prev);
                                        favoriteMpcTags.forEach(t => next.add(t));
                                        return next;
                                    });
                                }
                            }}
                            className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400 border-t border-gray-100 dark:border-gray-600"
                        >
                            {favoriteMpcTags.some(t => filters.tagFilters.has(t)) ? 'Clear Favorites' : 'Select Favorites'}
                        </button>
                    )}
                    {allTags
                        .filter(t => !tagSearchQuery || t.name.toLowerCase().includes(tagSearchQuery.toLowerCase()))
                        .map(t => (
                            <div key={t.name} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (favoriteMpcTags.includes(t.name)) {
                                            setRecentlyUnfavoritedTags(prev => new Set([...prev, t.name]));
                                        }
                                        toggleFavoriteMpcTag(t.name);
                                    }}
                                    className="p-0.5 hover:text-yellow-500 transition-colors"
                                    title={favoriteMpcTags.includes(t.name) ? "Remove from favorites" : "Add to favorites"}
                                >
                                    <Star className={`w-3.5 h-3.5 ${favoriteMpcTags.includes(t.name) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                                </button>
                                <label className={`flex items-center gap-2 flex-1 min-w-0 ${t.hasResults ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                                    <input
                                        type="checkbox"
                                        checked={filters.tagFilters.has(t.name) && t.hasResults}
                                        onChange={() => t.hasResults && toggleTag(t.name)}
                                        disabled={!t.hasResults}
                                        className="rounded"
                                    />
                                    <span className={`text-sm truncate ${t.hasResults ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                                        {t.name}{!t.hasResults && ' (no results)'}
                                    </span>
                                </label>
                            </div>
                        ))}
                </MultiSelectDropdown>

                {/* Sort controls */}
                <div className="flex items-center gap-2">
                    <SelectDropdown
                        label="Sort"
                        buttonText={filters.sortBy === "name" ? "Name" : filters.sortBy === "dpi" ? "DPI" : "Source"}
                        selectedLabel={filters.sortBy === "name" ? "Name" : filters.sortBy === "dpi" ? "DPI" : "Source"}
                        singleSelectMode
                        disableFavorites
                        isOpen={showSortDropdown}
                        onToggle={() => setShowSortDropdown(!showSortDropdown)}
                        onClose={() => setShowSortDropdown(false)}
                    >
                        {[
                            { value: "name" as const, label: "Name" },
                            { value: "dpi" as const, label: "DPI" },
                            { value: "source" as const, label: "Source" },
                        ].map((option) => (
                            <div key={option.value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setFavoriteMpcSort(favoriteMpcSort === option.value ? null : option.value);
                                    }}
                                    className="p-0.5 hover:text-yellow-500 transition-colors"
                                    title={favoriteMpcSort === option.value ? "Remove from favorites" : "Set as favorite"}
                                >
                                    <Star className={`w-3.5 h-3.5 ${favoriteMpcSort === option.value ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSortBy(option.value);
                                        setShowSortDropdown(false);
                                    }}
                                    className={`flex-1 text-left text-sm transition-colors whitespace-nowrap ${filters.sortBy === option.value
                                        ? 'text-blue-600 dark:text-blue-400'
                                        : 'text-gray-900 dark:text-white'
                                        }`}
                                >
                                    {option.label}
                                </button>
                            </div>
                        ))}
                    </SelectDropdown>
                    <button
                        onClick={() => setSortDir(filters.sortDir === "asc" ? "desc" : "asc")}
                        className="h-10 w-10 flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600"
                        title={filters.sortDir === "asc" ? "Ascending" : "Descending"}
                    >
                        {filters.sortDir === "asc" ? <ArrowUpNarrowWide className="w-5 h-5" /> : <ArrowDownWideNarrow className="w-5 h-5" />}
                    </button>
                </div>

                {/* Fuzzy/Exact toggle */}
                <button
                    onClick={() => setMpcFuzzySearch(!mpcFuzzySearch)}
                    className={`h-10 px-3 flex items-center gap-1.5 rounded-md border text-sm whitespace-nowrap transition-colors ${mpcFuzzySearch
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                        }`}
                    title={mpcFuzzySearch ? "Fuzzy search enabled - matches similar names" : "Exact search - matches exact name only"}
                >
                    {mpcFuzzySearch ? "Fuzzy" : "Exact"}
                </button>

                {/* Clear filters button */}
                {(filters.minDpi > 0 || filters.sourceFilters.size > 0 || filters.tagFilters.size > 0) && (
                    <button
                        onClick={clearFilters}
                        className="h-10 w-10 flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-red-50 dark:hover:bg-red-900/30 hover:border-red-300 dark:hover:border-red-600 hover:text-red-600 dark:hover:text-red-400"
                        title="Clear all filters"
                    >
                        <X className="w-5 h-5" strokeWidth={2.5} />
                    </button>
                )}

                {/* Expand/Collapse all button (source sort mode) */}
                {filters.sortBy === "source" && groupedBySource && (
                    <button
                        onClick={() => {
                            if (allSourcesCollapsed) {
                                // Switch to normal mode (all expanded by default)
                                setAllSourcesCollapsed(false);
                                setCollapsedSources(new Set());
                            } else {
                                // Switch to collapsed mode (all collapsed by default)
                                setAllSourcesCollapsed(true);
                                setCollapsedSources(new Set());
                            }
                        }}
                        className="h-10 px-3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600 text-xs"
                    >
                        {allSourcesCollapsed ? "Expand All" : "Collapse All"}
                    </button>
                )}

                {/* Results count */}
                <span className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 ml-auto whitespace-nowrap text-xs flex items-center overflow-hidden">
                    {filteredCards.length !== cards.length && (
                        <>
                            <span className="h-full flex items-center px-2 text-gray-900 dark:text-white">
                                {filteredCards.length}
                            </span>
                            <span className="w-px h-full bg-gray-300 dark:bg-gray-500" />
                        </>
                    )}
                    <span className="h-full flex items-center px-2 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-600">
                        {cards.length}
                    </span>
                </span>
            </div>
        </div>
    );
}
