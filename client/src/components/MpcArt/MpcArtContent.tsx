import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { logoSvg } from "@/assets";
import { Button } from "flowbite-react";
import { ArrowUpNarrowWide, ArrowDownWideNarrow, ChevronRight, ChevronDown, Star, X } from "lucide-react";
import { SelectDropdown, MultiSelectDropdown, CardGrid } from "../common";
import { MpcArtGrid } from "./MpcArtGrid";
import { searchMpcAutofill, type MpcAutofillCard } from "@/helpers/mpcAutofillApi";
import { useSettingsStore } from "@/store";

export interface MpcArtContentProps {
    cardName: string;
    onSelectCard: (card: MpcAutofillCard) => void;
    onSwitchToScryfall?: () => void;
    containerClassStyle?: string;
    autoSearch?: boolean;
    /** External control for filters collapsed state (mobile landscape) */
    filtersCollapsed?: boolean;
    /** Callback when filters collapsed state changes */
    onFiltersCollapsedChange?: (collapsed: boolean) => void;
    /** Callback when active filter count changes */
    onFilterCountChange?: (count: number) => void;
    /** Card size multiplier for the grid (1.0 = default, 0.5-2.0 range) */
    cardSize?: number;
}

/**
 * Reusable MPC art content with filter bar, search, and grid.
 * Used in ArtworkTabContent and AdvancedSearch.
 */
