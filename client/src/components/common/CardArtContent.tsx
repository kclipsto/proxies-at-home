import logoSvg from "@/assets/logo.svg";
import { Button } from "flowbite-react";
import { CardGrid } from "./CardGrid";
import { CardArtFilterBar } from "./CardArtFilterBar";
import { CardImageSvg } from "./CardImageSvg";
import { useScryfallSearch } from "@/hooks/useScryfallSearch";
import { useScryfallPrints } from "@/hooks/useScryfallPrints";
import { useMpcSearch } from "@/hooks/useMpcSearch";
import { filterPrintsByFace, getFaceNamesFromPrints, type PrintInfo } from "@/helpers/dfcHelpers";

import { type MpcAutofillCard, getMpcAutofillImageUrl, extractMpcIdentifierFromImageId } from "@/helpers/mpcAutofillApi";
import { inferImageSource } from "@/helpers/imageSourceUtils";
import type { ScryfallCard } from "../../../../shared/types";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";

type ArtSource = 'scryfall' | 'mpc';

export interface CardArtContentProps {
    /** Art source to search */
    artSource: ArtSource;
    /** Search query */
    query: string;
    /** Card size/zoom multiplier */
    cardSize?: number;
    /** Callback when a card is selected */
    onSelectCard: (cardName: string, imageUrl?: string, specificPrint?: { set: string; number: string }) => void;
    /** Optional callback to switch to the other art source */
    onSwitchSource?: () => void;

    /** Mode: 'search' for card search, 'prints' for all prints of one card */
    mode?: 'search' | 'prints';

    // Scryfall-specific props
    /** Single selected art ID (URL for Scryfall, proxied URL for MPC) */
    selectedArtId?: string;
    /** Processed display URL for the selected card (Scryfall) */
    processedDisplayUrl?: string | null;
    /** Selected face for DFC filtering (prints mode only) */
    selectedFace?: 'front' | 'back';
    /** Whether to auto-search on query change (MPC) */
    autoSearch?: boolean;
    /** Whether MPC filter bar is collapsed */
    filtersCollapsed?: boolean;
    /** Callback when filter count changes */
    onFilterCountChange?: (count: number) => void;
    /** Callback for MPC card selection with full card data */
    onSelectMpcCard?: (card: MpcAutofillCard) => void;

    /** Container class styling override */
    containerClassStyle?: string;
    /** Whether this source is currently active/visible (for sort-on-toggle) */
    isActive?: boolean;
}

/**
 * Unified card art content component for both Scryfall and MPC sources.
 * Handles search logic internally via hooks and provides identical layout structure.
 */
