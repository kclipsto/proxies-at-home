import { useState } from "react";
import { createPortal } from "react-dom";
import { Button, TextInput } from "flowbite-react";
import { X, Plus } from "lucide-react";
import { useCardAutocomplete } from "@/hooks/useCardAutocomplete";
import { useScryfallPreview } from "@/hooks/useScryfallPreview";
import { extractCardInfo } from "@/helpers/CardInfoHelper";
import { SearchCarousel } from "./SearchComponents/SearchCarousel";
import { SearchResultsList } from "./SearchComponents/SearchResultsList";
import type { ScryfallCard } from "../../../shared/types";


interface AdvancedSearchProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectCard: (cardName: string) => void;
    title?: string;
    actionIcon?: React.ReactNode;
}

export function AdvancedSearch({
    isOpen,
    onClose,
    onSelectCard,
    title = "Add Card",
    actionIcon,
}: AdvancedSearchProps) {
    const {
        query,
        suggestions,
        hoveredIndex,
        setHoveredIndex,
        handleInputChange,
        handleClear,
        handleKeyDown,
    } = useCardAutocomplete({
        onSelect: () => {
            // When a card is selected from autocomplete (Enter key or direct match)
            // We don't add it immediately, we just show the preview
        }
    });

    const [showResultsList, setShowResultsList] = useState(false);

    // Get neighbor cards
    const getScryfallImageUrl = (name: string) => `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=large`;

    const { setVariations, validatedPreviewUrl } = useScryfallPreview(query);

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

    // Duplicate slides if fewer than 10 to ensure infinite scroll feel
    const originalLength = displaySuggestions.length;
    let loopSuggestions = [...displaySuggestions];
    const MIN_SLIDES_FOR_LOOP = 12;

    if (loopSuggestions.length > 0 && loopSuggestions.length < MIN_SLIDES_FOR_LOOP) {
        while (loopSuggestions.length < MIN_SLIDES_FOR_LOOP) {
            loopSuggestions = [...loopSuggestions, ...displaySuggestions];
        }
    }

    const shouldLoop = loopSuggestions.length >= 10;

    const handleToggleResultsList = (e?: React.MouseEvent | React.TouchEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        setShowResultsList(!showResultsList);
    };

    const handleAddCurrentCard = (indexOverride?: number) => {
        const idx = indexOverride ?? hoveredIndex;
        if (idx !== null && loopSuggestions[idx]) {
            // Use quotes to force exact match search
            onSelectCard(loopSuggestions[idx].name);
            handleClear();
            onClose();
        } else if (query && loopSuggestions.length === 0) {
            onSelectCard(query);
            handleClear();
            onClose();
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-0"
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    onClose();
                }
            }}
        >
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden w-[90%] max-h-[80vh] sm:h-auto sm:max-h-[90vh] sm:max-w-[90%] flex flex-col">
                {/* Floating Close Button (Mobile Landscape) */}
                <button
                    onClick={onClose}
                    className="hidden landscape:flex lg:landscape:hidden absolute top-3 right-3 z-50 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-full shadow-sm hover:shadow-md transition-all"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="flex landscape:hidden lg:landscape:flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {title}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="relative flex-1 overflow-hidden">
                    <div className="h-full w-full overflow-y-auto overflow-x-hidden py-4 space-y-4 scrollbar-hide">


                        {/* 3D Coverflow Carousel */}
                        <SearchCarousel
                            suggestions={suggestions}
                            displaySuggestions={loopSuggestions}
                            hoveredIndex={hoveredIndex}
                            setHoveredIndex={setHoveredIndex}
                            shouldLoop={shouldLoop}
                            getScryfallImageUrl={getScryfallImageUrl}
                            onAddCard={handleAddCurrentCard}
                            onToggleResultsList={handleToggleResultsList}
                            originalLength={originalLength}
                        />

                    </div>
                    {/* Results List Overlay */}
                    {showResultsList && (
                        <SearchResultsList
                            suggestions={suggestions}
                            hoveredIndex={hoveredIndex}
                            setHoveredIndex={setHoveredIndex}
                            onClose={() => setShowResultsList(false)}
                        />
                    )}
                </div>

                {/* Bottom Bar - Fixed */}
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pb-safe shrink-0 z-20">
                    <div className="flex gap-2 h-12"> {/* Fixed height container */}
                        <div className="relative flex-1 h-full">
                            <TextInput
                                sizing="lg"
                                type="text"
                                placeholder="Search card name..."
                                value={query}
                                onChange={handleInputChange}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
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
                                                lg: "p-4 sm:text-base"
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
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <Button
                            color="indigo"
                            onClick={() => {
                                handleAddCurrentCard();
                            }}
                            disabled={!query}
                            className="h-full aspect-square flex items-center justify-center"
                        >
                            {actionIcon || <Plus className="w-6 h-6" />}
                        </Button>
                    </div>
                </div>

            </div>
        </div>,
        document.body
    );
}
