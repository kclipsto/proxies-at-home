import { useMemo } from "react";
import { extractCardInfo } from "../helpers/CardInfoHelper";
import { useSettingsStore } from "../store/settings";
import type { CardOption } from "../../../shared/types";

// Constants moved outside for reusability
const COLOR_ORDER: string[] = ['g', 'u', 'r', 'w', 'b', 'c'];
const WUBRG_ORDER: Record<string, number> = { w: 1, u: 2, b: 3, r: 4, g: 5 };
const RARITY_MAP: Record<string, number> = {
    common: 1,
    uncommon: 2,
    rare: 3,
    mythic: 4,
    special: 5,
    bonus: 6,
};
const BASIC_LANDS = ["plains", "island", "swamp", "mountain", "forest"];

// Helper functions moved outside to avoid recreation on every render
const getSortableType = (typeLine: string = "") => {
    return typeLine
        .replace("Legendary ", "")
        .replace("Basic ", "")
        .replace("Snow ", "")
        .replace("World ", "")
        .replace("Tribal ", "")
        .replace("Kindred ", "");
};

const getPrimaryColor = (colors: string[] | undefined) => {
    if (colors && colors.length > 0) {
        const sortedColors = [...colors].sort((x, y) => {
            return (WUBRG_ORDER[x.toLowerCase()] || 99) - (WUBRG_ORDER[y.toLowerCase()] || 99);
        });
        return sortedColors[0].toLowerCase();
    }
    return 'c'; // Colorless
};

const getWubrgString = (colors: string[] | undefined) => {
    return [...(colors || [])].sort((x, y) => {
        return (WUBRG_ORDER[x.toLowerCase()] || 99) - (WUBRG_ORDER[y.toLowerCase()] || 99);
    }).join("");
};

const getRarityValue = (c: CardOption) => {
    if (c.rarity) return RARITY_MAP[c.rarity.toLowerCase()] || 0;
    // Fallback for basic lands if rarity is missing
    if (
        c.type_line?.toLowerCase().includes("basic land") ||
        BASIC_LANDS.includes(c.name.toLowerCase())
    ) {
        return 1; // Common
    }
    return 0;
};

// Extract primary type from type_line (e.g., "Legendary Creature - Human Wizard" -> "Creature")
const PRIMARY_TYPES = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Land", "Battle"];

export const getPrimaryType = (typeLine: string | undefined): string | undefined => {
    if (!typeLine) return undefined;
    for (const type of PRIMARY_TYPES) {
        if (typeLine.includes(type)) return type;
    }
    return undefined;
};

export function useFilteredAndSortedCards(cards: CardOption[] = []) {
    const sortBy = useSettingsStore((state) => state.sortBy);
    const sortOrder = useSettingsStore((state) => state.sortOrder);
    const filterManaCost = useSettingsStore((state) => state.filterManaCost);
    const filterColors = useSettingsStore((state) => state.filterColors);
    const filterTypes = useSettingsStore((state) => state.filterTypes);
    const filterCategories = useSettingsStore((state) => state.filterCategories);
    const filterMatchType = useSettingsStore((state) => state.filterMatchType);

    // Step 1: Filter cards (separate memo for better granularity)
    const filteredCards = useMemo(() => {

        let result = cards;

        // Filter by mana cost
        if (filterManaCost.length > 0) {
            result = result.filter((c) => {
                const cmc = c.cmc ?? 0;
                if (filterManaCost.includes(7) && cmc >= 7) return true;
                return filterManaCost.includes(cmc);
            });
        }

        // Filter by colors
        if (filterColors.length > 0) {
            result = result.filter((c) => {
                const colors = c.colors || [];

                // Handle Colorless special case
                if (filterColors.includes("C") && colors.length === 0) return true;

                if (filterMatchType === "exact") {
                    const wantsMulticolor = filterColors.includes("M");
                    const wantsColorless = filterColors.includes("C");
                    const selectedSpecificColors = filterColors.filter(col => col !== "M" && col !== "C");

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

        // Filter by card types
        if (filterTypes.length > 0) {
            result = result.filter((c) => {
                const primaryType = getPrimaryType(c.type_line);
                return primaryType && filterTypes.includes(primaryType);
            });
        }

        // Filter by deck categories (Archidekt)
        if (filterCategories.length > 0) {
            result = result.filter((c) => {
                return c.category && filterCategories.includes(c.category);
            });
        }

        return result;
    }, [cards, filterManaCost, filterColors, filterTypes, filterCategories, filterMatchType]);

    // Step 2: Sort filtered cards (separate memo - only reruns when sort settings or filtered cards change)
    const filteredAndSortedCards = useMemo(() => {
        if (filteredCards.length === 0) return filteredCards;



        // If manual sort, just return filtered cards (preserves array order from drag)
        // But respect the sortOrder (asc/desc)
        if (sortBy === "manual") {
            return sortOrder === "desc" ? [...filteredCards].reverse() : filteredCards;
        }
        // Create a copy for sorting
        const result = [...filteredCards];

        result.sort((a, b) => {
            let comparison = 0;
            switch (sortBy) {
                case "name":
                    comparison = extractCardInfo(a.name).name.localeCompare(extractCardInfo(b.name).name);
                    break;
                case "type":
                    comparison = getSortableType(a.type_line).localeCompare(
                        getSortableType(b.type_line)
                    );
                    break;
                case "cmc":
                    // Treat undefined/null CMC as 0
                    comparison = (a.cmc ?? 0) - (b.cmc ?? 0);
                    break;
                case "color": {
                    // Primary Sort: Color (WUBRG order)
                    const primaryColorA = getPrimaryColor(a.colors);
                    const primaryColorB = getPrimaryColor(b.colors);
                    const indexA = COLOR_ORDER.indexOf(primaryColorA);
                    const indexB = COLOR_ORDER.indexOf(primaryColorB);

                    if (indexA !== indexB) {
                        return sortOrder === "asc" ? indexA - indexB : indexB - indexA;
                    }

                    // Secondary Sort: Lands First (within same color)
                    const isLandA = a.type_line?.toLowerCase().includes("land") || false;
                    const isLandB = b.type_line?.toLowerCase().includes("land") || false;

                    if (isLandA !== isLandB) {
                        return sortOrder === "asc"
                            ? (isLandA ? -1 : 1)
                            : (isLandB ? -1 : 1);
                    }

                    // Tertiary Sort: Number of colors (fewer colors first)
                    const countA = a.colors?.length || 0;
                    const countB = b.colors?.length || 0;
                    if (countA !== countB) {
                        return sortOrder === "asc" ? countA - countB : countB - countA;
                    }

                    // Quaternary Sort: Canonical WUBRG string
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
                    const rA = getRarityValue(a);
                    const rB = getRarityValue(b);
                    comparison = rA - rB;
                    break;
                }
                default:
                    comparison = a.order - b.order;
                    break;
            }
            return sortOrder === "asc" ? comparison : -comparison;
        });

        return result;
    }, [filteredCards, sortBy, sortOrder]);

    return {
        cards,
        filteredAndSortedCards
    };
}