export function CardArtContent({
    artSource,
    query,
    cardSize = 1.0,
    onSelectCard,
    onSwitchSource,
    mode = 'search',
    selectedArtId,
    processedDisplayUrl,
    selectedFace,
    autoSearch = true,
    filtersCollapsed = false,
    onFilterCountChange,
    onSelectMpcCard,
    containerClassStyle,
    isActive,
}: CardArtContentProps) {
    // Helper to strip query params for URL comparison (Scryfall URLs have timestamps)
    const stripQuery = useCallback((url?: string) => url?.split('?')[0], []);



    const scryfallSearchData = useScryfallSearch(query, {
        autoSearch: artSource === 'scryfall' && mode === 'search'
    });
    const scryfallPrintsData = useScryfallPrints(query, {
        autoFetch: artSource === 'scryfall' && mode === 'prints'
    });

    // Helper to detect if the selected art is MPC (for sorting/highlighting in the right source)
    // Uses inferImageSource for unified detection, extractMpcIdentifierFromImageId for ID extraction
    const selectedMpcId = useMemo(() => {
        if (!selectedArtId) return undefined;
        const source = inferImageSource(selectedArtId);
        if (source !== 'mpc') return undefined;
        return extractMpcIdentifierFromImageId(selectedArtId) ?? undefined;
    }, [selectedArtId]);
    const selectedArtIsMpc = selectedMpcId !== undefined;

    // MPC Search Hooks - sorting is done in CardArtContent using mpcSortKey for consistency
    const mpcData = useMpcSearch(
        artSource === 'mpc' ? query : '',
        {
            autoSearch,
            // Note: sorting is now handled in CardArtContent via mpcSortKey, not here
        }
    );



    // For DFC filtering in prints mode, extract face names and filter
    const faceNames = useMemo(
        () => getFaceNamesFromPrints(scryfallPrintsData.prints),
        [scryfallPrintsData.prints]
    );

    // SORT-ON-TOGGLE: Internal sort key state - only updates on tab toggle (false→true)
    // This keeps the selected card sorted to top but defers the sort until the tab is active
    const [scryfallSortKey, setScryfallSortKey] = useState<string | undefined>(undefined);
    const [mpcSortKey, setMpcSortKey] = useState<string | undefined>(undefined);

    // Track previous isActive to detect activation transition (false/undefined → true)
    const wasActiveRef = useRef<boolean | undefined>(undefined);

    // Track previous query to detect card navigation
    const prevQueryRef = useRef(query);

    // Reset sort keys when card changes (query changes)
    useEffect(() => {
        if (prevQueryRef.current !== query) {
            prevQueryRef.current = query;

            setScryfallSortKey(undefined);
            setMpcSortKey(undefined);
        }
    }, [query]);

    // Update sort keys when tab becomes active (sort-on-toggle)
    // Always update: if selectedArtId matches this tab, pin it; otherwise undefined for natural order
    useEffect(() => {
        const wasActive = wasActiveRef.current;
        wasActiveRef.current = isActive;

        // Only trigger on activation transition (false/undefined → true)
        if (isActive && !wasActive) {

            if (artSource === 'scryfall') {
                // If selectedArtId is a Scryfall URL, use it; otherwise undefined (natural order)
                const sortId = !selectedArtIsMpc ? selectedArtId ?? undefined : undefined;

                setScryfallSortKey(sortId);
            } else if (artSource === 'mpc') {
                // If selectedArtId is an MPC URL, use extracted ID; otherwise undefined (natural order)

                setMpcSortKey(selectedMpcId);
            }
        }
    }, [isActive, artSource, selectedArtId, selectedArtIsMpc, selectedMpcId]);

    const filteredPrints = useMemo(
        () => {
            const prints = filterPrintsByFace(
                scryfallPrintsData.prints,
                selectedFace || 'front',
                faceNames[0],
                faceNames[1]
            );

            // Sort: pin selectedArtId to top (if it's a Scryfall URL)
            if (scryfallSortKey && prints) {

                return [...prints].sort((a, b) => {
                    const aSelected = stripQuery(a.imageUrl) === stripQuery(scryfallSortKey);
                    const bSelected = stripQuery(b.imageUrl) === stripQuery(scryfallSortKey);
                    if (aSelected && !bSelected) return -1;
                    if (!aSelected && bSelected) return 1;
                    return 0;
                });
            }
            return prints;
        },
        [scryfallPrintsData.prints, selectedFace, faceNames, scryfallSortKey, stripQuery]
    );

    // Local MPC sorting - re-sort based on mpcSortKey
    const sortedMpcCards = useMemo(() => {
        const cards = mpcData.filteredCards;
        if (mpcSortKey && cards.length > 0) {

            const idx = cards.findIndex(c => c.identifier === mpcSortKey);
            if (idx > 0) {
                // Move the selected card to the front
                const result = [...cards];
                const [card] = result.splice(idx, 1);
                result.unshift(card);
                return result;
            }
        }
        return cards;
    }, [mpcData.filteredCards, mpcSortKey]);

    // Forward filter count changes (in useEffect to avoid setState during render)
    useEffect(() => {
        if (artSource === 'mpc' && onFilterCountChange) {
            onFilterCountChange(mpcData.activeFilterCount);
        }
    }, [artSource, onFilterCountChange, mpcData.activeFilterCount]);

    // Determine current state based on source and mode
    const hasSearched = artSource === 'scryfall'
        ? (mode === 'prints' ? scryfallPrintsData.hasSearched : scryfallSearchData.hasSearched)
        : mpcData.hasSearched;
    // For MPC, check filteredCards (not raw cards) so empty state shows when filters hide everything
    const hasResults = artSource === 'scryfall'
        ? (mode === 'prints' ? (filteredPrints?.length ?? 0) > 0 : scryfallSearchData.hasResults)
        : mpcData.filteredCards.length > 0;

    // Collapsed source groups state (for MPC source sort mode)
    const [collapsedSources, setCollapsedSources] = useState<Set<string>>(new Set());

    // Handler for MPC card selection
    const handleMpcCardSelect = (card: MpcAutofillCard) => {


        if (onSelectMpcCard) {
            onSelectMpcCard(card);
        } else {
            const primaryUrl = getMpcAutofillImageUrl(card.identifier);
            onSelectCard(card.name, primaryUrl);
        }
    };

    // MTG cards have R2.5mm corners on a 63mm wide card = 2.5/63 = 3.968% radius
    // Using percentage ensures proper scaling at any display size (see rounded-[3.968%] below)

    // Debug logging


    // Render a single Scryfall card (search mode)
    const renderScryfallCard = (card: ScryfallCard, index: number) => {
        const imageUrl = card.imageUrls?.[0] || '';
        const isSelected = stripQuery(selectedArtId) === stripQuery(imageUrl);

        const displayUrl = isSelected && processedDisplayUrl ? processedDisplayUrl : imageUrl;

        return (
            <div
                key={`${card.name}-${index}`}
                className="relative group cursor-pointer"
                onClick={() => onSelectCard(card.name, imageUrl, { set: card.set || '', number: card.number || '' })}
            >
                {/* Container enforces 63:88mm ratio for consistent sizing */}
                <div
                    className="relative w-full overflow-hidden"
                    style={{ aspectRatio: '63 / 88' }}
                >
                    <CardImageSvg
                        url={displayUrl}
                        id={`scry-${index}`}
                        rounded={true}
                    />
                </div>
                {isSelected && (
                    <div className="absolute inset-0 rounded-[2.5mm] ring-4 ring-green-500 pointer-events-none" />
                )}
            </div>
        );
    };

    // Render a single print (prints mode - used in ArtworkModal)
    const renderPrint = (print: PrintInfo, index: number) => {
        const isSelected = stripQuery(selectedArtId) === stripQuery(print.imageUrl);

        const displayUrl = isSelected && processedDisplayUrl ? processedDisplayUrl : print.imageUrl;

        return (
            <div
                key={`${print.set}-${print.number}-${print.faceName || ''}-${index}`}
                className="relative group cursor-pointer"
                onClick={() => {

                    onSelectCard(query, print.imageUrl);
                }}
            >
                {/* Container enforces 63:88mm ratio for consistent sizing */}
                <div
                    className="relative w-full overflow-hidden"
                    style={{ aspectRatio: '63 / 88' }}
                >
                    <CardImageSvg
                        url={displayUrl}
                        id={`print-${index}`}
                        rounded={true}
                    />
                </div>
                {isSelected && (
                    <div className="absolute inset-0 rounded-[2.5mm] ring-4 ring-green-500 pointer-events-none" />
                )}
            </div>
        );
    };

    // Render a single MPC card with bleed cropping and filter badges
    const renderMpcCard = (card: MpcAutofillCard, index: number) => {
        const isSelected = selectedMpcId === card.identifier;
        // Use proxied URLs for consistent loading and caching
        const primaryUrl = getMpcAutofillImageUrl(card.identifier, 'small');
        const fallbackUrl = card.smallThumbnailUrl || '';

        return (
            <div
                key={`mpc-${index}`}
                className="relative group cursor-pointer"
                onClick={() => handleMpcCardSelect(card)}
            >
                {/* MPC image with bleed cropping via custom SVG component */}
                {/* Image: 69.35mm × 94.35mm (with 3.175mm bleed/side). Card: 63mm × 88mm. */}
                <div
                    className="relative w-full overflow-hidden"
                    style={{ aspectRatio: '63 / 88' }}
                >
                    <CardImageSvg
                        url={primaryUrl}
                        fallbackUrl={fallbackUrl}
                        id={card.identifier}
                        bleed={{
                            amountMm: 3.175,
                            sourceWidthMm: 69.35,
                            sourceHeightMm: 94.35
                        }}
                        rounded={true}
                    />
                </div>
                {/* Selection ring overlay - matches exact R2.5mm corners */}
                {isSelected && (
                    <div className="absolute inset-0 rounded-[2.5mm] ring-4 ring-green-500 pointer-events-none" />
                )}
                {/* DPI Badge - always visible */}
                <div
                    className={`absolute top-2 right-2 text-white text-xs px-2 py-1 rounded transition-all z-30 cursor-pointer hover:scale-105 active:scale-95 ${mpcData.filters.minDpi > 0 && card.dpi >= mpcData.filters.minDpi
                        ? 'bg-blue-600 hover:bg-blue-500'
                        : 'bg-black/70 hover:bg-black/90'
                        }`}
                    onClick={(e) => {
                        e.stopPropagation();
                        mpcData.toggleDpi(card.dpi);
                    }}
                    title="Set as minimum DPI"
                >
                    {card.dpi} DPI
                </div>
                {/* Source & Tags - hover overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-2 rounded-b-[2.5mm] z-30 transition-opacity opacity-0 group-hover:opacity-100">
                    <div
                        className={`text-[10px] truncate max-w-full px-2 py-0.5 rounded transition-all inline-block mb-1 cursor-pointer hover:scale-105 active:scale-95 ${mpcData.filters.sourceFilters.has(card.sourceName)
                            ? 'bg-blue-600 text-white hover:bg-blue-500'
                            : 'bg-black/60 text-white hover:bg-black/80'
                            }`}
                        onClick={(e) => {
                            e.stopPropagation();
                            mpcData.toggleSource(card.sourceName);
                        }}
                        title="Add source to filter"
                    >
                        {card.sourceName}
                    </div>
                    {card.tags && card.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                            {card.tags.slice(0, 3).map((tag) => (
                                <span
                                    key={tag}
                                    className={`text-white text-[10px] px-1.5 py-0.5 rounded transition-all cursor-pointer hover:scale-105 active:scale-95 ${mpcData.filters.tagFilters.has(tag)
                                        ? 'bg-blue-600 hover:bg-blue-500'
                                        : 'bg-white/20 hover:bg-white/40'
                                        }`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        mpcData.toggleTag(tag);
                                    }}
                                    title="Add tag to filter"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // Empty state messages
    const emptyMessage = artSource === 'scryfall' ? (
        <>
            Search for a card to preview.
            <br />
            Supports <a href="https://scryfall.com/docs/syntax" target="_blank" rel="noopener noreferrer" className="underline text-blue-500">Scryfall syntax</a>.
        </>
    ) : (
        <>
            Search for a card to find custom art.
            <br />
            Results from <a href="https://mpcfill.com" target="_blank" rel="noopener noreferrer" className="underline text-blue-500">MPC Autofill</a>.
        </>
    );

    const noResultsMessage = artSource === 'scryfall'
        ? 'No cards found.'
        : `No MPC art found for "${query}"`;

    // Check if we have results but they're all filtered out (MPC only)
    const hasResultsButFiltered = artSource === 'mpc' && mpcData.cards.length > 0 && mpcData.filteredCards.length === 0;
    const filteredOutMessage = hasResultsButFiltered
        ? `"${query}" had ${mpcData.cards.length} result${mpcData.cards.length > 1 ? 's' : ''}, but current filters return none.`
        : null;

    return (
        <div className={`${containerClassStyle || 'h-full min-h-0'} flex flex-col flex-1 w-full`}>
            <div className="flex-1 overflow-y-auto overflow-x-hidden relative scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent flex flex-col min-h-0">
                {hasResults || hasResultsButFiltered ? (
                    <div className="px-6 flex flex-col gap-4 w-full flex-1">
                        {/* MPC Filter bar - only when not collapsed */}
                        {artSource === 'mpc' && !filtersCollapsed && (
                            <CardArtFilterBar
                                filters={mpcData.filters}
                                cards={mpcData.cards}
                                filteredCards={mpcData.filteredCards}
                                groupedBySource={mpcData.groupedBySource}
                                setMinDpi={mpcData.setMinDpi}
                                setSortBy={mpcData.setSortBy}
                                setSortDir={mpcData.setSortDir}
                                toggleSource={mpcData.toggleSource}
                                toggleTag={mpcData.toggleTag}
                                clearFilters={mpcData.clearFilters}
                                setSourceFilters={mpcData.setSourceFilters}
                                setTagFilters={mpcData.setTagFilters}
                                collapsedSources={collapsedSources}
                                setCollapsedSources={setCollapsedSources}
                            />
                        )}

                        {hasResultsButFiltered && (
                            <div className="px-6 pt-6 flex flex-col items-center justify-center w-full flex-1 text-gray-400 dark:text-gray-500">
                                <p className="text-sm font-medium text-center mb-4">
                                    {filteredOutMessage}
                                </p>
                                {/* Clear All Filters button when filters hide all results */}
                                <Button color="red" onClick={mpcData.clearFilters} className="mb-2">
                                    Clear All Filters
                                </Button>
                            </div>
                        )}

                        {/* Card Grid */}
                        <div className={artSource === 'mpc' && !filtersCollapsed ? '' : 'pt-6'}>
                            <CardGrid cardSize={cardSize}>
                                {artSource === 'scryfall'
                                    ? (mode === 'prints'
                                        ? (filteredPrints || []).map(renderPrint)
                                        : scryfallSearchData.cards.map(renderScryfallCard)
                                    )
                                    : sortedMpcCards.map(renderMpcCard)
                                }
                            </CardGrid>
                        </div>
                    </div>
                ) : (
                    <div className="px-6 pt-6 flex flex-col items-center justify-center w-full flex-1 text-gray-400 dark:text-gray-500">
                        <img src={logoSvg} alt="Proxxied Logo" className="w-24 h-24 mb-4 opacity-50" />
                        <p className="text-sm font-medium text-center mb-4">
                            {hasSearched && query.trim() ? noResultsMessage : emptyMessage}
                        </p>
                        {onSwitchSource && hasSearched && query.trim() && artSource === 'mpc' && (
                            <Button color="blue" onClick={onSwitchSource}>
                                Switch to Scryfall
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

