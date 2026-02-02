import { useState } from "react";
import { Button, Checkbox } from "flowbite-react";
import { Search, Filter, Image, Settings } from "lucide-react";
import { ToggleButtonGroup, CardGrid, ArtSourceToggle, FloatingZoomPanel, CardArtContent } from "../common";

import { CardbackLibrary } from "./CardbackLibrary";
import type { CardOption } from "../../../../shared/types";
import { isCardbackId, type CardbackOption } from "@/helpers/cardbackLibrary";
import type { MpcAutofillCard } from "@/helpers/mpcAutofillApi";

type ArtSource = 'scryfall' | 'mpc';

/** SVG icon for the MTG cardback button */
function CardbackIcon() {
    return (
        <svg className="h-6 w-5 mr-2" viewBox="0 0 50 70" fill="none">
            <rect x="0" y="0" width="50" height="70" rx="4" fill="#1a1a1a" />
            <rect x="3" y="3" width="44" height="64" rx="2" fill="#8B6914" />
            <ellipse cx="25" cy="35" rx="17" ry="24" fill="#4A5899" />
            <ellipse cx="25" cy="35" rx="14" ry="20" fill="#C4956A" />
        </svg>
    );
}

export interface ArtworkTabContentProps {
    modalCard: CardOption | null;
    linkedBackCard: CardOption | undefined;
    selectedFace: 'front' | 'back';
    isDFC: boolean;
    previewCardData: unknown;
    showCardbackLibrary: boolean;
    setShowCardbackLibrary: (val: boolean) => void;
    applyToAll: boolean;
    setApplyToAll: (val: boolean) => void;
    tabLabels: { front: string; back: string };
    cardbackOptions: CardbackOption[];
    setCardbackOptions: (opts: CardbackOption[]) => void;
    defaultCardbackId: string;
    filteredImageUrls: string[] | undefined;
    displayData: {
        name?: string;
        imageUrls: string[] | undefined;
        prints?: import("@/helpers/dfcHelpers").PrintInfo[];
        id: string | undefined;
        // Single ID for sorting and highlighting - replaces selectedId + initialScryfallId
        selectedArtId: string | undefined;
        processedDisplayUrl: string | null;
    };
    zoomLevel: number;
    onOpenSearch: () => void;
    onSelectCardback: (id: string, name: string) => void;
    onSetAsDefaultCardback: (id: string, name: string) => void;
    onSelectArtwork: (url: string, cardName?: string, specificPrint?: { set: string; number: string }) => void;
    onSelectMpcArt: (card: MpcAutofillCard) => void;
    onClose: () => void;
    onRequestDelete: (cardbackId: string, cardbackName: string) => void;
    onExecuteDelete: (cardbackId: string) => Promise<void>;
    artSource: ArtSource;
    setArtSource: (source: ArtSource) => void;
    /** External control for filters collapsed state (mobile landscape) */
    mpcFiltersCollapsed?: boolean;
    onMpcFiltersCollapsedChange?: (collapsed: boolean) => void;
    // New props for mobile landscape toggle relocation
    activeTab?: 'artwork' | 'settings';
    setActiveTab?: (tab: 'artwork' | 'settings') => void;
    setSelectedFace?: (face: 'front' | 'back') => void;
    setZoomLevel?: (level: number) => void;
}

/**
 * The Artwork tab content - search, cardback toggle, apply-to-all, and image grids.
 * Renders CardArtContent or CardbackLibrary based on state.
 */
