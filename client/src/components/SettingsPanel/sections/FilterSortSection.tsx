import { useSettingsStore } from "@/store/settings";
import { useUserPreferencesStore } from "@/store/userPreferences";
import { useProjectStore } from "@/store/projectStore";
import { Label, Select, Button } from "flowbite-react";
import { ArrowDown, ArrowUp, X, ChevronDown } from "lucide-react";
import { ManaIcon } from "@/components/common";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import { useMemo, useCallback } from "react";
import type { CardOption } from "@/types";
import { extractAvailableFilters } from "@/helpers/sortAndFilterUtils";

// Collapsible section component with persisted state
interface FilterSectionProps {
    id: string;
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    activeCount?: number;
    onClear?: () => void;
}

function FilterSection({ id, title, children, defaultOpen = true, activeCount = 0, onClear }: FilterSectionProps) {
    const filterSectionCollapsed = useUserPreferencesStore((state) => state.preferences?.filterSectionCollapsed);
    const allCollapsed = useMemo(() => filterSectionCollapsed ?? {}, [filterSectionCollapsed]);
    const collapsed = allCollapsed[id] ?? !defaultOpen;
    const setFilterSectionCollapsed = useUserPreferencesStore((state) => state.setFilterSectionCollapsed);

    const handleToggle = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setFilterSectionCollapsed({ ...allCollapsed, [id]: !collapsed });
    }, [id, collapsed, allCollapsed, setFilterSectionCollapsed]);

    const handleClear = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onClear?.();
    }, [onClear]);

    return (
        <div className="group">
            <div className="flex items-center justify-between w-full py-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                <span className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleToggle}
                        className="cursor-pointer hover:text-gray-900 dark:hover:text-white"
                    >
                        {title}
                    </button>
                    {activeCount > 0 && (
                        <>
                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                                {activeCount}
                            </span>
                            {onClear && (
                                <button
                                    type="button"
                                    onClick={handleClear}
                                    className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer active:translate-y-px"
                                    title="Clear filters"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </>
                    )}
                </span>
                <button
                    type="button"
                    onClick={handleToggle}
                    className="cursor-pointer hover:text-gray-900 dark:hover:text-white"
                >
                    <ChevronDown className={`w-4 h-4 transition-transform ${!collapsed ? 'rotate-180' : ''} `} />
                </button>
            </div>
            {!collapsed && (
                <div className="pt-2 pb-1">
                    {children}
                </div>
            )}
        </div>
    );
}


export function FilterSortSection({ cards }: { cards?: CardOption[] }) {
    const sortBy = useSettingsStore((state) => state.sortBy);
    const setSortBy = useSettingsStore((state) => state.setSortBy);
    const sortOrder = useSettingsStore((state) => state.sortOrder);
    const setSortOrder = useSettingsStore((state) => state.setSortOrder);

    const filterManaCost = useSettingsStore((state) => state.filterManaCost);
    const setFilterManaCost = useSettingsStore((state) => state.setFilterManaCost);
    const filterColors = useSettingsStore((state) => state.filterColors);
    const setFilterColors = useSettingsStore((state) => state.setFilterColors);
    const filterTypes = useSettingsStore((state) => state.filterTypes);
    const setFilterTypes = useSettingsStore((state) => state.setFilterTypes);
    const filterCategories = useSettingsStore((state) => state.filterCategories);
    const setFilterCategories = useSettingsStore((state) => state.setFilterCategories);
    const filterMatchType = useSettingsStore((state) => state.filterMatchType);
    const setFilterMatchType = useSettingsStore((state) => state.setFilterMatchType);
    // Get access to project ID for filtering
    const currentProjectId = useProjectStore((state) => state.currentProjectId);

    // Get all cards to extract available types and categories
    // Use passed cards if available (preferred for sync), otherwise fallback to internal query
    const cardsFromQuery = useLiveQuery(async () => {
        if (cards) return [];
        if (currentProjectId) {
            return await db.cards.where('projectId').equals(currentProjectId).toArray();
        }
        return [];
    }, [cards, currentProjectId]);

    const cardsFromDb = useMemo(() => cards ?? cardsFromQuery ?? [], [cards, cardsFromQuery]);

    // Extract unique card types and categories from loaded cards
    const { types: availableTypes, categories: availableCategories } = useMemo(() => {
        if (!cardsFromDb || cardsFromDb.length === 0) return { types: [], categories: [] };
        return extractAvailableFilters(cardsFromDb);
    }, [cardsFromDb]);

    const toggleManaCost = (cost: number) => {
        if (filterManaCost.includes(cost)) {
            setFilterManaCost(filterManaCost.filter((c) => c !== cost));
        } else {
            setFilterManaCost([...filterManaCost, cost]);
        }
    };

    const toggleColor = (color: string) => {
        if (filterColors.includes(color)) {
            setFilterColors(filterColors.filter((c) => c !== color));
        } else {
            setFilterColors([...filterColors, color]);
        }
    };

    const toggleType = (type: string) => {
        if (filterTypes.includes(type)) {
            setFilterTypes(filterTypes.filter((t) => t !== type));
        } else {
            setFilterTypes([...filterTypes, type]);
        }
    };

    const toggleCategory = (category: string) => {
        if (filterCategories.includes(category)) {
            setFilterCategories(filterCategories.filter((c) => c !== category));
        } else {
            setFilterCategories([...filterCategories, category]);
        }
    };

    const clearFilters = () => {
        setFilterManaCost([]);
        setFilterColors([]);
        setFilterTypes([]);
        setFilterCategories([]);
    };

    const hasActiveFilters = filterManaCost.length > 0 || filterColors.length > 0 || filterTypes.length > 0 || filterCategories.length > 0;

    const manaCosts = [0, 1, 2, 3, 4, 5, 6, 7];
    const colors: { id: "W" | "U" | "B" | "R" | "G" | "C" | "M"; label: string }[] = [
        { id: "W", label: "White" },
        { id: "U", label: "Blue" },
        { id: "B", label: "Black" },
        { id: "R", label: "Red" },
        { id: "G", label: "Green" },
        { id: "C", label: "Colorless" },
        { id: "M", label: "Multicolor" },
    ];

    return (
        <div className="space-y-3">
            {/* Sort Controls */}
            <div className="space-y-2">
                <Label>Sort By</Label>
                <div className="flex gap-2">
                    <Select
                        className="flex-1"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as "manual" | "name" | "type" | "cmc" | "color")}
                    >
                        <option value="manual">Manual</option>
                        <option value="name">Name</option>
                        <option value="type">Type</option>
                        <option value="cmc">Mana Value</option>
                        <option value="color">Color</option>
                        <option value="rarity">Rarity</option>
                    </Select>
                    <Button
                        color="gray"
                        onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                        title={sortOrder === "asc" ? "Ascending" : "Descending"}
                    >
                        {sortOrder === "asc" ? <ArrowDown className="w-5 h-5" /> : <ArrowUp className="w-5 h-5" />}
                    </Button>
                </div>
            </div>

            <hr className="border-gray-200 dark:border-gray-600" />

            {/* Card Types Filter */}
            {availableTypes.length > 0 && (
                <FilterSection id="cardTypes" title="Card Types" activeCount={filterTypes.length} onClear={() => setFilterTypes([])}>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(70px,1fr))] gap-1.5">
                        {availableTypes.map((type) => (
                            <button
                                key={type}
                                onClick={() => toggleType(type)}
                                className={`px-2.5 py-1 text-xs rounded-full transition-colors cursor-pointer select-none border
                                    ${filterTypes.includes(type)
                                        ? "bg-blue-600 text-white border-blue-700"
                                        : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600"
                                    } `}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </FilterSection>
            )}

            {/* Deck Categories Filter (Archidekt only) */}
            {availableCategories.length > 0 && (
                <FilterSection id="deckCategories" title="Deck Categories" activeCount={filterCategories.length} onClear={() => setFilterCategories([])}>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(80px,1fr))] gap-1.5">
                        {availableCategories.map((cat) => (
                            <button
                                key={cat}
                                onClick={() => toggleCategory(cat)}
                                className={`px-2.5 py-1 text-xs rounded-full transition-colors cursor-pointer select-none border
                                    ${filterCategories.includes(cat)
                                        ? "bg-purple-600 text-white border-purple-700"
                                        : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600"
                                    } `}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </FilterSection>
            )}



            {/* Mana Cost Filter */}
            <FilterSection id="manaValue" title="Mana Value" activeCount={filterManaCost.length} onClear={() => setFilterManaCost([])}>
                <div className="flex flex-wrap gap-1 my-1">
                    {manaCosts.map((cost) => (
                        <div
                            key={cost}
                            onClick={() => toggleManaCost(cost)}
                            className={`
w-8 h-8 flex items-center justify-center rounded-full border cursor-pointer select-none transition-colors
                                ${filterManaCost.includes(cost)
                                    ? "bg-blue-600 text-white border-blue-700 font-bold"
                                    : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
                                }
`}
                        >
                            {cost === 7 ? "7+" : cost}
                        </div>
                    ))}
                </div>
            </FilterSection>

            {/* Color Filter */}
            <FilterSection id="colors" title="Colors" activeCount={filterColors.length} onClear={() => setFilterColors([])}>
                <div className="flex flex-wrap gap-2 my-1">
                    {colors.map((c) => (
                        <div
                            key={c.id}
                            onClick={() => toggleColor(c.id)}
                            className={`
rounded-full cursor-pointer select-none transition-all
                                ${filterColors.includes(c.id)
                                    ? "scale-110 opacity-100"
                                    : "opacity-50 hover:opacity-100 hover:scale-105 grayscale hover:grayscale-0"
                                }
`}
                            title={c.label}
                        >
                            <ManaIcon symbol={c.id} size={32} />
                        </div>
                    ))}
                </div>
            </FilterSection>

            {/* Match Type Toggle */}
            <div className="flex items-center justify-between">
                <Label>Match Type</Label>
                <div className="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                    <button
                        onClick={() => setFilterMatchType("partial")}
                        className={`px-3 py-1 text-xs rounded-md transition-colors ${filterMatchType === "partial"
                            ? "bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                            } `}
                    >
                        Partial
                    </button>
                    <button
                        onClick={() => setFilterMatchType("exact")}
                        className={`px-3 py-1 text-xs rounded-md transition-colors ${filterMatchType === "exact"
                            ? "bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                            } `}
                    >
                        Exact
                    </button>
                </div>
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
                <div className="pt-2">
                    <Button
                        size="sm"
                        color="light"
                        className="w-full"
                        onClick={clearFilters}
                    >
                        <X className="w-4 h-4 mr-2" />
                        Clear Filters
                    </Button>
                </div>
            )}
        </div >
    );
}
