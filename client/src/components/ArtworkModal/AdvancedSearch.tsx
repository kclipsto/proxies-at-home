import { useState, useEffect, useCallback } from "react";
import { TextInput } from "flowbite-react";
import { X, Filter } from "lucide-react";
import type { UploadLibraryItem } from "@/helpers/uploadLibrary";

import { ArtSourceToggle, ResponsiveModal, FloatingZoomPanel, CardArtContent } from "../common";
import type { ArtSource } from "../common/ArtSourceToggle";
import { useToastStore } from "@/store/toast";
import { useZoomShortcuts } from "@/hooks/useZoomShortcuts";
import { useArtworkModalStore } from "@/store/artworkModal";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";

interface AdvancedSearchProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectCard: (cardName: string, mpcImageUrl?: string, specificPrint?: { set: string; number: string }) => void;
    onUploadLibraryItemSelect?: (upload: UploadLibraryItem) => void;
    title?: string;
    keepOpenOnAdd?: boolean;
    initialSource?: ArtSource;
}

export function AdvancedSearch({
    isOpen,
    onClose,
    onSelectCard,
    onUploadLibraryItemSelect,
    title = "",
    keepOpenOnAdd = false,
    initialSource = 'scryfall',
}: AdvancedSearchProps) {
    const [artSource, setArtSource] = useState<ArtSource>(() => initialSource);
    const [mpcFiltersCollapsed, setMpcFiltersCollapsed] = useState(false);
    const [activeFilterCount, setActiveFilterCount] = useState(0);
    const [query, setQuery] = useState('');
    const cardZoom = useArtworkModalStore((state) => state.advancedSearchZoom);
    const setCardZoom = useArtworkModalStore((state) => state.setAdvancedSearchZoom);

    useZoomShortcuts({
        setZoom: setCardZoom,
        isOpen,
        minZoom: 0.5,
        maxZoom: 5,
    });

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setArtSource(initialSource);
            setQuery('');
        }
    }, [isOpen, initialSource]);

    const handleClear = () => {
        setQuery('');
    };

    const handleSelectCard = useCallback((cardName: string, imageUrl?: string, specificPrint?: { set: string; number: string }) => {
        if (artSource === 'mpc' || artSource === 'upload-library') {
            onSelectCard(cardName, imageUrl || '');
        } else {
            onSelectCard(cardName, undefined, specificPrint);
        }

        if (keepOpenOnAdd) {
            useToastStore.getState().showSuccessToast(cardName);
        } else {
            handleClear();
            onClose();
        }
    }, [artSource, onSelectCard, keepOpenOnAdd, onClose]);

    const handleSwitchToScryfall = useCallback(() => {
        setArtSource('scryfall');
    }, []);

    const hasUploadLibraryItems = useLiveQuery(() => db.user_images.count().then(c => c > 0), [], false);
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
                    showUploadLibrary={hasUploadLibraryItems}
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
            <div className="flex-1 flex flex-col overflow-hidden max-lg:landscape:overflow-auto min-h-0 relative bg-gray-50 dark:bg-gray-700">
                {/* Unified card art content for both sources */}
                <CardArtContent
                    artSource={artSource}
                    query={query}
                    cardSize={cardZoom}
                    onSelectCard={handleSelectCard}
                    onUploadLibraryItemSelect={onUploadLibraryItemSelect ? (upload) => {
                        onUploadLibraryItemSelect(upload);
                        if (!keepOpenOnAdd) {
                            handleClear();
                            onClose();
                        }
                    } : undefined}
                    onSwitchSource={handleSwitchToScryfall}
                    autoSearch={artSource === 'mpc'}
                    filtersCollapsed={mpcFiltersCollapsed}
                    onFilterCountChange={setActiveFilterCount}
                    containerClassStyle="flex-1 h-full overflow-y-auto overflow-x-hidden scrollbar-hide"
                />

                {/* Floating Zoom Controls - Shared for both modes */}
                <FloatingZoomPanel
                    zoom={cardZoom}
                    onZoomChange={setCardZoom}
                    minZoom={0.5}
                    maxZoom={5}
                    className="hidden lg:block"
                />
            </div>

            {/* Footer - always visible, but toggle is hidden on mobile landscape (uses header sidebar) */}
            <div className="mt-auto p-4 border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 pb-safe shrink-0 z-20 flex flex-col gap-2">
                {/* Source toggle - mobile portrait only (desktop has inline toggle, landscape has sidebar toggle) */}
                <div className="lg:hidden max-lg:landscape:hidden">
                    <ArtSourceToggle
                        value={artSource}
                        onChange={setArtSource}
                        showUploadLibrary={hasUploadLibraryItems}
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
                            showUploadLibrary={hasUploadLibraryItems}
                        />
                    </div>

                    {/* Filter toggle button */}
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

                    <div className="relative flex-1 h-10">
                        <TextInput
                            sizing="lg"
                            type="text"
                            placeholder={artSource === 'upload-library' ? "Search my uploads..." : artSource === 'mpc' ? "Search MPC Autofill..." : "Search card name..."}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
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
        </ResponsiveModal>
    );
}
