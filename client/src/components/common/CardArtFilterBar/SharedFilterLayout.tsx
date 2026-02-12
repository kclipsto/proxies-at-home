import React, { useState } from "react";
import {
    ArrowUpNarrowWide,
    ArrowDownWideNarrow,
    Star,
    X,
    Rows3,
    ChevronsUp,
    ChevronsDown,
} from "lucide-react";
import { FilterBarShell } from "../FilterBarShell";
import { SelectDropdown } from "../SelectDropdown";

export interface SharedFilterLayoutProps {
    children?: React.ReactNode;
    className?: string;

    favorites?: {
        isAllSelected: boolean;
        hasAny: boolean;
        onToggle: () => void;
    };

    sort?: {
        options: { value: string; label: string }[];
        value: string;
        onChange: (value: string) => void;
        dir: "asc" | "desc";
        onDirChange: (dir: "asc" | "desc") => void;

        // Optional favorites logic for sort options
        favoriteSortValue?: string | null;
        onToggleFavoriteSort?: (value: string) => void;
    };

    viewOptions?: {
        groupBy?: boolean;
        onToggleGroupBy?: () => void;
        favoriteGroupBy?: boolean;
        onToggleFavoriteGroupBy?: () => void;
        isCollapsed?: boolean;
        onToggleCollapse?: () => void;
    };

    extraControls?: React.ReactNode;

    clear?: {
        show: boolean;
        onClear: () => void;
    };

    count?: {
        total?: number;
        filtered?: number;
    };
}