export function ArtworkTabContent({
    modalCard,
    linkedBackCard,
    selectedFace,
    isDFC,
    previewCardData,
    showCardbackLibrary,
    setShowCardbackLibrary,
    applyToAll,
    setApplyToAll,
    tabLabels,
    cardbackOptions,
    setCardbackOptions,
    defaultCardbackId,
    filteredImageUrls: _filteredImageUrls,
    displayData,
    zoomLevel,
    onOpenSearch,
    onSelectCardback,
    onSetAsDefaultCardback,
    onSelectArtwork,
    onSelectMpcArt,
    onClose,
    onRequestDelete,
    onExecuteDelete,
    artSource,
    setArtSource,
    activeTab,
    setActiveTab,
    setSelectedFace,
    setZoomLevel,
}: ArtworkTabContentProps) {
    const [mpcFiltersCollapsed, onMpcFiltersCollapsedChange] = useState(() => {
        // Default: Hidden on mobile (true), Visible on desktop (false)
        if (typeof window !== 'undefined') {
            return window.innerWidth < 1024;
        }
        return true;
    });
    const [activeFilterCount, setActiveFilterCount] = useState(0);

    // Update filter visibility on resize if needed (optional - skipping for now to respect user choice)

    // Determine content visibility
    const isUsingCardbackLibrary = linkedBackCard?.imageId ? isCardbackId(linkedBackCard.imageId) : false;
    const showCardbackButton = selectedFace === 'back' && !isDFC && linkedBackCard && !isUsingCardbackLibrary && !showCardbackLibrary;
    const showCardbackLibraryGrid = selectedFace === 'back' && !isDFC && !previewCardData && (!linkedBackCard || isUsingCardbackLibrary || showCardbackLibrary);
    const showArtworkGrid = selectedFace === 'front' || isDFC || (linkedBackCard && !isUsingCardbackLibrary && !showCardbackLibrary) || (selectedFace === 'back' && !!previewCardData);

    if (!modalCard) return null;

    const cardName = selectedFace === 'back' ? tabLabels.back : tabLabels.front;

    return (
        <div className="flex flex-col flex-1 min-h-0 rounded-b-2xl overflow-hidden">
            {/* Header */}
            <header className="flex-none bg-white dark:bg-gray-700 p-6 pb-4 space-y-4">
                {/* Mobile Landscape Only: Toggles moved from Sidebar */}
                <div className="hidden max-lg:landscape:flex gap-2 mb-2">
                    <div className="flex-1">
                        <ToggleButtonGroup
                            options={[
                                { id: 'front' as const, label: tabLabels.front },
                                { id: 'back' as const, label: tabLabels.back },
                            ]}
                            value={selectedFace}
                            onChange={(val) => setSelectedFace?.(val)}
                        />
                    </div>
                    <div>
                        <ToggleButtonGroup
                            options={[
                                { id: 'artwork' as const, icon: <Image className="w-5 h-5" />, label: 'Art' },
                                { id: 'settings' as const, icon: <Settings className="w-5 h-5" />, label: 'Settings' },
                            ]}
                            value={activeTab || 'artwork'}
                            onChange={(val) => setActiveTab?.(val)}
                        />
                    </div>
                </div>

                {/* Mobile Landscape Only: Cardback Button (Relocated) */}
                {showCardbackButton && (
                    <Button color="light" onClick={() => setShowCardbackLibrary(true)} title="Use a cardback from the library instead" className="w-full hidden max-lg:landscape:flex">
                        <CardbackIcon />
                        Use Cardback
                    </Button>
                )}


                <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                        checked={applyToAll}
                        onChange={(e) => setApplyToAll(e.target.checked)}
                        className="size-5"
                    />
                    <span className="text-base dark:text-white">Apply to all cards named "{cardName}"</span>
                </label>
            </header>

            {/* Content */}
            <main className="relative flex-1 pt-0 flex flex-col overflow-hidden min-h-0">
                {showCardbackLibraryGrid && (
                    <div className="flex-1 overflow-y-auto overflow-x-hidden pt-0 p-6">
                        <CardGrid>
                            <CardbackLibrary
                                cardbackOptions={cardbackOptions}
                                setCardbackOptions={setCardbackOptions}
                                linkedBackCard={linkedBackCard}
                                modalCard={modalCard}
                                defaultCardbackId={defaultCardbackId}
                                onSelectCardback={onSelectCardback}
                                onSetAsDefaultCardback={onSetAsDefaultCardback}
                                onClose={onClose}
                                onRequestDelete={onRequestDelete}
                                onExecuteDelete={onExecuteDelete}
                            />
                        </CardGrid>
                    </div>
                )
                }

                {
                    showArtworkGrid && (
                        <div className={artSource === 'scryfall' ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
                            <CardArtContent
                                artSource="scryfall"
                                mode="prints"
                                query={displayData.name || modalCard.name || ''}
                                cardSize={zoomLevel}
                                selectedArtId={displayData.selectedArtId}
                                processedDisplayUrl={displayData.processedDisplayUrl}
                                selectedFace={selectedFace}
                                onSelectCard={(name, url, print) => onSelectArtwork(url || '', name, print)}
                                containerClassStyle="flex-1 h-full"
                                isActive={artSource === 'scryfall'}
                                cardTypeLine={modalCard.type_line}
                                initialPrints={displayData.prints}
                            />
                        </div>
                    )
                }

                {/* MPC content - always rendered when showArtworkGrid is true, hidden via CSS to preserve state */}
                {
                    showArtworkGrid && (
                        <div className={artSource === 'mpc' ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
                            <CardArtContent
                                artSource="mpc"
                                query={displayData.name || modalCard.name || ''}
                                cardSize={zoomLevel}
                                selectedArtId={displayData.selectedArtId}
                                onSelectCard={(_name, url) => {
                                    // For MPC, we need to use onSelectMpcArt callback
                                    // but CardArtContent calls onSelectCard with name and url
                                    onSelectArtwork(url || '');
                                }}
                                onSelectMpcCard={onSelectMpcArt}
                                onSwitchSource={() => setArtSource('scryfall')}
                                autoSearch={true}
                                filtersCollapsed={mpcFiltersCollapsed}
                                onFilterCountChange={setActiveFilterCount}
                                containerClassStyle="flex-1 h-full"
                                isActive={artSource === 'mpc'}
                                cardTypeLine={modalCard.type_line}
                            />
                        </div>
                    )
                }

                {/* Floating Zoom Controls - Desktop only */}
                {showArtworkGrid && setZoomLevel && (
                    <FloatingZoomPanel
                        zoom={zoomLevel}
                        onZoomChange={setZoomLevel}
                        minZoom={0.1}
                        maxZoom={5}
                        className="hidden lg:block"
                    />
                )}
            </main>

            {/* Footer - always visible, but toggle and filter are hidden when in cardback library mode */}
            <footer className="flex-none p-4 bg-white dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 flex flex-col gap-2">
                {/* Source toggle - mobile portrait only (desktop has inline toggle, landscape has sidebar toggle) */}
                {!showCardbackLibraryGrid && (
                    <div className="lg:hidden max-lg:landscape:hidden">
                        <ArtSourceToggle
                            value={artSource}
                            onChange={setArtSource}
                            className="w-full"
                        />
                    </div>
                )}

                {/* Second row: Controls (filter + action button) */}
                <div className="flex gap-2 items-center">
                    {/* Desktop Only: Toggle inline (Landscape uses sidebar) - hidden for cardback library */}
                    {!showCardbackLibraryGrid && (
                        <div className="hidden lg:block">
                            <ArtSourceToggle
                                value={artSource}
                                onChange={setArtSource}
                                vertical={false}
                            />
                        </div>
                    )}

                    {/* Filter button - only for MPC, hidden for cardback library */}
                    {!showCardbackLibraryGrid && artSource === 'mpc' && (
                        <button
                            onClick={() => onMpcFiltersCollapsedChange?.(!mpcFiltersCollapsed)}
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

                    {/* Search Button - shows for all sources including cardback library */}
                    <Button className="flex-1" color="blue" onClick={onOpenSearch}>
                        <Search className="w-4 h-4 mr-2" />
                        Search for a different card...
                    </Button>
                </div>
            </footer>
        </div >
    );
}
