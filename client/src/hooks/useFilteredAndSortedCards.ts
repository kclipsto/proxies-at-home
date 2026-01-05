import { useMemo } from "react";
import { extractCardInfo } from "../helpers/cardInfoHelper";
import { useSettingsStore } from "../store/settings";
import type { CardOption } from "../../../shared/types";
import { isCardbackId } from "../helpers/cardbackLibrary";
import { useSelectionStore } from "../store/selection";

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

export const getCardTypes = (typeLine: string | undefined): string[] => {
    if (!typeLine) return [];
    const types: string[] = [];
    for (const type of PRIMARY_TYPES) {
        if (typeLine.includes(type)) types.push(type);
    }
    return types;
};

// --- Check Filter Helper ---
// Checks if a card face matches the current filters (except Features/Mana/Categories which are card-level usually)
// We treat mana cost as card level for now (sum of faces? usually front face).
// But for type/color, we check the specific face.
// --- Check Filter Helper ---
const matchesFilters = (
    c: CardOption,
    filterColors: string[],
    filterTypes: string[],
    filterMatchType: "partial" | "exact",
    otherFace?: CardOption
): boolean => {
    // 1. Color Filter
    if (filterColors.length > 0) {
        const colors = c.colors || [];
        const otherColors = otherFace?.colors || [];
        // Combine colors if checking union
        const combinedColors = otherFace ? Array.from(new Set([...colors, ...otherColors])) : colors;

        const wantsMulticolor = filterColors.includes("M");
        const wantsColorless = filterColors.includes("C");
        const selectedSpecificColors = filterColors.filter(col => col !== "M" && col !== "C");

        if (filterMatchType === "exact") {
            if (wantsMulticolor && selectedSpecificColors.length === 0 && !wantsColorless) {
                if (combinedColors.length <= 1) return false;
            } else if (wantsColorless && selectedSpecificColors.length === 0 && !wantsMulticolor) {
                if (combinedColors.length !== 0) return false;
            } else if (selectedSpecificColors.length > 0) {
                if (combinedColors.length !== selectedSpecificColors.length) return false;
                if (!selectedSpecificColors.every(col => combinedColors.includes(col))) return false;
            } else {
                return false;
            }
        } else {
            // Partial
            let matches = false;
            if (wantsMulticolor && combinedColors.length > 1) matches = true;
            else if (wantsColorless && combinedColors.length === 0) matches = true;
            else if (selectedSpecificColors.length > 0) {
                if (combinedColors.some((col) => selectedSpecificColors.includes(col))) matches = true;
            }
            if (!matches) return false;
        }
    }

    // 2. Type Filter (exclude pseudo-types like "Dual Faced")
    const actualTypes = filterTypes.filter(t => t !== "Dual Faced");
    if (actualTypes.length > 0) {
        const myTypes = getCardTypes(c.type_line);
        const otherTypes = otherFace ? getCardTypes(otherFace.type_line) : [];
        const combinedTypes = Array.from(new Set([...myTypes, ...otherTypes]));

        if (filterMatchType === "exact") {
            // Must match ALL selected types
            if (!actualTypes.every(t => combinedTypes.includes(t))) return false;
        } else {
            // Must match ANY selected type
            if (!actualTypes.some(t => combinedTypes.includes(t))) return false;
        }
    }

    return true;
};

