import React, { useState, useMemo, useEffect, useRef } from "react";
import { Star } from "lucide-react";
import { SelectDropdown } from "..";
import { SharedFilterLayout } from "./SharedFilterLayout";
import { useUserPreferencesStore } from "@/store";
import { fetchScryfallSets } from "@/helpers/scryfallApi";
import type { ScryfallSet } from "@/types";

export interface ScryfallFilterProps {
    className?: string;
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

interface DisplayScryfallSet extends ScryfallSet {
    isAvailable: boolean;
}

export function ScryfallFilterBar(props: ScryfallFilterProps) {
    const { className } = props;

    // --- State & Handlers ---
    const [showSetDropdown, setShowSetDropdown] = useState(false);
    const [showSearchModeDropdown, setShowSearchModeDropdown] = useState(false);
    const [allSets, setAllSets] = useState<ScryfallSet[]>([]);
    const [isSetsLoading, setIsSetsLoading] = useState(false);
    const [setSearchQuery, setSetSearchQuery] = useState("");

    const [stableScryfallSets, setStableScryfallSets] = useState<DisplayScryfallSet[]>(
        []
    );

    // Track previous sort params to force updates
    const lastSortByRef = useRef<string | null>(null);
    const lastSortDirRef = useRef<string | null>(null);

    // --- Hooks & Data ---
    const preferences = useUserPreferencesStore((state) => state.preferences);

    const toggleFavoriteScryfallSet = useUserPreferencesStore(
        (s) => s.toggleFavoriteScryfallSet
    );
    const setFavoriteScryfallSort = useUserPreferencesStore(
        (s) => s.setFavoriteScryfallSort
    );
    const setFavoriteScryfallGroupBySet = useUserPreferencesStore(
        (s) => s.setFavoriteScryfallGroupBySet
    );
    const setFavoriteScryfallSearchMode = useUserPreferencesStore(
        (s) => s.setFavoriteScryfallSearchMode
    );

    const favoriteScryfallSets = useMemo(
        () => new Set(preferences?.favoriteScryfallSets || []),
        [preferences?.favoriteScryfallSets]
    );
    const favoriteScryfallSearchMode =
        preferences?.favoriteScryfallSearchMode ?? null;
    const favoriteScryfallSort = preferences?.favoriteScryfallSort || null;


    // Load Scryfall Sets
    useEffect(() => {
        if (allSets.length === 0) {
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
    }, [allSets.length]);

    const { availableSets, selectedSets, sortBy, sortDir } = props;

    // --- Computed Data ---
    const scryfallData = useMemo(() => {
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
                // Favorites first
                const codeA = (a.code || "").toLowerCase();
                const codeB = (b.code || "").toLowerCase();
                const isFavA = favoriteScryfallSets.has(a.code) || favoriteScryfallSets.has(codeA);
                const isFavB = favoriteScryfallSets.has(b.code) || favoriteScryfallSets.has(codeB);

                if (isFavA && !isFavB) return -1;
                if (!isFavA && isFavB) return 1;

                // Secondary Sort
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
        allSets,
        setSearchQuery,
        availableSets,
        selectedSets,
        favoriteScryfallSets,
        sortBy,
        sortDir,
    ]);

    // Sync stable sets
    useEffect(() => {
        if (!scryfallData) return;

        const sortChanged =
            props.sortBy !== lastSortByRef.current ||
            props.sortDir !== lastSortDirRef.current;

        if (!showSetDropdown || stableScryfallSets.length === 0 || sortChanged) {
            setStableScryfallSets(scryfallData.displaySets);
            lastSortByRef.current = props.sortBy;
            lastSortDirRef.current = props.sortDir;
        }
    }, [
        scryfallData,
        showSetDropdown,
        props.sortBy,
        props.sortDir,
        stableScryfallSets.length,
    ]);


    // Favorites Logic
    const isAllFavoritesSelected = () => {
        if (favoriteScryfallSets.size === 0) return true;
        return Array.from(favoriteScryfallSets).every(
            (code) => !props.availableSets.has(code) || props.selectedSets.has(code)
        );
    };
    const allFavoritesSelected = isAllFavoritesSelected();
    const hasAnyFavorites = favoriteScryfallSets.size > 0;

    const handleToggleAllFavorites = () => {
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
                    { value: "released", label: "Release Date" },
                    { value: "name", label: "Set Name" },
                ],
                value: props.sortBy,
                onChange: (val) => props.setSortBy(val as "name" | "released"),
                dir: props.sortDir,
                onDirChange: props.setSortDir,
                favoriteSortValue: favoriteScryfallSort,
                onToggleFavoriteSort: (val) => setFavoriteScryfallSort(val === favoriteScryfallSort ? null : val as "name" | "released")
            }}
            viewOptions={{
                groupBy: props.groupBySet,
                onToggleGroupBy: props.onToggleGroupBySet,
                favoriteGroupBy: !!preferences?.favoriteScryfallGroupBySet,
                onToggleFavoriteGroupBy: () => setFavoriteScryfallGroupBySet(!preferences?.favoriteScryfallGroupBySet),
                isCollapsed: props.allSetsCollapsed,
                onToggleCollapse: () => {
                    if (props.allSetsCollapsed) {
                        props.setCollapsedSets(new Set());
                        props.setAllSetsCollapsed(false);
                    } else {
                        // Collapse all displayed sets
                        const allDisplayedSetCodes = stableScryfallSets.map(
                            (s) => s.code
                        );
                        props.setCollapsedSets(
                            new Set(allDisplayedSetCodes)
                        );
                        props.setAllSetsCollapsed(true);
                    }
                }
            }}
            clear={{
                show: props.selectedSets.size > 0,
                onClear: () => props.onSelectSet(new Set())
            }}
            count={{
                total: props.totalCount,
                filtered: props.filteredCount
            }}
        >
            {/* Set Dropdown */}
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
                    </div>
                )}
            </SelectDropdown>

            {/* Search Mode Dropdown */}
            {!props.hideSearchModeSelector && (
                <SelectDropdown
                    label="Mode"
                    buttonText={
                        props.searchMode === "cards"
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
                                    props.setSearchMode(
                                        option.value as "cards" | "prints"
                                    );
                                    setShowSearchModeDropdown(false);
                                }}
                                className={`flex-1 text-left py-1 text-sm ${props.searchMode === option.value
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
        </SharedFilterLayout>
    );
}