export function SharedFilterLayout(props: SharedFilterLayoutProps) {
    const {
        children,
        className,
        favorites,
        sort,
        viewOptions,
        extraControls,
        clear,
        count,
    } = props;

    const [isSortOpen, setIsSortOpen] = useState(false);

    return (
        <FilterBarShell className={className}>
            {/* 1. Global Favorites Toggle */}
            {favorites && favorites.hasAny && (
                <button
                    onClick={favorites.onToggle}
                    className="h-10 w-10 flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 flex-shrink-0"
                    title={
                        favorites.isAllSelected
                            ? "Deselect all favorites"
                            : "Select all favorites"
                    }
                >
                    <Star
                        className={`w-5 h-5 ${favorites.isAllSelected ? "fill-yellow-400 text-yellow-400" : "text-gray-400"} hover:text-yellow-500 transition-colors`}
                    />
                </button>
            )}

            {/* 2. Middle Children (Source Specifics) */}
            {children}

            {/* 3. Extra Controls (e.g. Fuzzy Search) */}
            {extraControls}

            {/* 4. Sort Controls */}
            {sort && (
                <div className="flex items-center gap-2">
                    <SelectDropdown
                        label="Sort"
                        buttonText={
                            sort.options.find((o) => o.value === sort.value)?.label || "Sort"
                        }
                        selectedLabel={
                            sort.options.find((o) => o.value === sort.value)?.label || "Sort"
                        }
                        singleSelectMode
                        disableFavorites
                        isOpen={isSortOpen}
                        onToggle={() => setIsSortOpen(!isSortOpen)}
                        onClose={() => setIsSortOpen(false)}
                    >
                        {sort.options.map((option) => (
                            <div
                                key={option.value}
                                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600"
                            >
                                {/* Favorite Star Button - Only show if callback provided */}
                                {sort.onToggleFavoriteSort && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            sort.onToggleFavoriteSort?.(option.value);
                                        }}
                                        className="p-0.5 hover:text-yellow-500 transition-colors"
                                        title={
                                            sort.favoriteSortValue === option.value
                                                ? "Remove from favorites"
                                                : "Set as favorite"
                                        }
                                    >
                                        <Star
                                            className={`w-3.5 h-3.5 ${sort.favoriteSortValue === option.value
                                                ? "fill-yellow-400 text-yellow-400"
                                                : "text-gray-400"
                                                }`}
                                        />
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() => {
                                        sort.onChange(option.value);
                                        setIsSortOpen(false);
                                    }}
                                    className={`flex-1 text-left text-sm transition-colors whitespace-nowrap ${sort.value === option.value
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
                        onClick={() => sort.onDirChange(sort.dir === "asc" ? "desc" : "asc")}
                        // Note: Scryfall specific close-logic removed here for simplicity. 
                        // If critical, handle via onClose prop on SelectDropdown.
                        // But SelectDropdown's onClose handles clicks outside.
                        className="h-10 w-10 flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600 flex-shrink-0"
                        title={sort.dir === "asc" ? "Ascending" : "Descending"}
                    >
                        {sort.dir === "asc" ? (
                            <ArrowUpNarrowWide className="w-5 h-5" />
                        ) : (
                            <ArrowDownWideNarrow className="w-5 h-5" />
                        )}
                    </button>
                </div>
            )}

            {/* 5. View Options (Grouping) */}
            {viewOptions && viewOptions.groupBy !== undefined && (
                <div className="flex items-center">
                    <button
                        onClick={viewOptions.onToggleGroupBy}
                        className={`h-10 w-10 flex items-center justify-center border transition-colors ${viewOptions.groupBy
                            ? "rounded-l-md border-r-0 border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                            : "rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
                            } flex-shrink-0`}
                        title={
                            viewOptions.groupBy
                                ? "Ungroup"
                                : "Group"
                        }
                    >
                        <Rows3 className="w-5 h-5" />
                    </button>
                    {viewOptions.groupBy && (
                        <>
                            {/* Star button to favorite this grouping state */}
                            {viewOptions.onToggleFavoriteGroupBy && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        viewOptions.onToggleFavoriteGroupBy?.();
                                    }}
                                    className="h-10 w-10 flex items-center justify-center border-y border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 flex-shrink-0"
                                    title={
                                        viewOptions.favoriteGroupBy
                                            ? "Remove grouping from favorites"
                                            : "Set grouping as favorite (default)"
                                    }
                                >
                                    <Star
                                        className={`w-4 h-4 ${viewOptions.favoriteGroupBy ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`}
                                    />
                                </button>
                            )}
                            {/* Collapse/Expand All button */}
                            {viewOptions.onToggleCollapse && (
                                <button
                                    onClick={viewOptions.onToggleCollapse}
                                    className="h-10 w-10 flex items-center justify-center rounded-r-md border border-l-0 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 flex-shrink-0"
                                    title={
                                        viewOptions.isCollapsed
                                            ? "Expand All Groups"
                                            : "Collapse All Groups"
                                    }
                                >
                                    {
                                        viewOptions.isCollapsed ? (
                                            <ChevronsDown className="w-5 h-5" />
                                        ) : (
                                            <ChevronsUp className="w-5 h-5" />
                                        )
                                    }
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* 6. Clear Button */}
            {clear && clear.show && (
                <button
                    onClick={clear.onClear}
                    className="h-10 w-10 flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-red-50 dark:hover:bg-red-900/30 hover:border-red-300 dark:hover:border-red-600 hover:text-red-600 dark:hover:text-red-400 flex-shrink-0"
                    title="Clear all filters"
                >
                    <X className="w-5 h-5" strokeWidth={2.5} />
                </button>
            )}

            {/* 7. Results Count */}
            {count && count.total !== undefined && (
                <span className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 ml-auto whitespace-nowrap text-xs flex items-center overflow-hidden flex-shrink-0">
                    {count.filtered !== undefined && count.filtered !== count.total && (
                        <>
                            <span className="h-full flex items-center px-2 text-gray-900 dark:text-white">
                                {count.filtered}
                            </span>
                            <span className="w-px h-full bg-gray-300 dark:bg-gray-500" />
                        </>
                    )}
                    <span className="h-full flex items-center px-2 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-600">
                        {count.total}
                    </span>
                </span>
            )}
        </FilterBarShell>
    );
}
