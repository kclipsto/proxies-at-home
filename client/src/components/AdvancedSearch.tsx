import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button, TextInput } from "flowbite-react";
import { X, Plus } from "lucide-react";
import { useCardAutocomplete } from "@/hooks/useCardAutocomplete";
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCoverflow, Mousewheel, FreeMode } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';

// Import Swiper styles
import 'swiper/css';
import 'swiper/css/effect-coverflow';
import { extractCardInfo, hasIncompleteTagSyntax } from "@/helpers/CardInfoHelper";
import { getImages, type RawScryfallCard } from "@/helpers/scryfallApi";
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
    const swiperRef = useRef<SwiperType | null>(null);

    // Get neighbor cards
    const getScryfallImageUrl = (name: string) => `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=large`;

    // Track previous suggestions to detect updates
    const prevSuggestionsRef = useRef(suggestions);

    // Track programmatic slide changes to prevent infinite loops
    const isProgrammaticSlideRef = useRef(false);

    // Track the last clicked card index for double-click handling
    // This prevents adding the wrong card when animation shifts positions
    const lastClickedIndexRef = useRef<number | null>(null);

    // Debounce timer for snapping to center after scroll
    const snapDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Track last tap time for double-tap detection on mobile
    const lastTapRef = useRef<number>(0);

    const [setVariations, setSetVariations] = useState<ScryfallCard[]>([]);
    const [validatedPreviewUrl, setValidatedPreviewUrl] = useState<string | null>(null);

    // Cache for preview results to prevent duplicate requests
    const previewCache = useRef<Record<string, string | null>>({});
    const variationsCache = useRef<Record<string, ScryfallCard[]>>({});

    // Validate preview when query changes
    useEffect(() => {
        const validatePreview = async () => {
            // Skip validation if query ends with incomplete tag: syntax (e.g., "set:", "c:", "t:")
            // This prevents 404 errors when user is still typing
            if (hasIncompleteTagSyntax(query)) {
                return;
            }

            const { name: cleanedName, set, number } = extractCardInfo(query);
            const cacheKey = `${cleanedName}|${set}|${number}`;

            if (set) {
                if (number) {
                    // Specific card: Name [Set] {Number}
                    setSetVariations([]); // Clear variations

                    if (previewCache.current[cacheKey] !== undefined) {
                        setValidatedPreviewUrl(previewCache.current[cacheKey]);
                        return;
                    }

                    try {
                        const res = await fetch(`https://api.scryfall.com/cards/${set}/${number}`);
                        if (res.ok) {
                            const data = await res.json();
                            // If name is provided, validate it matches the card at set/number
                            if (cleanedName && !data.name.toLowerCase().includes(cleanedName.toLowerCase())) {
                                previewCache.current[cacheKey] = null;
                                setValidatedPreviewUrl(null);
                            } else {
                                const url = `https://api.scryfall.com/cards/${encodeURIComponent(set)}/${encodeURIComponent(number)}?format=image&version=png`;
                                previewCache.current[cacheKey] = url;
                                setValidatedPreviewUrl(url);
                            }
                        } else {
                            previewCache.current[cacheKey] = null;
                            setValidatedPreviewUrl(null);
                        }
                    } catch {
                        previewCache.current[cacheKey] = null;
                        setValidatedPreviewUrl(null);
                    }
                } else if (cleanedName) {
                    // Set but no number: Name [Set] -> Fetch all variations
                    setValidatedPreviewUrl(null);

                    if (variationsCache.current[cacheKey] !== undefined) {
                        setSetVariations(variationsCache.current[cacheKey]);
                        return;
                    }

                    try {
                        // Fetch all prints for this card in this set
                        const searchUrl = `https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(cleanedName)}"+set:${encodeURIComponent(set)}+unique:prints&order=released`;
                        const res = await fetch(searchUrl);
                        if (res.ok) {
                            const data = await res.json();
                            if (data.data && data.data.length > 0) {
                                const vars = data.data.map((card: RawScryfallCard) => ({
                                    name: card.name,
                                    set: card.set,
                                    setName: card.set_name,
                                    number: card.collector_number,
                                    imageUrls: getImages(card),
                                    // Add other required fields with defaults/nulls as we only need this for display/selection
                                    lang: card.lang,
                                    cmc: card.cmc,
                                    type_line: card.type_line,
                                    rarity: card.rarity,
                                } as ScryfallCard));
                                variationsCache.current[cacheKey] = vars;
                                setSetVariations(vars);
                            } else {
                                variationsCache.current[cacheKey] = [];
                                setSetVariations([]);
                            }
                        } else {
                            variationsCache.current[cacheKey] = [];
                            setSetVariations([]);
                        }
                    } catch {
                        // Ignore errors for variations
                        variationsCache.current[cacheKey] = [];
                        setSetVariations([]);
                    }
                } else {
                    setSetVariations([]);
                    setValidatedPreviewUrl(null);
                }

            } else {
                // No set. Simple query.
                // If it's in suggestions, we assume it's valid (handled by autocomplete).
                // If NOT in suggestions, we need to validate it.
                if (cleanedName && cleanedName.length >= 2) {
                    if (previewCache.current[cacheKey] !== undefined) {
                        setValidatedPreviewUrl(previewCache.current[cacheKey]);
                        setSetVariations([]);
                        return;
                    }

                    try {
                        const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cleanedName)}`);
                        if (res.ok) {
                            const data = await res.json();
                            // If we have a number but no set, we can't really guarantee it matches, 
                            // but at least the name is valid. 
                            // If the user typed "Mountain {273}", cleanedName is "Mountain".
                            // We show the default Mountain.
                            const url = data.image_uris?.png || data.image_uris?.large || data.image_uris?.normal || null;
                            previewCache.current[cacheKey] = url;
                            setValidatedPreviewUrl(url);
                        } else {
                            previewCache.current[cacheKey] = null;
                            setValidatedPreviewUrl(null);
                        }
                    } catch {
                        previewCache.current[cacheKey] = null;
                        setValidatedPreviewUrl(null);
                    }
                } else {
                    setValidatedPreviewUrl(null);
                }
                setSetVariations([]);
            }
        };

        const timeoutId = setTimeout(validatePreview, 500); // Debounce
        return () => clearTimeout(timeoutId);
    }, [query]);

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

    const shouldLoop = displaySuggestions.length >= 10;

    // Sync Swiper with hoveredIndex from autocomplete
    useEffect(() => {
        // Track suggestions changes for re-mount detection
        prevSuggestionsRef.current = suggestions;

        if (swiperRef.current && hoveredIndex !== null && !swiperRef.current.destroyed) {
            const currentIndex = shouldLoop
                ? swiperRef.current.realIndex
                : swiperRef.current.activeIndex;

            if (currentIndex !== hoveredIndex) {
                // Always use speed 0 for programmatic slides to avoid bounce
                const speed = 0;
                // Set flag to prevent onSlideChange from triggering state update
                isProgrammaticSlideRef.current = true;
                if (shouldLoop) {
                    swiperRef.current.slideToLoop(hoveredIndex, speed);
                } else {
                    swiperRef.current.slideTo(hoveredIndex, speed);
                }
                // Clear flag immediately for instant transitions
                isProgrammaticSlideRef.current = false;
            }
        }
    }, [hoveredIndex, suggestions, shouldLoop]);

    const handleToggleResultsList = (e?: React.MouseEvent | React.TouchEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        setShowResultsList(!showResultsList);
    };

    const handleAddCurrentCard = (indexOverride?: number) => {
        const idx = indexOverride ?? hoveredIndex;
        if (idx !== null && displaySuggestions[idx]) {
            // Use quotes to force exact match search
            onSelectCard(displaySuggestions[idx].name);
            handleClear();
            onClose();
        } else if (query && displaySuggestions.length === 0) {
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
                        <div className="flex justify-center min-h-[300px] landscape:min-h-0">
                            {suggestions.length > 0 ? (
                                <div className="w-full relative flex flex-col items-center">
                                    <div className="w-full landscape:w-[85%] lg:landscape:w-full h-[50vh] landscape:h-[40vh] md:landscape:h-[50vh] flex items-center">
                                        <Swiper
                                            // Force re-mount when loop mode changes to prevent state corruption
                                            key={shouldLoop ? 'loop' : 'no-loop'}
                                            effect={'coverflow'}
                                            grabCursor={true}
                                            centeredSlides={true}
                                            slidesPerView={'auto'}
                                            slideToClickedSlide={true}
                                            loop={shouldLoop}
                                            loopAdditionalSlides={shouldLoop ? 4 : undefined}
                                            spaceBetween={0}
                                            initialSlide={hoveredIndex ?? 0}
                                            coverflowEffect={{
                                                rotate: 0,
                                                stretch: 0,
                                                depth: 300,
                                                modifier: 1,
                                                slideShadows: false,
                                                scale: 0.85,
                                            }}
                                            mousewheel={{
                                                sensitivity: 4,
                                            }}
                                            speed={150}
                                            freeMode={{
                                                enabled: true,
                                                sticky: false,
                                                momentum: true,
                                                momentumRatio: 0.5,
                                                momentumVelocityRatio: 0.5,
                                                momentumBounce: false,
                                            }}
                                            modules={[EffectCoverflow, Mousewheel, FreeMode]}
                                            onSwiper={(swiper) => {
                                                swiperRef.current = swiper;
                                            }}
                                            onSetTranslate={(swiper) => {
                                                // Debounced snap: triggers 50ms after last translate change
                                                // This ensures snap happens after momentum ends
                                                if (snapDebounceRef.current) {
                                                    clearTimeout(snapDebounceRef.current);
                                                }
                                                snapDebounceRef.current = setTimeout(() => {
                                                    swiper.slideToClosest(0);
                                                }, 50);
                                            }}
                                            onTouchStart={(swiper, event) => {
                                                // Capture the card under initial touch/click BEFORE any animation
                                                // This is used for double-click to ensure we add the right card
                                                const touchX = 'touches' in event
                                                    ? (event as TouchEvent).touches[0]?.clientX
                                                    : (event as MouseEvent).clientX;

                                                if (touchX === undefined) return;

                                                const slides = swiper.slides;
                                                for (let i = 0; i < slides.length; i++) {
                                                    const slideEl = slides[i];
                                                    const rect = slideEl.getBoundingClientRect();
                                                    if (touchX >= rect.left && touchX <= rect.right) {
                                                        const dataIndex = slideEl.getAttribute('data-swiper-slide-index');
                                                        const realIndex = dataIndex !== null ? parseInt(dataIndex, 10) : i;
                                                        lastClickedIndexRef.current = realIndex;
                                                        break;
                                                    }
                                                }
                                            }}
                                            onClick={(swiper, event) => {
                                                // Find which slide contains the click by checking each slide's bounding rect
                                                const clickX = 'touches' in event
                                                    ? (event as TouchEvent).touches[0]?.clientX ?? (event as TouchEvent).changedTouches[0]?.clientX
                                                    : (event as MouseEvent).clientX;
                                                if (clickX === undefined) return;

                                                const slides = swiper.slides;
                                                for (let i = 0; i < slides.length; i++) {
                                                    const slideEl = slides[i];
                                                    const rect = slideEl.getBoundingClientRect();

                                                    if (clickX >= rect.left && clickX <= rect.right) {
                                                        const dataIndex = slideEl.getAttribute('data-swiper-slide-index');
                                                        const realIndex = dataIndex !== null ? parseInt(dataIndex, 10) : i;

                                                        if (dataIndex !== null) {
                                                            // Loop mode
                                                            if (realIndex !== swiper.realIndex) {
                                                                swiper.slideToLoop(realIndex, 0);
                                                            }
                                                        } else {
                                                            // Non-loop mode
                                                            if (i !== swiper.activeIndex) {
                                                                swiper.slideTo(i, 0);
                                                            }
                                                        }
                                                        break;
                                                    }
                                                }
                                            }}
                                            onSlideChange={(swiper) => {
                                                const newIndex = shouldLoop ? swiper.realIndex : swiper.activeIndex;
                                                // Skip state update if this is a programmatic slide change
                                                if (isProgrammaticSlideRef.current) {
                                                    return;
                                                }
                                                if (newIndex !== hoveredIndex && newIndex >= 0 && newIndex < displaySuggestions.length) {
                                                    setHoveredIndex(newIndex);
                                                }
                                            }}
                                            onSlideChangeTransitionEnd={() => {
                                                // Reset flag after any slide transition completes
                                                isProgrammaticSlideRef.current = false;
                                            }}
                                            onDoubleClick={() => {
                                                // Use the card index from onTouchStart, before animation shifted positions
                                                if (lastClickedIndexRef.current !== null) {
                                                    handleAddCurrentCard(lastClickedIndexRef.current);
                                                }
                                            }}
                                            onDoubleTap={() => {
                                                // Use the card index from onTouchStart, before animation shifted positions
                                                if (lastClickedIndexRef.current !== null) {
                                                    handleAddCurrentCard(lastClickedIndexRef.current);
                                                }
                                            }}
                                            watchSlidesProgress={true}
                                            className="w-full h-full overflow-hidden"
                                        >
                                            {displaySuggestions.map((suggestion, index) => (
                                                <SwiperSlide key={`${suggestion}-${index}`} className="!w-[75%] sm:!w-[400px] landscape:!w-[30vh] sm:landscape:!w-[30vh] md:landscape:!w-[36vh] h-full">
                                                    {({ isActive, isPrev, isNext }) => {
                                                        const isPriority = isActive || isPrev || isNext;
                                                        return (
                                                            <div
                                                                className={`transition-all duration-300 p-1 h-full flex items-center justify-center ${isActive ? 'brightness-100' : 'brightness-60'}`}
                                                                onDoubleClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleAddCurrentCard();
                                                                }}
                                                                onTouchEnd={(e) => {
                                                                    const now = Date.now();
                                                                    if (now - (lastTapRef.current || 0) < 300) {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        handleAddCurrentCard();
                                                                    }
                                                                    lastTapRef.current = now;
                                                                }}
                                                            >
                                                                <img
                                                                    src={suggestion.imageUrls?.[0] || getScryfallImageUrl(suggestion.name)}
                                                                    alt={suggestion.name}
                                                                    loading={isPriority ? "eager" : "lazy"}
                                                                    fetchPriority={isActive ? "high" : "auto"}
                                                                    className="h-auto w-auto max-h-[50vh] landscape:max-h-[40vh] md:landscape:max-h-[50vh] max-w-full mx-auto rounded-[4.75%] shadow-xl object-contain select-none"
                                                                    draggable="false"
                                                                />
                                                            </div>
                                                        );
                                                    }}
                                                </SwiperSlide>
                                            ))}
                                        </Swiper>
                                    </div>

                                    {/* 1/N Indicator Pill */}
                                    <div className="mt-4 h-8 flex items-center justify-center w-full">
                                        <button
                                            onClick={(e) => {
                                                handleToggleResultsList(e);
                                            }}
                                            className="inline-flex items-center px-3 py-1 rounded-full bg-gray-200 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                        >
                                            {(hoveredIndex ?? 0) + 1} / {suggestions.length}
                                            <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center w-full px-4">
                                    <div className="w-full flex flex-col justify-center items-center h-[50vh] landscape:h-[40vh] md:landscape:h-[50vh] text-gray-400 dark:text-gray-500">
                                        <img src="/logo.svg" alt="Proxxied Logo" className="w-24 h-24 mb-4 opacity-50" />
                                        <p className="text-sm font-medium text-center">Search for a card to preview.<br />Supports <a href="https://scryfall.com/docs/syntax" target="_blank" rel="noopener noreferrer" className="underline text-blue-500">Scryfall syntax</a>.</p>
                                    </div>
                                    {/* Spacer to match 1/N indicator height and margin exactly */}
                                    <div className="mt-4 h-8 flex items-center justify-center w-full invisible pointer-events-none" aria-hidden="true">
                                        <button className="inline-flex items-center px-3 py-1 rounded-full bg-gray-200 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" disabled tabIndex={-1}>
                                            1 / 1
                                            <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                    {/* Results List Overlay */}
                    {showResultsList && (
                        <div
                            className="absolute inset-y-0 left-0 w-full sm:w-1/3 sm:left-1/2 sm:-translate-x-1/2 bg-white dark:bg-gray-800 z-20 flex flex-col sm:border-x sm:border-gray-200 dark:sm:border-gray-700 shadow-2xl"
                        >
                            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 shrink-0">
                                <h4 className="font-medium text-gray-700 dark:text-gray-200">
                                    {suggestions.length} Results
                                </h4>
                                <button
                                    onClick={handleToggleResultsList}
                                    className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                                >
                                    Close List
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2">
                                {suggestions.length > 0 ? (
                                    <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                                        {suggestions.map((suggestion, index) => (
                                            <li
                                                key={index}
                                                id={`result-item-${index}`}
                                                onClick={() => {
                                                    setHoveredIndex(index);
                                                    setShowResultsList(false);
                                                }}
                                                className={`p-3 rounded-lg cursor-pointer transition-colors flex items-center justify-between ${hoveredIndex === index
                                                    ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                                                    : "hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-200"
                                                    }`}
                                            >
                                                <span>{suggestion}</span>
                                                {hoveredIndex === index && (
                                                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                                        <p>No results found</p>
                                    </div>
                                )}
                            </div>
                        </div>
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
