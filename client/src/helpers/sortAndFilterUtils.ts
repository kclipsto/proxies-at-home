
import type { CardOption } from "../../../shared/types";
import { extractCardInfo } from "./cardInfoHelper";

export type FilterMatchType = "partial" | "exact";
export type SortBy = "manual" | "name" | "type" | "cmc" | "color" | "rarity";
export type SortOrder = "asc" | "desc";

export interface FilterCriteria {
    manaCost: number[];
    colors: string[];
    types: string[];
    categories: string[];
    matchType: FilterMatchType;
}

export interface SortCriteria {
    by: SortBy;
    order: SortOrder;
}

// Constants
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
const PRIMARY_TYPES = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Land", "Battle", "Token", "Dual Faced"];

/**
 * Sorts cards based on the Shared Slot Key logic (Default/Manual Sort):
 * 1. Primary: 'order' (ascending)
 * 2. Secondary: Front cards come before their linked Back cards.
 */
export function sortManual(cards: CardOption[]): CardOption[] {
    return [...cards].sort((a, b) => {
        // Primary Sort: Order
        const diff = a.order - b.order;
        if (Math.abs(diff) > 0.0001) {
            return diff;
        }

        // Secondary Sort: Front before Back
        const aIsBack = !!a.linkedFrontId;
        const bIsBack = !!b.linkedFrontId;
        return Number(aIsBack) - Number(bIsBack);
    });
}

/**
 * Main sort function supporting various modes
 */
export function sortCards(cards: CardOption[], criteria: SortCriteria): CardOption[] {
    if (cards.length === 0) return cards;

    // Manual sort is special: it respects drag-order from DB
    // But if desc is requested, we reverse the whole list
    if (criteria.by === "manual") {
        const result = sortManual(cards);
        return criteria.order === "desc" ? result.reverse() : result;
    }

    const result = [...cards].sort((a, b) => {
        let comparison = 0;
        switch (criteria.by) {
            case "name":
                comparison = extractCardInfo(a.name).name.localeCompare(extractCardInfo(b.name).name);
                break;
            case "type":
                comparison = getSortableType(a.type_line).localeCompare(
                    getSortableType(b.type_line)
                );
                break;
            case "cmc":
                comparison = (a.cmc ?? 0) - (b.cmc ?? 0);
                break;
            case "color":
                comparison = compareColors(a, b);
                break;
            case "rarity":
                comparison = getRarityValue(a) - getRarityValue(b);
                break;
            default:
                comparison = a.order - b.order;
        }
        return criteria.order === "asc" ? comparison : -comparison;
    });

    return result;
}

/**
 * Extract available filters (Types, Categories) from a card list
 */
export function extractAvailableFilters(cards: CardOption[]) {
    const types = new Set<string>();
    const categories = new Set<string>();
    let hasDfc = false;
    let hasToken = false;

    for (const card of cards) {
        // Types
        if (card.isToken === true) {
            hasToken = true;
        } else {
            const cardTypes = getCardTypes(card.type_line);
            for (const t of cardTypes) types.add(t);
        }
        if (card.linkedFrontId || card.linkedBackId) hasDfc = true;

        // Categories
        if (card.category) categories.add(card.category);
    }

    // Sort Types
    const typeOrder = PRIMARY_TYPES;
    const sortedTypes = Array.from(types).sort((a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b));
    if (hasToken) sortedTypes.unshift("Token");
    if (hasDfc) sortedTypes.push("Dual Faced");

    // Sort Categories
    const sortedCategories = Array.from(categories).sort((a, b) => {
        if (a === "Commander") return -1;
        if (b === "Commander") return 1;
        if (a === "Mainboard") return -1;
        if (b === "Mainboard") return 1;
        return a.localeCompare(b);
    });

    return {
        types: sortedTypes,
        categories: sortedCategories
    };
}

// --- Helpers ---

function getSortableType(typeLine: string = "") {
    return typeLine
        .replace("Legendary ", "")
        .replace("Basic ", "")
        .replace("Snow ", "")
        .replace("World ", "")
        .replace("Tribal ", "")
        .replace("Kindred ", "");
}

function getPrimaryColor(colors: string[] | undefined) {
    if (colors && colors.length > 0) {
        const sortedColors = [...colors].sort((x, y) => {
            return (WUBRG_ORDER[x.toLowerCase()] || 99) - (WUBRG_ORDER[y.toLowerCase()] || 99);
        });
        return sortedColors[0].toLowerCase();
    }
    return 'c';
}

