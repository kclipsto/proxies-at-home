import { useSettingsStore } from "@/store/settings";
import { Label, Select, Button } from "flowbite-react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { ManaIcon } from "@/components/ManaIcon";

export function FilterSortSection() {
    const sortBy = useSettingsStore((state) => state.sortBy);
    const setSortBy = useSettingsStore((state) => state.setSortBy);
    const sortOrder = useSettingsStore((state) => state.sortOrder);
    const setSortOrder = useSettingsStore((state) => state.setSortOrder);

    const filterManaCost = useSettingsStore((state) => state.filterManaCost);
    const setFilterManaCost = useSettingsStore((state) => state.setFilterManaCost);
    const filterColors = useSettingsStore((state) => state.filterColors);
    const setFilterColors = useSettingsStore((state) => state.setFilterColors);
    const filterMatchType = useSettingsStore((state) => state.filterMatchType);
    const setFilterMatchType = useSettingsStore((state) => state.setFilterMatchType);

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

    const clearFilters = () => {
        setFilterManaCost([]);
        setFilterColors([]);
    };

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
        <div className="space-y-4">
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

            {/* Mana Cost Filter */}
            <div className="space-y-2">
                <Label>Mana Value</Label>
                <div className="flex flex-wrap gap-1 my-1">
                    {manaCosts.map((cost) => (
                        <div
                            key={cost}
                            onClick={() => toggleManaCost(cost)}
                            className={`
                                w-8 h-8 flex items-center justify-center rounded-full border cursor-pointer select-none transition-colors
                                ${filterManaCost.includes(cost)
                                    ? "bg-blue-600 text-white border-blue-700 font-bold"
                                    : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"}
                            `}
                        >
                            {cost === 7 ? "7+" : cost}
                        </div>
                    ))}
                </div>
            </div>

            {/* Color Filter */}
            <div className="space-y-2">
                <Label>Colors</Label>
                <div className="flex flex-wrap gap-2 my-1">
                    {colors.map((c) => (
                        <div
                            key={c.id}
                            onClick={() => toggleColor(c.id)}
                            className={`
                                rounded-full cursor-pointer select-none transition-all
                                ${filterColors.includes(c.id)
                                    ? "scale-110 opacity-100"
                                    : "opacity-50 hover:opacity-100 hover:scale-105 grayscale hover:grayscale-0"}
                            `}
                            title={c.label}
                        >
                            <ManaIcon symbol={c.id} size={32} />
                        </div>
                    ))}
                </div>
            </div>

            {/* Match Type Toggle */}
            <div className="flex items-center justify-between">
                <Label>Match Type</Label>
                <div className="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                    <button
                        onClick={() => setFilterMatchType("partial")}
                        className={`px-3 py-1 text-xs rounded-md transition-colors ${filterMatchType === "partial"
                            ? "bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                            }`}
                    >
                        Partial
                    </button>
                    <button
                        onClick={() => setFilterMatchType("exact")}
                        className={`px-3 py-1 text-xs rounded-md transition-colors ${filterMatchType === "exact"
                            ? "bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                            }`}
                    >
                        Exact
                    </button>
                </div>
            </div>

            {/* Clear Filters */}
            {
                (filterManaCost.length > 0 || filterColors.length > 0) && (
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
                )
            }
        </div >
    );
}
