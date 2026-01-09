import logoSvg from "@/assets/logo.svg";
import { Button } from "flowbite-react";
import { ChevronDown, ChevronRight, Star } from "lucide-react";
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
import { useSettingsStore } from "@/store";
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
    /** Card type_line for auto-detecting token cards in MPC search */
    cardTypeLine?: string;
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
    cardTypeLine,
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
            // Pass card type_line for auto-detection of token cards
            cardData: cardTypeLine ? { type_line: cardTypeLine } : undefined,
        }
    );



    // For DFC filtering in prints mode, extract face names and filter
    const faceNames = useMemo(
        () => getFaceNamesFromPrints(scryfallPrintsData.prints),
        [scryfallPrintsData.prints]
    );

    // STABLE SORT KEY: Only updates when prints data actually changes
    // This prevents the old card's grid from re-sorting during navigation transition
    // We use prints array reference as stability indicator since it's the actual displayed data
    const lastPrintsRef = useRef(scryfallPrintsData.prints);
    const lastMpcCardsRef = useRef(mpcData.filteredCards);
    const stableScryfallSortKeyRef = useRef<string | undefined>(undefined);
    const stableMpcSortKeyRef = useRef<string | undefined>(undefined);

    // Track query and selection for hybrid highlight logic
    // During card navigation: query changes but data stays stale -> preserve highlight
    // During same-card selection: query is same, selection changes -> update highlight immediately
    const lastQueryRef = useRef(query);
    const stableHighlightMpcIdRef = useRef<string | undefined>(selectedMpcId);
    const stableHighlightArtIdRef = useRef<string | undefined>(selectedArtId ?? undefined);

    // Detect if we're mid-navigation (query changed but data hasn't updated yet)
    const isNavigating = query !== lastQueryRef.current;

    // When query changes back to same (data loaded), or on same card, update highlight immediately
    if (!isNavigating) {
        // Same card - use live values for immediate highlight updates
        stableHighlightMpcIdRef.current = selectedMpcId;
        stableHighlightArtIdRef.current = selectedArtId ?? undefined;
    }
    // If navigating, keep the old stable highlight values until data changes

    // Update Scryfall sort key only when prints data actually changes
    if (lastPrintsRef.current !== scryfallPrintsData.prints) {
        lastPrintsRef.current = scryfallPrintsData.prints;
        lastQueryRef.current = query; // Reset query tracking when data updates
        // Reset to new card's selected art for sorting and highlighting
        if (isActive && artSource === 'scryfall' && !selectedArtIsMpc) {
            stableScryfallSortKeyRef.current = selectedArtId ?? undefined;
            stableHighlightArtIdRef.current = selectedArtId ?? undefined;
        } else {
            stableScryfallSortKeyRef.current = undefined;
        }
    }

    // Update MPC sort key only when MPC data actually changes
    if (lastMpcCardsRef.current !== mpcData.filteredCards) {
        lastMpcCardsRef.current = mpcData.filteredCards;
        lastQueryRef.current = query; // Reset query tracking when data updates
        if (isActive && artSource === 'mpc') {
            stableMpcSortKeyRef.current = selectedMpcId;
            stableHighlightMpcIdRef.current = selectedMpcId;
        } else {
            stableMpcSortKeyRef.current = undefined;
        }
    }

    const scryfallSortKey = stableScryfallSortKeyRef.current;
    const mpcSortKey = stableMpcSortKeyRef.current;
    // Use stable highlight values (immediate updates on same card, preserved during navigation)
    const highlightSelectedArtId = stableHighlightArtIdRef.current;
    const highlightSelectedMpcId = stableHighlightMpcIdRef.current;

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
    // We track both explicitly collapsed sources AND whether "collapse all" mode is active
    const [collapsedSources, setCollapsedSources] = useState<Set<string>>(new Set());
    const [allSourcesCollapsed, setAllSourcesCollapsed] = useState(false);

    // Get favorites from settings for source group headers
    const favoriteMpcSources = useSettingsStore(s => s.favoriteMpcSources);
    const toggleFavoriteMpcSource = useSettingsStore(s => s.toggleFavoriteMpcSource);

    // Check if a source should be collapsed (either explicitly or via allCollapsed mode)
    const isSourceCollapsed = useCallback((sourceName: string) => {
        if (allSourcesCollapsed) {
            // In "all collapsed" mode, only explicitly expanded sources are shown
            return !collapsedSources.has(sourceName);
        }
        // In normal mode, only explicitly collapsed sources are hidden
        return collapsedSources.has(sourceName);
    }, [allSourcesCollapsed, collapsedSources]);

    // Toggle source collapse state
    const toggleSourceCollapse = useCallback((sourceName: string) => {
        setCollapsedSources(prev => {
            const next = new Set(prev);
            if (next.has(sourceName)) {
                next.delete(sourceName);
            } else {
                next.add(sourceName);
            }
            return next;
        });
    }, []);

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
        const isSelected = stripQuery(highlightSelectedArtId) === stripQuery(imageUrl);

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
        const isSelected = stripQuery(highlightSelectedArtId) === stripQuery(print.imageUrl);

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
        const isSelected = highlightSelectedMpcId === card.identifier;
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
                                allSourcesCollapsed={allSourcesCollapsed}
                                setAllSourcesCollapsed={setAllSourcesCollapsed}
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
                            {artSource === 'scryfall' ? (
                                <CardGrid cardSize={cardSize}>
                                    {mode === 'prints'
                                        ? (filteredPrints || []).map(renderPrint)
                                        : scryfallSearchData.cards.map(renderScryfallCard)
                                    }
                                </CardGrid>
                            ) : mpcData.filters.sortBy === 'source' && mpcData.groupedBySource ? (
                                /* Grouped by source with collapsible sections */
                                <div className="flex flex-col gap-4">
                                    {Array.from(mpcData.groupedBySource.entries()).map(([sourceName, cards]) => (
                                        <div key={sourceName} className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => toggleSourceCollapse(sourceName)}
                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSourceCollapse(sourceName); }}
                                                className="w-full flex items-center justify-between px-4 py-3 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-900 transition-colors cursor-pointer"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleFavoriteMpcSource(sourceName);
                                                        }}
                                                        className="p-1 hover:text-yellow-500 transition-colors"
                                                        title={favoriteMpcSources.includes(sourceName) ? "Remove from favorites" : "Add to favorites"}
                                                    >
                                                        <Star className={`w-4 h-4 ${favoriteMpcSources.includes(sourceName) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                                                    </button>
                                                    <span className="font-medium text-gray-900 dark:text-white">{sourceName}</span>
                                                </div>
                                                <span className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                                    <span>{cards.length} card{cards.length !== 1 ? 's' : ''}</span>
                                                    {isSourceCollapsed(sourceName) ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </span>
                                            </div>
                                            {!isSourceCollapsed(sourceName) && (
                                                <div className="p-4">
                                                    <CardGrid cardSize={cardSize}>
                                                        {cards.map(renderMpcCard)}
                                                    </CardGrid>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                /* Flat grid for non-source sorting */
                                <CardGrid cardSize={cardSize}>
                                    {sortedMpcCards.map(renderMpcCard)}
                                </CardGrid>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="px-6 pt-6 flex flex-col items-center justify-center w-full flex-1 text-gray-400 dark:text-gray-500">
                        <img src={logoSvg} alt="Proxxied Logo" className="w-24 h-24 mb-4 opacity-50" />
                        <p className="text-sm font-medium text-center mb-2">
                            {hasSearched && query.trim() ? noResultsMessage : emptyMessage}
                        </p>
                        {hasSearched && query.trim() && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-4">
                                💡 Tip: Use <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">t:name</code> to search for tokens (e.g., <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">t:treasure</code>)
                            </p>
                        )}
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

