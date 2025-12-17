import { useRef, useEffect } from "react";
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCoverflow, Mousewheel, FreeMode } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';
import type { ScryfallCard } from "../../../../shared/types";

// Import Swiper styles
import 'swiper/css';
import 'swiper/css/effect-coverflow';

type Props = {
    suggestions: string[];
    displaySuggestions: ScryfallCard[];
    hoveredIndex: number | null;
    setHoveredIndex: (index: number) => void;
    shouldLoop: boolean;
    getScryfallImageUrl: (name: string) => string;
    onAddCard: (indexOverride?: number) => void;
    onToggleResultsList: (e?: React.MouseEvent | React.TouchEvent) => void;
    originalLength?: number;
};

export function SearchCarousel({
    suggestions,
    displaySuggestions,
    hoveredIndex,
    setHoveredIndex,
    shouldLoop,
    getScryfallImageUrl,
    onAddCard,
    onToggleResultsList,
    originalLength,
}: Props) {
    const swiperRef = useRef<SwiperType | null>(null);
    const prevSuggestionsRef = useRef(suggestions);
    const isProgrammaticSlideRef = useRef(false);
    const lastClickedIndexRef = useRef<number | null>(null);
    const snapDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const totalItems = originalLength ?? displaySuggestions.length;

    // Sync Swiper with hoveredIndex from autocomplete
    useEffect(() => {
        prevSuggestionsRef.current = suggestions;

        if (swiperRef.current && hoveredIndex !== null && !swiperRef.current.destroyed) {
            const currentIndex = shouldLoop
                ? swiperRef.current.realIndex
                : swiperRef.current.activeIndex;

            // Check against modulo index to handle duplicates
            const normalizedCurrent = currentIndex % totalItems;
            const normalizedHovered = hoveredIndex % totalItems;

            if (normalizedCurrent !== normalizedHovered) {
                const speed = 0;
                isProgrammaticSlideRef.current = true;
                if (shouldLoop) {
                    swiperRef.current.slideToLoop(hoveredIndex, speed);
                } else {
                    swiperRef.current.slideTo(hoveredIndex, speed);
                }
                isProgrammaticSlideRef.current = false;
            }
        }
    }, [hoveredIndex, suggestions, shouldLoop, totalItems]);

    return (
        <div className="flex justify-center min-h-[300px] landscape:min-h-0">
            {displaySuggestions.length > 0 ? (
                <div className="w-full relative flex flex-col items-center">
                    <div className="w-full landscape:w-[85%] lg:landscape:w-full h-[50vh] landscape:h-[40vh] md:landscape:h-[50vh] flex items-center">
                        <Swiper
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
                                if (snapDebounceRef.current) {
                                    clearTimeout(snapDebounceRef.current);
                                }
                                snapDebounceRef.current = setTimeout(() => {
                                    swiper.slideToClosest(0);
                                }, 50);
                            }}
                            onTouchStart={(swiper, event) => {
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
                                            if (realIndex !== swiper.realIndex) {
                                                swiper.slideToLoop(realIndex, 0);
                                            }
                                        } else {
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
                                if (isProgrammaticSlideRef.current) {
                                    return;
                                }
                                // Allow selection of duplicates, parent handles meaning
                                if (newIndex !== hoveredIndex && newIndex >= 0 && newIndex < displaySuggestions.length) {
                                    setHoveredIndex(newIndex);
                                }
                            }}
                            onSlideChangeTransitionEnd={() => {
                                isProgrammaticSlideRef.current = false;
                            }}
                            onDoubleClick={() => {
                                if (lastClickedIndexRef.current !== null) {
                                    onAddCard(lastClickedIndexRef.current);
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
                            onClick={onToggleResultsList}
                            className="inline-flex items-center px-3 py-1 rounded-full bg-gray-200 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                            {((hoveredIndex ?? 0) % totalItems) + 1} / {totalItems}
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
    );
}
