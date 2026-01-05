import { useState, useEffect, useCallback } from "react";
import { TextInput } from "flowbite-react";
import { X, Filter } from "lucide-react";
import { useCardAutocomplete } from "@/hooks/useCardAutocomplete";
import { useScryfallPreview } from "@/hooks/useScryfallPreview";
import { extractCardInfo } from "@/helpers/cardInfoHelper";
import { ArtSourceToggle, ResponsiveModal, FloatingZoomPanel, CardGrid } from "../common";
import { useToastStore } from "@/store/toast";
import { getMpcAutofillImageUrl, parseMpcCardName, type MpcAutofillCard } from "@/helpers/mpcAutofillApi";
import type { ScryfallCard } from "../../../../shared/types";
import { useZoomShortcuts } from "@/hooks/useZoomShortcuts";
import { useArtworkModalStore } from "@/store/artworkModal";
import { MpcArtContent } from "../MpcArt";

type ArtSource = 'scryfall' | 'mpc';

interface AdvancedSearchProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectCard: (cardName: string, mpcImageUrl?: string) => void;
    title?: string;
    keepOpenOnAdd?: boolean;
    initialSource?: ArtSource;
}

export function AdvancedSearch({
    isOpen,
    onClose,
    onSelectCard,
    title = "",
    keepOpenOnAdd = false,
    initialSource = 'scryfall',
}: AdvancedSearchProps) {
    const [artSource, setArtSource] = useState<'scryfall' | 'mpc'>(initialSource);
    const [mpcFiltersCollapsed, setMpcFiltersCollapsed] = useState(() => {
        // Default: Hidden on mobile (true), Visible on desktop (false)
        if (typeof window !== 'undefined') {
            return window.innerWidth < 1024;
        }
        return true;
    });
    const [activeFilterCount, setActiveFilterCount] = useState(0);
    const cardZoom = useArtworkModalStore((state) => state.advancedSearchZoom);
    const setCardZoom = useArtworkModalStore((state) => state.setAdvancedSearchZoom);

    useZoomShortcuts({
        setZoom: setCardZoom,
        isOpen,
        minZoom: 0.5,
        maxZoom: 5,
    });

    const {
        query,
        suggestions,
        hoveredIndex,
        handleInputChange,
        handleClear,
        handleKeyDown,
    } = useCardAutocomplete({
        onSelect: () => {
            // When a card is selected from autocomplete (Enter key or direct match)
            // We don't add it immediately, we just show the preview
        }
    });

    // Get neighbor cards
    const getScryfallImageUrl = (name: string) => `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=large`;

    const { setVariations, validatedPreviewUrl } = useScryfallPreview(artSource === 'scryfall' ? query : '');

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setArtSource(initialSource);
        }
    }, [isOpen, initialSource]);
    // Use set variations if available, otherwise suggestions
    let displaySuggestions = setVariations.length > 0 ? setVariations : suggestions.map(name => ({
        name,
        set: '',
        number: '',
        imageUrls: [],
        lang: 'en',
    } as ScryfallCard));

    if (displaySuggestions.length === 0 && validatedPreviewUrl) {
        const { name: cleanedName, set, number } = extractCardInfo(query);
        displaySuggestions = [{
            name: cleanedName || query,
            set: set || '',
            number: number || '',
            imageUrls: [validatedPreviewUrl],
            lang: 'en',
        } as ScryfallCard];
    }

    const handleAddCurrentCard = (indexOverride?: number) => {
        const idx = indexOverride ?? hoveredIndex;
        if (idx !== null && displaySuggestions[idx]) {
            const cardName = displaySuggestions[idx].name;
            onSelectCard(cardName);
            if (keepOpenOnAdd) {
                useToastStore.getState().showSuccessToast(cardName);
            } else {
                handleClear();
                onClose();
            }
        } else if (query && displaySuggestions.length === 0) {
            onSelectCard(query);
            if (keepOpenOnAdd) {
                useToastStore.getState().showSuccessToast(query);
            } else {
                handleClear();
                onClose();
            }
        }
    };

    const handleSelectMpcCard = useCallback((card: MpcAutofillCard) => {
        const mpcImageUrl = getMpcAutofillImageUrl(card.identifier);
        const cardName = parseMpcCardName(card.name);
        onSelectCard(cardName, mpcImageUrl);
        if (keepOpenOnAdd) {
            useToastStore.getState().showSuccessToast(cardName);
        } else {
            handleClear();
            onClose();
        }
    }, [onSelectCard, keepOpenOnAdd, handleClear, onClose]);

    const handleSwitchToScryfall = useCallback(() => {
        setArtSource('scryfall');
    }, []);

    if (!isOpen) return null;

    // Custom header/sidebar component for the modal
    const modalHeader = (
        <div className="landscape-sidebar-header border-b border-gray-200 dark:border-gray-600">
            <div className="landscape-sidebar-row">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white max-lg:landscape:text-center max-lg:landscape:w-min">
                    {title}
                </h3>
            </div>
            {/* Spacer to push toggle to bottom on mobile landscape */}
            <div className="landscape-spacer" />
            {/* Toggle in header - Mobile landscape only (portrait/desktop use footer) */}
            {/* Order reversed for vertical mode since sideways-lr reads bottom-to-top */}
            <div className="landscape-only">
                <ArtSourceToggle
                    value={artSource}
                    onChange={setArtSource}
                    vertical
                    reversed
                />
            </div>
            <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors max-lg:landscape:order-first"
            >
                <X className="w-5 h-5" />
            </button>
        </div>
    );

    return (
        <ResponsiveModal
            isOpen={isOpen}
            onClose={onClose}
            mobileLandscapeSidebar
            header={modalHeader}
        >
            <div className="flex-1 flex flex-col overflow-hidden max-lg:landscape:overflow-auto min-h-0">
                <div className="relative flex-1 overflow-hidden bg-gray-50 dark:bg-gray-700 flex flex-col min-h-0">
                    <div className={`flex-1 h-full w-full overflow-x-hidden overflow-y-auto pt-4 scrollbar-hide flex flex-col min-h-0 ${artSource === 'scryfall' ? 'space-y-4' : ''}`}>
                        {artSource === 'scryfall' && (
                            <div className="flex-1 overflow-y-auto overflow-x-hidden p-6">
                                {displaySuggestions.length > 0 ? (
                                    <CardGrid cardSize={cardZoom}>
                                        {displaySuggestions.map((suggestion, index) => (
                                            <div
                                                key={`${suggestion.name}-${index}`}
                                                className="relative group cursor-pointer"
                                                onClick={() => handleAddCurrentCard(index)}
                                            >
                                                <img
                                                    src={suggestion.imageUrls?.[0] || getScryfallImageUrl(suggestion.name)}
                                                    alt={suggestion.name}
                                                    loading="lazy"
                                                    className="w-full h-auto rounded-[4.75%] shadow-md hover:shadow-xl transition-shadow select-none"
                                                    draggable="false"
                                                />
                                            </div>
                                        ))}
                                    </CardGrid>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
                                        <div className="text-center p-8">
                                            <p className="text-sm font-medium">
                                                {query ? 'No cards found.' : 'Search for a card to preview.'}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* MPC content - always rendered, hidden via CSS to preserve state */}
                        <div className={artSource === 'mpc' ? 'flex-1 overflow-hidden flex flex-col min-h-0' : 'hidden'}>
                            <MpcArtContent
                                cardName={query}
                                onSelectCard={handleSelectMpcCard}
                                onSwitchToScryfall={handleSwitchToScryfall}
                                autoSearch={true}
                                filtersCollapsed={mpcFiltersCollapsed}
                                containerClassStyle="flex-1 h-full"
                                onFiltersCollapsedChange={setMpcFiltersCollapsed}
                                onFilterCountChange={setActiveFilterCount}
                                cardSize={cardZoom}
                            />
                        </div>

                        {/* Floating Zoom Controls - Shared for both modes */}
                        <FloatingZoomPanel
                            zoom={cardZoom}
                            onZoomChange={setCardZoom}
                            minZoom={0.5}
                            maxZoom={5}
                            className="hidden lg:block"
                        />

                    </div>
                </div>

                {/* Footer - always visible, but toggle is hidden on mobile landscape (uses header sidebar) */}
                <div className="mt-auto p-4 border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 pb-safe shrink-0 z-20 flex flex-col gap-2">
                    {/* Source toggle - mobile portrait only (desktop has inline toggle, landscape has sidebar toggle) */}
                    <div className="lg:hidden max-lg:landscape:hidden">
                        <ArtSourceToggle
                            value={artSource}
                            onChange={setArtSource}
                            className="w-full"
                        />
                    </div>

                    {/* Controls row: toggle (desktop) + filter + search + add */}
                    <div className="flex gap-2 items-center">
                        {/* Desktop: Toggle inline */}
                        <div className="hidden lg:flex items-center">
                            <ArtSourceToggle
                                value={artSource}
                                onChange={setArtSource}
                            />
                        </div>

                        {/* Filter button - only for MPC */}
                        {artSource === 'mpc' && (
                            <button
                                onClick={() => setMpcFiltersCollapsed(prev => !prev)}
                                className={`flex items-center justify-center h-10 w-10 rounded-lg border transition-colors ${mpcFiltersCollapsed
                                    ? 'text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    : 'text-blue-600 dark:text-blue-400 border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/30'
                                    }`}
                                title={mpcFiltersCollapsed ? 'Show Filters' : 'Hide Filters'}
                            >
                                <div className="relative">
                                    <Filter className="w-5 h-5" strokeWidth={2.5} />
                                    {activeFilterCount > 0 && (
                                        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white ring-2 ring-white dark:ring-gray-800">
                                            {activeFilterCount}
                                        </span>
                                    )}
                                </div>
                            </button>
                        )}

                        <div className="relative flex-1 h-10">
                            <TextInput
                                sizing="lg"
                                type="text"
                                placeholder={artSource === 'mpc' ? "Search MPC Autofill..." : "Search card name..."}
                                value={query}
                                onChange={handleInputChange}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && artSource === 'scryfall') {
                                        handleAddCurrentCard();
                                    }
                                    handleKeyDown(e);
                                }}
                                autoFocus
                                className="w-full h-full"
                                theme={{
                                    field: {
                                        input: {
                                            base: "block w-full border disabled:cursor-not-allowed disabled:opacity-50 h-full",
                                            sizes: {
                                                lg: "p-2.5 sm:text-base"
                                            },
                                            colors: {
                                                gray: "bg-gray-100 border-gray-300 text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 dark:focus:border-primary-500 dark:focus:ring-primary-500"
                                            }
                                        }
                                    }
                                }}
                            />
                            {query && (
                                <button
                                    onClick={handleClear}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                >
                                    <X className="w-5 h-5" strokeWidth={2.5} />
                                </button>
                            )}
                        </div>

                    </div>
                </div>

            </div>
        </ResponsiveModal>
    );
}
