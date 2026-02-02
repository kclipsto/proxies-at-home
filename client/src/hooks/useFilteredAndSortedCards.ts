import { useMemo } from "react";
import { useSettingsStore } from "../store/settings";
import type { CardOption } from "../../../shared/types";
import { isCardbackId } from "../helpers/cardbackLibrary";
import { useSelectionStore } from "../store/selection";
import { useShallow } from "zustand/shallow";
import { sortCards, matchesFilters, getCardTypes, type FilterCriteria } from "../helpers/sortAndFilterUtils";

/**
 * Hook to filter and sort cards based on global settings.
 * Uses sortAndFilterUtils for the heavy lifting.
 */
export function useFilteredAndSortedCards(cards: CardOption[] = []) {
    // Use single combined selector with shallow comparison to reduce re-renders
    const { sortBy, sortOrder, filterManaCost, filterColors, filterTypes, filterCategories, filterMatchType } =
        useSettingsStore(
            useShallow((state) => ({
                sortBy: state.sortBy,
                sortOrder: state.sortOrder,
                filterManaCost: state.filterManaCost,
                filterColors: state.filterColors,
                filterTypes: state.filterTypes,
                filterCategories: state.filterCategories,
                filterMatchType: state.filterMatchType,
            }))
        );
    const flippedCardsSet = useSelectionStore((state) => state.flippedCards);

    // Memoize card lookup map separately
    const cardMap = useMemo(() => {
        const map = new Map<string, CardOption>();
        for (const c of cards) {
            map.set(c.uuid, c);
        }
        return map;
    }, [cards]);

    // Step 1: Filter cards
    const { result: filteredCards, idsToFlip } = useMemo(() => {
        const result: CardOption[] = [];
        const idsToFlip: { uuid: string, targetState: boolean }[] = [];
        const processedUuids = new Set<string>();

        const criteria: FilterCriteria = {
            manaCost: filterManaCost,
            colors: filterColors,
            types: filterTypes,
            categories: filterCategories,
            matchType: filterMatchType
        };

        for (const c of cards) {
            // Skip linked back faces to avoid duplicates
            if (c.linkedFrontId && cardMap.has(c.linkedFrontId)) {
                continue;
            }
            if (processedUuids.has(c.uuid)) continue;

            // 1. Filter by deck categories
            if (criteria.categories.length > 0) {
                if (!c.category || !criteria.categories.includes(c.category)) continue;
            }

            // 2. Filter by Dual Faced pseudo-type
            const otherTypes = criteria.types.filter(t => t !== "Dual Faced");
            const dfcIsStrictRequirement = criteria.types.includes("Dual Faced") &&
                (criteria.matchType === "exact" || otherTypes.length === 0);

            if (dfcIsStrictRequirement) {
                if (!c.linkedFrontId && !c.linkedBackId) continue;
                if (c.linkedBackId) {
                    const back = cardMap.get(c.linkedBackId);
                    if (back && back.imageId && isCardbackId(back.imageId)) continue;
                }
            }

            // 3. Filter by mana cost
            if (criteria.manaCost.length > 0) {
                const cmc = c.cmc ?? 0;
                const match = criteria.manaCost.includes(7) && cmc >= 7 ? true : criteria.manaCost.includes(cmc);
                if (!match) continue;
            }

            // --- DFC Logic: Resolve Visible vs Hidden Face ---
            let visibleFace = c;
            let hiddenFace: CardOption | undefined = undefined;

            const isFlipped = flippedCardsSet.has(c.uuid);

            if (isFlipped && c.linkedBackId && cardMap.has(c.linkedBackId)) {
                visibleFace = cardMap.get(c.linkedBackId)!;
                hiddenFace = c;
            } else if (!isFlipped && c.linkedBackId && cardMap.has(c.linkedBackId)) {
                visibleFace = c;
                hiddenFace = cardMap.get(c.linkedBackId);
            } else if (c.linkedFrontId && cardMap.has(c.linkedFrontId)) {
                visibleFace = c;
                hiddenFace = cardMap.get(c.linkedFrontId);
            }

            // 1. Check Visible Face
            if (matchesFilters(visibleFace, criteria)) {
                result.push(c);
                processedUuids.add(c.uuid);
                continue;
            }

            // 2. Check Hidden Face
            if (hiddenFace && matchesFilters(hiddenFace, criteria)) {
                idsToFlip.push({ uuid: c.uuid, targetState: !isFlipped });
                result.push(c);
                processedUuids.add(c.uuid);
                continue;
            }

            // 3. Check Union
            if (hiddenFace && matchesFilters(visibleFace, criteria, hiddenFace)) {
                result.push(c);
                processedUuids.add(c.uuid);
                continue;
            }
        }

        return { result, idsToFlip };
    }, [cards, cardMap, filterManaCost, filterColors, filterTypes, filterCategories, filterMatchType, flippedCardsSet]);

    // Step 2: Sort filtered cards
    const filteredAndSortedCards = useMemo(() => {
        if (filteredCards.length === 0) return filteredCards;
        return sortCards(filteredCards, { by: sortBy, order: sortOrder });
    }, [filteredCards, sortBy, sortOrder]);

    return {
        cards,
        filteredAndSortedCards,
        idsToFlip,
        // Export helper for UI
        getCardTypes
    };
}