function getWubrgString(colors: string[] | undefined) {
    return [...(colors || [])].sort((x, y) => {
        return (WUBRG_ORDER[x.toLowerCase()] || 99) - (WUBRG_ORDER[y.toLowerCase()] || 99);
    }).join("");
}

function getRarityValue(c: CardOption) {
    if (c.rarity) return RARITY_MAP[c.rarity.toLowerCase()] || 0;
    if (c.type_line?.toLowerCase().includes("basic land") || BASIC_LANDS.includes(c.name.toLowerCase())) {
        return 1;
    }
    return 0;
}

export function getCardTypes(typeLine: string | undefined): string[] {
    if (!typeLine) return [];
    const types: string[] = [];
    // Filter out Token/DualFaced as they are handled specially, just check the standard list
    const coreTypes = PRIMARY_TYPES.filter(t => t !== "Token" && t !== "Dual Faced");
    for (const type of coreTypes) {
        if (typeLine.includes(type)) types.push(type);
    }
    return types;
}

function compareColors(a: CardOption, b: CardOption): number {
    // Primary Sort: Color (WUBRG order)
    const primaryColorA = getPrimaryColor(a.colors);
    const primaryColorB = getPrimaryColor(b.colors);
    const indexA = COLOR_ORDER.indexOf(primaryColorA);
    const indexB = COLOR_ORDER.indexOf(primaryColorB);

    if (indexA !== indexB) {
        return indexA - indexB;
    }

    // Secondary Sort: Lands First
    const isLandA = a.type_line?.toLowerCase().includes("land") || false;
    const isLandB = b.type_line?.toLowerCase().includes("land") || false;
    if (isLandA !== isLandB) {
        // We want lands first regardless of global sort order effectively? 
        // The original logic was: return sortOrder === "asc" ? (isLandA ? -1 : 1) : (isLandB ? -1 : 1)
        // Simplifies to: if we return standard specific value, the outer flipper handles it.
        // Let's stick to standard comparator logic: Land < Non-Land
        return (isLandA ? -1 : 1) - (isLandB ? -1 : 1);
        // -1 vs 1 => -2 (Land first)
    }

    // Tertiary Sort: Number of colors
    const countA = a.colors?.length || 0;
    const countB = b.colors?.length || 0;
    if (countA !== countB) {
        return countA - countB;
    }

    // Quaternary Sort: Canonical WUBRG string
    const strA = getWubrgString(a.colors);
    const strB = getWubrgString(b.colors);
    if (strA !== strB) {
        return strA.localeCompare(strB);
    }

    // Fallback to Name
    return a.name.localeCompare(b.name);
}

export function matchesFilters(
    c: CardOption,
    criteria: FilterCriteria,
    otherFace?: CardOption
): boolean {
    // 1. Color Filter
    if (criteria.colors.length > 0) {
        const colors = c.colors || [];
        const otherColors = otherFace?.colors || [];
        const combinedColors = otherFace ? Array.from(new Set([...colors, ...otherColors])) : colors;

        const wantsMulticolor = criteria.colors.includes("M");
        const wantsColorless = criteria.colors.includes("C");
        const selectedSpecificColors = criteria.colors.filter(col => col !== "M" && col !== "C");

        if (criteria.matchType === "exact") {
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

    // 2. Type Filter
    const tokenFilter = criteria.types.includes("Token");
    const actualTypes = criteria.types.filter(t => t !== "Dual Faced" && t !== "Token");

    if (tokenFilter) {
        const isToken = c.isToken || otherFace?.isToken;
        if (criteria.matchType === "exact") {
            if (!isToken) return false;
        } else {
            if (isToken) { /* matched */ }
            else if (actualTypes.length === 0) return false;
        }
    }

    if (actualTypes.length > 0) {
        const myTypes = getCardTypes(c.type_line);
        const otherTypes = otherFace ? getCardTypes(otherFace.type_line) : [];
        const combinedTypes = Array.from(new Set([...myTypes, ...otherTypes]));

        if (criteria.matchType === "exact") {
            if (!actualTypes.every(t => combinedTypes.includes(t))) return false;
        } else {
            if (!tokenFilter || !c.isToken) {
                if (!actualTypes.some(t => combinedTypes.includes(t))) return false;
            }
        }
    }

    return true;
}