export function MpcArtContent({
    cardName,
    onSelectCard,
    onSwitchToScryfall,
    containerClassStyle: containerClassStyling,
    autoSearch = true,
    filtersCollapsed: externalFiltersCollapsed,
    onFilterCountChange,
    cardSize = 1.0,
}: MpcArtContentProps) {
    // Settings store for favorites
    const favoriteMpcSources = useSettingsStore(s => s.favoriteMpcSources);
    const toggleFavoriteMpcSource = useSettingsStore(s => s.toggleFavoriteMpcSource);
    const favoriteMpcTags = useSettingsStore(s => s.favoriteMpcTags);
    const toggleFavoriteMpcTag = useSettingsStore(s => s.toggleFavoriteMpcTag);
    const favoriteMpcDpi = useSettingsStore(s => s.favoriteMpcDpi);
    const setFavoriteMpcDpi = useSettingsStore(s => s.setFavoriteMpcDpi);
    const favoriteMpcSort = useSettingsStore(s => s.favoriteMpcSort);
    const setFavoriteMpcSort = useSettingsStore(s => s.setFavoriteMpcSort);
    const mpcFuzzySearch = useSettingsStore(s => s.mpcFuzzySearch);
    const setMpcFuzzySearch = useSettingsStore(s => s.setMpcFuzzySearch);

    // MPC state
    const [mpcResults, setMpcResults] = useState<MpcAutofillCard[]>([]);
    const [mpcLoading, setMpcLoading] = useState(false);
    const [mpcSearched, setMpcSearched] = useState(false);

    // MPC filter/sort state - initialize from favorites if set
    const [mpcMinDpi, setMpcMinDpi] = useState<number>(() => favoriteMpcDpi ?? 800);
    const [mpcSourceFilters, setMpcSourceFilters] = useState<Set<string>>(() => new Set(favoriteMpcSources));
    const [mpcSortBy, setMpcSortBy] = useState<"name" | "dpi" | "source">(() => favoriteMpcSort ?? "dpi");
    const [mpcSortDir, setMpcSortDir] = useState<"asc" | "desc">("desc");
    const [collapsedSources, setCollapsedSources] = useState<Set<string>>(new Set());
    const [showMinDpiDropdown, setShowMinDpiDropdown] = useState(false);
    const [showSourceDropdown, setShowSourceDropdown] = useState(false);
    const [mpcTagFilters, setMpcTagFilters] = useState<Set<string>>(() => new Set(favoriteMpcTags));
    const [showTagDropdown, setShowTagDropdown] = useState(false);
    const [showSortDropdown, setShowSortDropdown] = useState(false);
    const [internalFiltersCollapsed] = useState(true); // Default collapsed, parent should control expansion

    // Report active filter count to parent
    useEffect(() => {
        if (!onFilterCountChange) return;
        let count = 0;
        if (mpcSourceFilters.size > 0) count += mpcSourceFilters.size;
        if (mpcTagFilters.size > 0) count += mpcTagFilters.size;

        // Only count DPI filter if it differs from the user's favorite (or default 800)
        // This prevents the "standard" view from showing as having 1 active filter
        const defaultDpi = favoriteMpcDpi ?? 800;
        if (mpcMinDpi > 0 && mpcMinDpi !== defaultDpi) count += 1;

        onFilterCountChange(count);
    }, [mpcSourceFilters, mpcTagFilters, mpcMinDpi, onFilterCountChange, favoriteMpcDpi]);

    // Use external state if provided, otherwise use internal state
    const filtersCollapsed = externalFiltersCollapsed ?? internalFiltersCollapsed;

    // Ref for the scrollable container
    const containerRef = useRef<HTMLDivElement>(null);

    const lastSearchedName = useRef<string>("");

    // Toggle source collapse
    const toggleSourceCollapse = useCallback((sourceName: string) => {
        setCollapsedSources(prev => {
            const next = new Set(prev);
            if (next.has(sourceName)) next.delete(sourceName);
            else next.add(sourceName);
            return next;
        });
    }, []);

    // Quick-filter handlers for badge clicks
    const handleDpiFilter = useCallback((dpi: number) => {
        // Round down to nearest threshold
        const thresholds = [1400, 1200, 1000, 800, 600];
        const roundedDpi = thresholds.find(t => dpi >= t) ?? 0;
        setMpcMinDpi(prev => prev === roundedDpi ? 0 : roundedDpi);
    }, []);
    const handleSourceFilter = useCallback((source: string) => {
        setMpcSourceFilters(prev => {
            const next = new Set(prev);
            if (next.has(source)) next.delete(source);
            else next.add(source);
            return next;
        });
    }, []);
    const handleTagFilter = useCallback((tag: string) => {
        setMpcTagFilters(prev => {
            const next = new Set(prev);
            if (next.has(tag)) next.delete(tag);
            else next.add(tag);
            return next;
        });
    }, []);

    // Available sources from results (sorted with favorites first)
    const mpcSources = useMemo(() => {
        const sources = new Set<string>();
        mpcResults.forEach(c => sources.add(c.sourceName));
        return Array.from(sources).sort((a, b) => {
            const aFav = favoriteMpcSources.includes(a);
            const bFav = favoriteMpcSources.includes(b);
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;
            return a.localeCompare(b);
        });
    }, [mpcResults, favoriteMpcSources]);

    // Available tags from results (sorted with favorites first)
    const mpcTags = useMemo(() => {
        const tags = new Set<string>();
        mpcResults.forEach(c => c.tags?.forEach(t => tags.add(t)));
        return Array.from(tags).sort((a, b) => {
            const aFav = favoriteMpcTags.includes(a);
            const bFav = favoriteMpcTags.includes(b);
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;
            return a.localeCompare(b);
        });
    }, [mpcResults, favoriteMpcTags]);

    // Filtered and sorted MPC results
    const filteredMpcResults = useMemo(() => {
        let filtered = mpcResults;

        if (mpcMinDpi > 0) {
            filtered = filtered.filter(c => c.dpi >= mpcMinDpi);
        }
        if (mpcSourceFilters.size > 0) {
            filtered = filtered.filter(c => mpcSourceFilters.has(c.sourceName));
        }
        if (mpcTagFilters.size > 0) {
            filtered = filtered.filter(c =>
                c.tags && c.tags.some(t => mpcTagFilters.has(t))
            );
        }

        const dir = mpcSortDir === "asc" ? 1 : -1;
        if (mpcSortBy === "dpi") {
            filtered = [...filtered].sort((a, b) => dir * (a.dpi - b.dpi));
        } else if (mpcSortBy === "source") {
            filtered = [...filtered].sort((a, b) => {
                const aFav = favoriteMpcSources.includes(a.sourceName);
                const bFav = favoriteMpcSources.includes(b.sourceName);
                if (aFav && !bFav) return -1;
                if (!aFav && bFav) return 1;
                return dir * (a.sourceName.localeCompare(b.sourceName) || a.name.localeCompare(b.name));
            });
        } else {
            filtered = [...filtered].sort((a, b) => dir * a.name.localeCompare(b.name));
        }

        return filtered;
    }, [mpcResults, mpcMinDpi, mpcSourceFilters, mpcTagFilters, mpcSortBy, mpcSortDir, favoriteMpcSources]);

    // Grouped by source (for source sort mode)
    const groupedMpcResults = useMemo(() => {
        if (mpcSortBy !== "source") return null;
        const groups = new Map<string, MpcAutofillCard[]>();
        for (const card of filteredMpcResults) {
            const existing = groups.get(card.sourceName) || [];
            existing.push(card);
            groups.set(card.sourceName, existing);
        }
        return groups;
    }, [filteredMpcResults, mpcSortBy]);



    // MPC search handler
    // Track last search params to detect changes
    const lastSearchParams = useRef<{ name: string; fuzzy: boolean } | null>(null);

    const handleGetMpcArt = useCallback(async () => {
        if (!cardName || !cardName.trim()) return;
        // Skip if same search params as last time
        if (lastSearchParams.current?.name === cardName &&
            lastSearchParams.current?.fuzzy === mpcFuzzySearch &&
            mpcResults.length > 0) return;

        lastSearchParams.current = { name: cardName, fuzzy: mpcFuzzySearch };
        lastSearchedName.current = cardName;
        setMpcLoading(true);
        setMpcSearched(true);
        try {
            const results = await searchMpcAutofill(cardName, "CARD", mpcFuzzySearch);
            setMpcResults(results);
        } catch (err) {
            console.error("MPC search error:", err);
            setMpcResults([]);
        } finally {
            setMpcLoading(false);
        }
    }, [cardName, mpcResults.length, mpcFuzzySearch]);

    // Debounced auto-search on mount/cardName change
    useEffect(() => {
        // Reset search state when query is cleared
        if (!cardName || !cardName.trim()) {
            setMpcSearched(false);
            setMpcResults([]);
            lastSearchedName.current = "";
            return;
        }

        if (!autoSearch || cardName === lastSearchedName.current) return;

        // Debounce the search by 500ms
        const timeoutId = setTimeout(() => {
            handleGetMpcArt();
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [autoSearch, cardName, handleGetMpcArt]);

    return (
        <div className={`${containerClassStyling ? containerClassStyling : 'h-full min-h-0'} flex flex-col flex-1 lg:flex-none max-lg:landscape:h-full w-full`}>
            <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden relative scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent flex flex-col min-h-0">
                {mpcLoading ? (
                    <div className="px-6 w-full">
                        <CardGrid cardSize={cardSize}>
                            <div className="col-span-full">
                                <MpcArtGrid cards={[]} onSelectCard={() => { }} isLoading />
                            </div>
                        </CardGrid>
                    </div>
                ) : mpcResults.length > 0 ? (
                    <div className="px-6 flex flex-col gap-4 w-full relative">
                        {/* Filter bar - sticky: pushes content down initially, sticks to top when scrolling */}
                        <div
                            className={`sticky top-0 z-20 shadow-md bg-gray-100 dark:bg-gray-800 rounded-lg text-sm border border-gray-200 dark:border-gray-700 ${filtersCollapsed ? 'hidden' : ''}`}
                        >
                            {/* Filter content - wraps on mobile portrait, scrolls horizontally on larger screens */}
                            <div className="flex flex-wrap sm:flex-nowrap sm:overflow-x-auto items-center gap-2 p-2 scrollbar-hide">
                                {/* Favorites toggle button - show if any favorites are defined */}
                                {(favoriteMpcSources.length > 0 || favoriteMpcTags.length > 0 || favoriteMpcDpi !== null || favoriteMpcSort !== null) && (() => {
                                    // Calculate if ALL favorites are currently selected
                                    const allFavSourcesSelected = favoriteMpcSources.length === 0 || favoriteMpcSources.every(s => mpcSourceFilters.has(s));
                                    const allFavTagsSelected = favoriteMpcTags.length === 0 || favoriteMpcTags.every(t => mpcTagFilters.has(t));
                                    const favDpiSelected = favoriteMpcDpi === null || mpcMinDpi === favoriteMpcDpi;
                                    const favSortSelected = favoriteMpcSort === null || mpcSortBy === favoriteMpcSort;
                                    const allFavoritesSelected = allFavSourcesSelected && allFavTagsSelected && favDpiSelected && favSortSelected;

                                    return (
                                        <button
                                            onClick={() => {
                                                if (allFavoritesSelected) {
                                                    // Deselect all favorites - reset to defaults
                                                    setMpcSourceFilters(prev => {
                                                        const next = new Set(prev);
                                                        favoriteMpcSources.forEach(s => next.delete(s));
                                                        return next;
                                                    });
                                                    setMpcTagFilters(prev => {
                                                        const next = new Set(prev);
                                                        favoriteMpcTags.forEach(t => next.delete(t));
                                                        return next;
                                                    });
                                                    // Reset DPI to default (800) if it's not their favorite
                                                    if (favoriteMpcDpi !== 800) {
                                                        setMpcMinDpi(800);
                                                    }
                                                    // Reset Sort to default ('dpi') if it's not their favorite
                                                    if (favoriteMpcSort !== 'dpi') {
                                                        setMpcSortBy('dpi');
                                                    }
                                                } else {
                                                    // Select all favorites
                                                    if (favoriteMpcSources.length > 0) {
                                                        setMpcSourceFilters(prev => {
                                                            const next = new Set(prev);
                                                            favoriteMpcSources.forEach(s => next.add(s));
                                                            return next;
                                                        });
                                                    }
                                                    if (favoriteMpcTags.length > 0) {
                                                        setMpcTagFilters(prev => {
                                                            const next = new Set(prev);
                                                            favoriteMpcTags.forEach(t => next.add(t));
                                                            return next;
                                                        });
                                                    }
                                                    if (favoriteMpcDpi !== null) {
                                                        setMpcMinDpi(favoriteMpcDpi);
                                                    }
                                                    if (favoriteMpcSort !== null) {
                                                        setMpcSortBy(favoriteMpcSort);
                                                    }
                                                }
                                            }}
                                            className="h-10 w-10 flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                                            title={allFavoritesSelected ? "Deselect all favorites" : "Select all favorites"}
                                        >
                                            <Star className={`w-5 h-5 ${allFavoritesSelected ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                                        </button>
                                    );
                                })()}
                                <SelectDropdown
                                    label="DPI"
                                    buttonText={mpcMinDpi === 0 ? "Any" : `${mpcMinDpi}+`}
                                    selectedLabel={mpcMinDpi === 0 ? "Any" : `${mpcMinDpi}+`}
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
                                                    setMpcMinDpi(dpi);
                                                    setShowMinDpiDropdown(false);
                                                }}
                                                className={`flex-1 text-left text-sm transition-colors whitespace-nowrap ${mpcMinDpi === dpi
                                                    ? 'text-blue-600 dark:text-blue-400'
                                                    : 'text-gray-900 dark:text-white'
                                                    }`}
                                            >
                                                {dpi === 0 ? "Any" : `${dpi}+`}
                                            </button>
                                        </div>
                                    ))}
                                </SelectDropdown>
                                <MultiSelectDropdown
                                    label="Source"
                                    buttonText="Any"
                                    selectedCount={mpcSourceFilters.size}
                                    isOpen={showSourceDropdown}
                                    onToggle={() => setShowSourceDropdown(!showSourceDropdown)}
                                    onClose={() => setShowSourceDropdown(false)}
                                >
                                    <button
                                        onClick={() => {
                                            if (mpcSourceFilters.size > 0) {
                                                setMpcSourceFilters(new Set());
                                            } else {
                                                setMpcSourceFilters(new Set(mpcSources));
                                            }
                                        }}
                                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400"
                                    >
                                        {mpcSourceFilters.size > 0 ? 'Clear All' : 'Select All'}
                                    </button>
                                    {favoriteMpcSources.length > 0 && (
                                        <button
                                            onClick={() => {
                                                const anyFavsSelected = favoriteMpcSources.some(s => mpcSourceFilters.has(s));
                                                if (anyFavsSelected) {
                                                    // Clear favorites from selection
                                                    setMpcSourceFilters(prev => {
                                                        const next = new Set(prev);
                                                        favoriteMpcSources.forEach(s => next.delete(s));
                                                        return next;
                                                    });
                                                } else {
                                                    // Add favorites to selection
                                                    setMpcSourceFilters(prev => {
                                                        const next = new Set(prev);
                                                        favoriteMpcSources.forEach(s => next.add(s));
                                                        return next;
                                                    });
                                                }
                                            }}
                                            className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400 border-t border-gray-100 dark:border-gray-600"
                                        >
                                            {favoriteMpcSources.some(s => mpcSourceFilters.has(s)) ? 'Clear Favorites' : 'Select Favorites'}
                                        </button>
                                    )}
                                    {mpcSources.map(s => (
                                        <div key={s} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleFavoriteMpcSource(s);
                                                }}
                                                className="p-0.5 hover:text-yellow-500 transition-colors"
                                                title={favoriteMpcSources.includes(s) ? "Remove from favorites" : "Add to favorites"}
                                            >
                                                <Star className={`w-3.5 h-3.5 ${favoriteMpcSources.includes(s) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                                            </button>
                                            <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                                                <input
                                                    type="checkbox"
                                                    checked={mpcSourceFilters.has(s)}
                                                    onChange={() => handleSourceFilter(s)}
                                                    className="rounded"
                                                />
                                                <span className="text-sm text-gray-900 dark:text-white truncate">{s}</span>
                                            </label>
                                        </div>
                                    ))}
                                </MultiSelectDropdown>
                                <MultiSelectDropdown
                                    label="Tags"
                                    buttonText="Any"
                                    selectedCount={mpcTagFilters.size}
                                    isOpen={showTagDropdown}
                                    onToggle={() => setShowTagDropdown(!showTagDropdown)}
                                    onClose={() => setShowTagDropdown(false)}
                                >
                                    <button
                                        onClick={() => {
                                            if (mpcTagFilters.size > 0) {
                                                setMpcTagFilters(new Set());
                                            } else {
                                                setMpcTagFilters(new Set(mpcTags));
                                            }
                                        }}
                                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400"
                                    >
                                        {mpcTagFilters.size > 0 ? 'Clear All' : 'Select All'}
                                    </button>
                                    {favoriteMpcTags.length > 0 && (
                                        <button
                                            onClick={() => {
                                                const anyFavsSelected = favoriteMpcTags.some(t => mpcTagFilters.has(t));
                                                if (anyFavsSelected) {
                                                    // Clear favorites from selection
                                                    setMpcTagFilters(prev => {
                                                        const next = new Set(prev);
                                                        favoriteMpcTags.forEach(t => next.delete(t));
                                                        return next;
                                                    });
                                                } else {
                                                    // Add favorites to selection
                                                    setMpcTagFilters(prev => {
                                                        const next = new Set(prev);
                                                        favoriteMpcTags.forEach(t => next.add(t));
                                                        return next;
                                                    });
                                                }
                                            }}
                                            className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400 border-t border-gray-100 dark:border-gray-600"
                                        >
                                            {favoriteMpcTags.some(t => mpcTagFilters.has(t)) ? 'Clear Favorites' : 'Select Favorites'}
                                        </button>
                                    )}
                                    {mpcTags.map(t => (
                                        <div key={t} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleFavoriteMpcTag(t);
                                                }}
                                                className="p-0.5 hover:text-yellow-500 transition-colors"
                                                title={favoriteMpcTags.includes(t) ? "Remove from favorites" : "Add to favorites"}
                                            >
                                                <Star className={`w-3.5 h-3.5 ${favoriteMpcTags.includes(t) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                                            </button>
                                            <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                                                <input
                                                    type="checkbox"
                                                    checked={mpcTagFilters.has(t)}
                                                    onChange={() => handleTagFilter(t)}
                                                    className="rounded"
                                                />
                                                <span className="text-sm text-gray-900 dark:text-white truncate">{t}</span>
                                            </label>
                                        </div>
                                    ))}
                                </MultiSelectDropdown>
                                <div className="flex items-center gap-2">
                                    <SelectDropdown
                                        label="Sort"
                                        buttonText={mpcSortBy === "name" ? "Name" : mpcSortBy === "dpi" ? "DPI" : "Source"}
                                        selectedLabel={mpcSortBy === "name" ? "Name" : mpcSortBy === "dpi" ? "DPI" : "Source"}
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
                                                        setMpcSortBy(option.value);
                                                        setShowSortDropdown(false);
                                                    }}
                                                    className={`flex-1 text-left text-sm transition-colors whitespace-nowrap ${mpcSortBy === option.value
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
                                        onClick={() => setMpcSortDir(d => d === "asc" ? "desc" : "asc")}
                                        className="h-10 w-10 flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600"
                                        title={mpcSortDir === "asc" ? "Ascending" : "Descending"}
                                    >
                                        {mpcSortDir === "asc" ? <ArrowUpNarrowWide className="w-5 h-5" /> : <ArrowDownWideNarrow className="w-5 h-5" />}
                                    </button>
                                </div>
                                {/* Fuzzy/Exact search toggle */}
                                <button
                                    onClick={() => {
                                        setMpcFuzzySearch(!mpcFuzzySearch);
                                        // Reset search params to trigger re-search with new setting
                                        lastSearchParams.current = null;
                                    }}
                                    className={`h-10 px-3 flex items-center gap-1.5 rounded-md border text-sm whitespace-nowrap transition-colors ${mpcFuzzySearch
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                                        }`}
                                    title={mpcFuzzySearch ? "Fuzzy search enabled - matches similar names" : "Exact search - matches exact name only"}
                                >
                                    {mpcFuzzySearch ? "Fuzzy" : "Exact"}
                                </button>
                                {/* Clear filters button - shown when any filter is active */}
                                {(mpcMinDpi > 0 || mpcSourceFilters.size > 0 || mpcTagFilters.size > 0) && (
                                    <button
                                        onClick={() => {
                                            setMpcMinDpi(0);
                                            setMpcSourceFilters(new Set());
                                            setMpcTagFilters(new Set());
                                        }}
                                        className="h-10 w-10 flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-red-50 dark:hover:bg-red-900/30 hover:border-red-300 dark:hover:border-red-600 hover:text-red-600 dark:hover:text-red-400"
                                        title="Clear all filters"
                                    >
                                        <X className="w-5 h-5" strokeWidth={2.5} />
                                    </button>
                                )}
                                {/* Expand/Collapse all button */}
                                {mpcSortBy === "source" && groupedMpcResults && (
                                    <button
                                        onClick={() => {
                                            if (collapsedSources.size === groupedMpcResults.size) {
                                                setCollapsedSources(new Set());
                                            } else {
                                                setCollapsedSources(new Set(groupedMpcResults.keys()));
                                            }
                                        }}
                                        className="h-10 px-3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600 text-xs"
                                    >
                                        {collapsedSources.size === groupedMpcResults.size ? "Expand All" : "Collapse All"}
                                    </button>
                                )}
                                <span className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 ml-auto whitespace-nowrap text-xs flex items-center overflow-hidden">
                                    {filteredMpcResults.length !== mpcResults.length && (
                                        <>
                                            <span className="h-full flex items-center px-2 text-gray-900 dark:text-white">
                                                {filteredMpcResults.length}
                                            </span>
                                            <span className="w-px h-full bg-gray-300 dark:bg-gray-500" />
                                        </>
                                    )}
                                    <span className="h-full flex items-center px-2 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-600">
                                        {mpcResults.length}
                                    </span>
                                </span>
                            </div>
                        </div>

                        {/* Grid - 2 columns on mobile, single-row-height on landscape, auto-fill on desktop */}
                        {filteredMpcResults.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500 dark:text-gray-400">
                                <p className="mb-4 text-base">
                                    "{cardName}" had {mpcResults.length} results, but current filters return none.
                                </p>
                                <Button
                                    color="red"
                                    onClick={() => {
                                        setMpcMinDpi(0);
                                        setMpcSourceFilters(new Set());
                                        setMpcTagFilters(new Set());
                                    }}
                                >
                                    Clear all filters
                                </Button>
                            </div>
                        ) : (
                            mpcSortBy === "source" && groupedMpcResults ? (
                                <div className="col-span-full flex flex-col gap-4">
                                    {Array.from(groupedMpcResults.entries()).map(([sourceName, cards]) => (
                                        <div key={sourceName} className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                                            <button
                                                onClick={() => toggleSourceCollapse(sourceName)}
                                                className="w-full flex items-center justify-between px-4 py-3 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-900 transition-colors"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleFavoriteMpcSource(sourceName);
                                                        }}
                                                        className="p-1 hover:text-yellow-500 transition-colors"
                                                        title={favoriteMpcSources.includes(sourceName) ? "Remove from favorites" : "Add to favorites"}
                                                    >
                                                        <Star className={`w-4 h-4 ${favoriteMpcSources.includes(sourceName) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                                                    </button>
                                                    <span className="font-medium text-gray-900 dark:text-white">{sourceName}</span>
                                                </div>
                                                <span className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                                    <span>{cards.length} cards</span>
                                                    {collapsedSources.has(sourceName) ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </span>
                                            </button>
                                            {!collapsedSources.has(sourceName) && (
                                                <div className="p-4">
                                                    <CardGrid cardSize={cardSize}>
                                                        <MpcArtGrid
                                                            cards={cards}
                                                            onSelectCard={onSelectCard}
                                                            onFilterDpi={handleDpiFilter}
                                                            onFilterSource={handleSourceFilter}
                                                            onFilterTag={handleTagFilter}
                                                            activeMinDpi={mpcMinDpi}
                                                            activeSources={mpcSourceFilters}
                                                            activeTags={mpcTagFilters}
                                                        />
                                                    </CardGrid>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <CardGrid cardSize={cardSize}>
                                    <MpcArtGrid
                                        cards={filteredMpcResults}
                                        onSelectCard={onSelectCard}
                                        onFilterDpi={handleDpiFilter}
                                        onFilterSource={handleSourceFilter}
                                        onFilterTag={handleTagFilter}
                                        activeMinDpi={mpcMinDpi}
                                        activeSources={mpcSourceFilters}
                                        activeTags={mpcTagFilters}
                                    />
                                </CardGrid>
                            )
                        )}
                    </div>
                ) : mpcSearched && cardName.trim() ? (
                    <div className="px-6 col-span-full flex flex-col items-center justify-center w-full flex-1 text-gray-400 dark:text-gray-500">
                        <img src={logoSvg} alt="Proxxied Logo" className="w-24 h-24 mb-4 opacity-50" />
                        <p className="text-sm font-medium text-center mb-4">No MPC art found for "{cardName}"</p>
                        {onSwitchToScryfall && (
                            <Button color="blue" onClick={onSwitchToScryfall}>
                                Switch to Scryfall
                            </Button>
                        )}
                        <div className="mt-4 h-8 w-full" aria-hidden="true" />
                    </div>
                ) : (
                    <div className="px-6 col-span-full flex flex-col items-center justify-center w-full flex-1 text-gray-400 dark:text-gray-500">
                        <img src={logoSvg} alt="Proxxied Logo" className="w-24 h-24 mb-4 opacity-50" />
                        <p className="text-sm font-medium text-center">Search for a card to find custom art.<br />Results from <a href="https://mpcfill.com" target="_blank" rel="noopener noreferrer" className="underline text-blue-500">MPC Autofill</a>.</p>
                        <div className="mt-4 h-8 w-full" aria-hidden="true" />
                    </div>
                )}
            </div>
        </div>
    );
}
