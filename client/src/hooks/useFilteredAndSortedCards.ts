import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db } from "../db";
import { useSettingsStore } from "../store/settings";
import type { CardOption } from "../../../shared/types";

export function useFilteredAndSortedCards() {
    const cards = useLiveQuery(() => db.cards.orderBy("order").toArray(), []);

    const sortBy = useSettingsStore((state) => state.sortBy);
    const sortOrder = useSettingsStore((state) => state.sortOrder);
    const filterManaCost = useSettingsStore((state) => state.filterManaCost);
    const filterColors = useSettingsStore((state) => state.filterColors);
    const filterMatchType = useSettingsStore((state) => state.filterMatchType);

    const filteredAndSortedCards = useMemo(() => {
        if (!cards) return [];

        let result = [...cards];

        // Filter
        if (filterManaCost.length > 0) {
            result = result.filter((c) => {
                const cmc = c.cmc ?? 0;
                if (filterManaCost.includes(7) && cmc >= 7) return true;
                return filterManaCost.includes(cmc);
            });
        }
        if (filterColors.length > 0) {
            result = result.filter((c) => {
                const colors = c.colors || [];

                // Handle Colorless special case
                if (filterColors.includes("C")) {
                    if (colors.length === 0) return true;
                }

                if (filterMatchType === "exact") {
                    const wantsMulticolor = filterColors.includes("M");
                    const wantsColorless = filterColors.includes("C");
                    const selectedSpecificColors = filterColors.filter(c => c !== "M" && c !== "C");

                    if (wantsMulticolor && selectedSpecificColors.length === 0 && !wantsColorless) {
                        return colors.length > 1;
                    }
                    if (wantsColorless && selectedSpecificColors.length === 0 && !wantsMulticolor) {
                        return colors.length === 0;
                    }

                    if (selectedSpecificColors.length > 0) {
                        if (colors.length !== selectedSpecificColors.length) return false;
                        return selectedSpecificColors.every(col => colors.includes(col));
                    }

                    return false;
                } else {
                    if (filterColors.includes("M") && colors.length > 1) return true;
                    if (filterColors.includes("C") && colors.length === 0) return true;

                    const specificFilters = filterColors.filter(c => c !== "M" && c !== "C");
                    if (specificFilters.length === 0) return false;

                    return colors.some((col) => specificFilters.includes(col));
                }
            });
        }

        // Sort
        result.sort((a, b) => {
            let comparison = 0;
            switch (sortBy) {
                case "name":
                    comparison = a.name.localeCompare(b.name);
                    break;
                case "type": {
                    const getSortableType = (typeLine: string = "") => {
                        return typeLine
                            .replace("Legendary ", "")
                            .replace("Basic ", "")
                            .replace("Snow ", "")
                            .replace("World ", "")
                            .replace("Tribal ", "")
                            .replace("Kindred ", "");
                    };
                    comparison = getSortableType(a.type_line).localeCompare(
                        getSortableType(b.type_line)
                    );
                    break;
                }
                case "cmc":
                    // Treat undefined/null CMC as 0
                    comparison = (a.cmc ?? 0) - (b.cmc ?? 0);
                    break;
                case "color": {
                    // Sort by Basic Land Name Alphabetically:
                    // Forest (G), Island (U), Mountain (R), Plains (W), Swamp (B)
                    const colorOrder: string[] = ['g', 'u', 'r', 'w', 'b', 'c']; // Canonical WUBRG + Colorless

                    // Helper to get the "primary" color based on Canonical WUBRG order
                    const getPrimaryColor = (colors: string[] | undefined) => {
                        if (colors && colors.length > 0) {
                            const wubrgOrder: Record<string, number> = { w: 1, u: 2, b: 3, r: 4, g: 5 };
                            const sortedColors = [...colors].sort((x, y) => {
                                return (wubrgOrder[x.toLowerCase()] || 99) - (wubrgOrder[y.toLowerCase()] || 99);
                            });
                            return sortedColors[0].toLowerCase();
                        }
                        return 'c'; // Colorless
                    };

                    // Primary Sort: Color (WUBRG order)
                    const primaryColorA = getPrimaryColor(a.colors);
                    const primaryColorB = getPrimaryColor(b.colors);
                    const indexA = colorOrder.indexOf(primaryColorA);
                    const indexB = colorOrder.indexOf(primaryColorB);

                    if (indexA !== indexB) {
                        return sortOrder === "asc" ? indexA - indexB : indexB - indexA;
                    }

                    // Secondary Sort: Lands First (within same color)
                    const isLandA = a.type_line?.toLowerCase().includes("land") || false;
                    const isLandB = b.type_line?.toLowerCase().includes("land") || false;

                    if (isLandA !== isLandB) {
                        // If sorting ASC, we want Lands FIRST (true < false)
                        return sortOrder === "asc"
                            ? (isLandA ? -1 : 1) // Land A comes before Non-Land B
                            : (isLandB ? -1 : 1); // Land B comes before Non-Land A
                    }

                    // Tertiary Sort: Number of colors (fewer colors first)
                    const countA = a.colors?.length || 0;
                    const countB = b.colors?.length || 0;
                    if (countA !== countB) {
                        return sortOrder === "asc" ? countA - countB : countB - countA;
                    }

                    // Quaternary Sort: Canonical WUBRG string (e.g., GW before WG - though Scryfall usually normalizes this)
                    const getWubrgString = (colors: string[] | undefined) => {
                        return [...(colors || [])].sort((x, y) => {
                            const wubrg: Record<string, number> = { w: 1, u: 2, b: 3, r: 4, g: 5 };
                            return (wubrg[x.toLowerCase()] || 99) - (wubrg[y.toLowerCase()] || 99);
                        }).join("");
                    };
                    const strA = getWubrgString(a.colors);
                    const strB = getWubrgString(b.colors);
                    if (strA !== strB) {
                        return sortOrder === "asc"
                            ? strA.localeCompare(strB)
                            : strB.localeCompare(strA);
                    }

                    // Fallback to Name
                    return a.name.localeCompare(b.name);
                }
                case "rarity": {
                    const rarityMap: Record<string, number> = {
                        common: 1,
                        uncommon: 2,
                        rare: 3,
                        mythic: 4,
                        special: 5,
                        bonus: 6,
                    };
                    const getRarityValue = (c: CardOption) => {
                        if (c.rarity) return rarityMap[c.rarity.toLowerCase()] || 0;
                        // Fallback for basic lands if rarity is missing
                        if (
                            c.type_line?.toLowerCase().includes("basic land") ||
                            ["plains", "island", "swamp", "mountain", "forest"].includes(
                                c.name.toLowerCase()
                            )
                        ) {
                            return 1; // Common
                        }
                        return 0;
                    };
                    const rA = getRarityValue(a);
                    const rB = getRarityValue(b);
                    comparison = rA - rB;
                    break;
                }
                case "manual":
                default:
                    comparison = a.order - b.order;
                    break;
            }
            return sortOrder === "asc" ? comparison : -comparison;
        });

        return result;
    }, [cards, sortBy, sortOrder, filterManaCost, filterColors, filterMatchType]);

    return {
        cards,
        filteredAndSortedCards
    };
}
