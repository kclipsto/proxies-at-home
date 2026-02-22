import { useState, useMemo } from "react";
import { useUserPreferencesStore } from "@/store";
import { MultiSelectDropdown } from "..";
import { SharedFilterLayout } from "./SharedFilterLayout";
import { type UploadLibraryItem, type UploadLibrarySortKey, getEffectiveCardTypes } from "@/helpers/uploadLibrary";
export interface UploadLibraryFilterProps {
    className?: string;
    mode: "upload-library";
    uploads: UploadLibraryItem[];
    filteredUploads: UploadLibraryItem[];
    sortBy: UploadLibrarySortKey;
    setSortBy: (sort: UploadLibrarySortKey) => void;
    sortDir: 'asc' | 'desc';
    setSortDir: (dir: 'asc' | 'desc') => void;
    typeFilter: string[];
    setTypeFilter: (types: string[]) => void;
    showFavoritesOnly: boolean;
    setShowFavoritesOnly: (show: boolean) => void;
    totalCount: number;
    filteredCount: number;
    groupByType: boolean;
    onToggleGroupByType: () => void;
    allTypesCollapsed: boolean;
    onToggleAllTypesCollapsed: () => void;
}

export function UploadLibraryFilterBar(props: UploadLibraryFilterProps) {
    const {
        className,
        uploads,
        sortBy,
        setSortBy,
        sortDir,
        setSortDir,
        typeFilter,
        setTypeFilter,
        showFavoritesOnly,
        setShowFavoritesOnly,
        totalCount,
        filteredCount
    } = props;

    const [showTypeDropdown, setShowTypeDropdown] = useState(false);

    const availableTypes = useMemo(() => {
        const types = new Set<string>();
        uploads.forEach(u => getEffectiveCardTypes(u).forEach(t => types.add(t)));
        return Array.from(types).sort();
    }, [uploads]);

    const sortOptions = [
        { value: 'name', label: 'Name' },
        { value: 'date', label: 'Date Added' },
        { value: 'type', label: 'Card Type' },
    ];

    // --- Hooks & Data ---
    const preferences = useUserPreferencesStore((state) => state.preferences);
    const setUploadLibrarySort = useUserPreferencesStore((s) => s.setUploadLibrarySort);
    const favoriteSort = preferences?.uploadLibrarySort || null;

    const setFavoriteUploadLibraryGroupByType = useUserPreferencesStore((s) => s.setFavoriteUploadLibraryGroupByType);
    const favoriteGroupByType = preferences?.favoriteUploadLibraryGroupByType || false;

    // "Has favorites" means either we have favorite items OR we have a favorite sort set
    const hasFavoriteItems = useMemo(() => uploads.some(u => u.isFavorite), [uploads]);
    const hasAnyFavorites = hasFavoriteItems || favoriteSort !== null || favoriteGroupByType;

    // Check if current state matches "all favorites"
    const isAllFavoritesSelected = useMemo(() => {
        // logic: if showing favorites only is ON, or if we don't have favorite items so it doesn't matter?
        // Usually "All Selected" means the filter is ACTIVE.
        // For sort: simple equality.
        // For toggle: true.
        // If hasFavoriteItems is false, showFavoritesOnly can't really be true (or yields empty).
        // Let's say "Favorites Selected" means:
        // 1. showFavoritesOnly is TRUE (if we have favorite items)
        // 2. Sort matches favorite sort (if set)

        let conditionsMet = true;
        if (hasFavoriteItems && !showFavoritesOnly) conditionsMet = false;
        if (favoriteSort && sortBy !== favoriteSort) conditionsMet = false;
        if (favoriteGroupByType && !props.groupByType) conditionsMet = false;
        // If nothing is favorited/set, well, it returns true technically (vacuously) but hasAny is false.
        return conditionsMet;
    }, [hasFavoriteItems, showFavoritesOnly, favoriteSort, sortBy, favoriteGroupByType, props.groupByType]);

    const handleToggleFavorites = () => {
        if (isAllFavoritesSelected) {
            // Reset - Toggle OFF everything that constitutes the "Favorite" state
            if (showFavoritesOnly) setShowFavoritesOnly(false);

            // If current sort is the favorite sort, revert to 'name' (default)
            if (favoriteSort && sortBy === favoriteSort) setSortBy('name');

            // If grouping is active and is the favorite, toggle it off
            if (favoriteGroupByType && props.groupByType) props.onToggleGroupByType();
        } else {
            // Apply - Toggle ON everything
            if (hasFavoriteItems && !showFavoritesOnly) setShowFavoritesOnly(true);
            if (favoriteSort && sortBy !== favoriteSort) setSortBy(favoriteSort);
            if (favoriteGroupByType && !props.groupByType) props.onToggleGroupByType();
        }
    };

    return (
        <SharedFilterLayout
            className={className}
            favorites={{
                isAllSelected: isAllFavoritesSelected,
                hasAny: hasAnyFavorites,
                onToggle: handleToggleFavorites,
            }}
            sort={{
                options: sortOptions,
                value: sortBy,
                onChange: (val) => setSortBy(val as UploadLibrarySortKey),
                dir: sortDir,
                onDirChange: setSortDir,
                favoriteSortValue: favoriteSort,
                onToggleFavoriteSort: (val) => setUploadLibrarySort((val as UploadLibrarySortKey) === favoriteSort ? null : (val as UploadLibrarySortKey))
            }}
            viewOptions={{
                groupBy: props.groupByType,
                onToggleGroupBy: props.onToggleGroupByType,
                favoriteGroupBy: favoriteGroupByType,
                onToggleFavoriteGroupBy: () => setFavoriteUploadLibraryGroupByType(!favoriteGroupByType),
                isCollapsed: props.allTypesCollapsed,
                onToggleCollapse: props.onToggleAllTypesCollapsed
            }}
            clear={{
                show: typeFilter.length > 0 || showFavoritesOnly || (!!favoriteSort && sortBy === favoriteSort) || (!!favoriteGroupByType && props.groupByType),
                onClear: () => {
                    setTypeFilter([]);
                    setShowFavoritesOnly(false);
                    if (favoriteSort && sortBy === favoriteSort) setSortBy('name');
                    if (favoriteGroupByType && props.groupByType) props.onToggleGroupByType();
                }
            }}
            count={{
                total: totalCount,
                filtered: filteredCount
            }}
        >
            {/* Type Dropdown */}
            {availableTypes.length > 0 && (
                <MultiSelectDropdown
                    label="Type"
                    buttonText={typeFilter.length > 0 ? typeFilter.join(', ') : 'Any'}
                    selectedCount={typeFilter.length}
                    isOpen={showTypeDropdown}
                    onToggle={() => setShowTypeDropdown(!showTypeDropdown)}
                    onClose={() => setShowTypeDropdown(false)}
                >
                    <button
                        onClick={() => setTypeFilter(typeFilter.length > 0 ? [] : availableTypes)}
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400"
                    >
                        {typeFilter.length > 0 ? 'Clear All' : 'Select All'}
                    </button>
                    {availableTypes.map(t => (
                        <div key={t} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600">
                            <label className="flex items-center gap-2 flex-1 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={typeFilter.includes(t)}
                                    onChange={() => {
                                        const next = typeFilter.includes(t) ? typeFilter.filter(x => x !== t) : [...typeFilter, t];
                                        setTypeFilter(next);
                                    }}
                                    className="rounded border-gray-300 dark:border-gray-500 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
                                />
                                <span className="text-sm text-gray-900 dark:text-white">{t}</span>
                            </label>
                        </div>
                    ))}
                </MultiSelectDropdown>
            )}
        </SharedFilterLayout>
    );
}