export function useFilteredAndSortedCards(cards: CardOption[] = []) {
    const sortBy = useSettingsStore((state) => state.sortBy);
    const sortOrder = useSettingsStore((state) => state.sortOrder);
    const filterManaCost = useSettingsStore((state) => state.filterManaCost);
    const filterColors = useSettingsStore((state) => state.filterColors);
    const filterTypes = useSettingsStore((state) => state.filterTypes);
    const filterCategories = useSettingsStore((state) => state.filterCategories);
    const filterMatchType = useSettingsStore((state) => state.filterMatchType);
    const flippedCardsSet = useSelectionStore((state) => state.flippedCards);


    // Step 1: Filter cards (separate memo for better granularity)
    const { result: filteredCards, idsToFlip } = useMemo(() => {
        // Create a lookup map for DFC linking
        const needsAutoFlip = filterColors.length > 0 || filterTypes.length > 0;
        const cardMap = needsAutoFlip ? new Map<string, CardOption>() : null;
        if (cardMap) {
            for (const c of cards) {
                cardMap.set(c.uuid, c);
            }
        }

        const result: CardOption[] = [];
        const idsToFlip: { uuid: string, targetState: boolean }[] = [];
        // Track unique UUIDs we've effectively displayed to avoid duplicates
        const processedUuids = new Set<string>();

        for (const c of cards) {
            // Skip cards that are linked back faces of another card (prevent duplicates)
            if (c.linkedFrontId && cardMap && cardMap.has(c.linkedFrontId)) {
                continue;
            }
            // If this card entity was already displayed
            if (processedUuids.has(c.uuid)) continue;

            // 1. Filter by deck categories (Archidekt) - Card Level
            if (filterCategories.length > 0) {
                if (!c.category || !filterCategories.includes(c.category)) continue;
            }


            // 2. Filter by Dual Faced pseudo-type - Card Level
            // In Exact mode OR when "Dual Faced" is the only type: strictly enforce DFC requirement
            // In Partial mode with other types: DFC is optional (just one of many acceptable types)
            const otherTypes = filterTypes.filter(t => t !== "Dual Faced");
            const dfcIsStrictRequirement = filterTypes.includes("Dual Faced") &&
                (filterMatchType === "exact" || otherTypes.length === 0);

            if (dfcIsStrictRequirement) {
                if (!c.linkedFrontId && !c.linkedBackId) continue;
                if (c.linkedBackId && cardMap) {
                    const back = cardMap.get(c.linkedBackId);
                    if (back && back.imageId && isCardbackId(back.imageId)) continue;
                }
            }


            // 3. Filter by mana cost - Card Level
            if (filterManaCost.length > 0) {
                const cmc = c.cmc ?? 0;
                const match = filterManaCost.includes(7) && cmc >= 7 ? true : filterManaCost.includes(cmc);
                if (!match) continue;
            }

            // --- DFC Logic: Resolve Visible vs Hidden Face ---
            let visibleFace = c;
            let hiddenFace: CardOption | undefined = undefined;

            // Use STORE state for flipped status, fallback to card prop
            const isFlipped = flippedCardsSet.has(c.uuid);

            if (isFlipped && c.linkedBackId && cardMap && cardMap.has(c.linkedBackId)) {
                // Showing Back
                visibleFace = cardMap.get(c.linkedBackId)!;
                hiddenFace = c;
            } else if (!isFlipped && c.linkedBackId && cardMap && cardMap.has(c.linkedBackId)) {
                // Showing Front (and has Back)
                visibleFace = c;
                hiddenFace = cardMap.get(c.linkedBackId);
            } else if (c.linkedFrontId && cardMap && cardMap.has(c.linkedFrontId)) {
                // Should be skipped by continue above, but for safety:
                // behaving as Front logic for now
                visibleFace = c;
                hiddenFace = cardMap.get(c.linkedFrontId);
            }

            // 1. Check Visible Face (Alone)
            if (matchesFilters(visibleFace, filterColors, filterTypes, filterMatchType)) {
                result.push(c);
                processedUuids.add(c.uuid);
                continue;
            }

            // 2. Check Hidden Face (Alone) -> Suggest Auto-Flip AND Keep Visible
            if (hiddenFace && matchesFilters(hiddenFace, filterColors, filterTypes, filterMatchType)) {
                // Add to flip list so it auto-flips to the matching face when filters change
                idsToFlip.push({ uuid: c.uuid, targetState: !isFlipped });
                // Also add to result so the card stays visible (user can manually flip back)
                result.push(c);
                processedUuids.add(c.uuid);
                continue;
            }

            // 3. Check Union of Faces (Fallback for DFCs in Exact Mode) -> Show Current Face
            // If we are here, neither face matched individually. But maybe the COMBINATION does?
            // Pass hiddenFace as 'otherFace' to matchesFilters
            if (hiddenFace && matchesFilters(visibleFace, filterColors, filterTypes, filterMatchType, hiddenFace)) {
                result.push(c);
                processedUuids.add(c.uuid);
                continue;
            }
        }

        return { result, idsToFlip };
    }, [cards, filterManaCost, filterColors, filterTypes, filterCategories, filterMatchType, flippedCardsSet]);

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
        filteredAndSortedCards,
        idsToFlip
    };
}
