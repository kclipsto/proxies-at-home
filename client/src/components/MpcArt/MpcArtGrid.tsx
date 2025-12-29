import { useRef, useCallback } from "react";
import type { MpcAutofillCard } from "@/helpers/mpcAutofillApi";

export interface MpcArtGridProps {
    cards: MpcAutofillCard[];
    onSelectCard: (card: MpcAutofillCard) => void;
    isLoading?: boolean;
    onFilterSource?: (source: string) => void;
    onFilterTag?: (tag: string) => void;
    onFilterDpi?: (dpi: number) => void;
    activeMinDpi?: number;
    activeSources?: Set<string>;
    activeTags?: Set<string>;
}

/**
 * Grid of MPC Autofill card art with source attribution
 */
export function MpcArtGrid({ cards, onSelectCard, isLoading, onFilterSource, onFilterTag, onFilterDpi, activeMinDpi, activeSources, activeTags }: MpcArtGridProps) {
    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8 text-gray-500 dark:text-gray-400">
                <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                    <span>Searching MPC Autofill...</span>
                </div>
            </div>
        );
    }

    if (cards.length === 0) {
        return null;
    }

    return (
        <MpcArtGridContent
            cards={cards}
            onSelectCard={onSelectCard}
            onFilterSource={onFilterSource}
            onFilterTag={onFilterTag}
            onFilterDpi={onFilterDpi}
            activeMinDpi={activeMinDpi}
            activeSources={activeSources}
            activeTags={activeTags}
        />
    );
}

/** Inner component to use hooks */
function MpcArtGridContent({
    cards,
    onSelectCard,
    onFilterSource,
    onFilterTag,
    onFilterDpi,
    activeMinDpi,
    activeSources,
    activeTags,
}: Omit<MpcArtGridProps, 'isLoading'>) {
    const lastClickTime = useRef(0);

    const handleCardClick = useCallback((card: MpcAutofillCard) => {
        // Debounce rapid clicks (prevent double-click from adding multiple)
        const now = Date.now();
        if (now - lastClickTime.current < 300) {
            return;
        }
        lastClickTime.current = now;
        onSelectCard(card);
    }, [onSelectCard]);

    return (
        <>
            {cards.map((card) => (
                <div
                    key={card.identifier}
                    className="relative cursor-pointer group touch-manipulation"
                    onClick={() => handleCardClick(card)}
                >
                    <img
                        src={`https://img.mpcautofill.com/${card.identifier}-small-google_drive`}
                        alt={card.name}
                        loading="lazy"
                        className="w-full rounded-xl border-4 border-transparent group-hover:border-blue-500 transition-colors"
                        onError={(e) => {
                            // Fallback to original thumbnail URL if CDN fails
                            const target = e.target as HTMLImageElement;
                            if (!target.dataset.fallbackUsed) {
                                target.dataset.fallbackUsed = "true";
                                target.src = card.mediumThumbnailUrl || card.smallThumbnailUrl;
                            }
                        }}
                    />
                    {/* DPI Badge */}
                    <div
                        className={`absolute top-2 right-2 text-white text-xs px-2 py-1 rounded transition-all ${onFilterDpi ? 'cursor-pointer hover:scale-105 active:scale-95' : ''
                            } ${activeMinDpi && activeMinDpi > 0 && card.dpi >= activeMinDpi
                                ? 'bg-blue-600 hover:bg-blue-500'
                                : onFilterDpi
                                    ? 'bg-black/70 hover:bg-black/90'
                                    : 'bg-black/70'
                            }`}
                        onClick={(e) => {
                            if (onFilterDpi) {
                                e.stopPropagation();
                                onFilterDpi(card.dpi);
                            }
                        }}
                        title={onFilterDpi ? "Set as minimum DPI" : undefined}
                    >
                        {card.dpi} DPI
                    </div>
                    {/* Source Attribution */}
                    <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-2 rounded-b-xl opacity-0 group-hover:opacity-100 transition-opacity">
                        <div
                            className={`text-[10px] truncate max-w-full px-2 py-0.5 rounded transition-all inline-block mb-1 ${onFilterSource ? 'cursor-pointer hover:scale-105 active:scale-95' : ''
                                } ${activeSources?.has(card.sourceName)
                                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                                    : onFilterSource
                                        ? 'bg-black/60 text-white hover:bg-black/80'
                                        : 'text-white'
                                }`}
                            onClick={(e) => {
                                if (onFilterSource) {
                                    e.stopPropagation();
                                    onFilterSource(card.sourceName);
                                }
                            }}
                            title={onFilterSource ? "Add source to filter" : undefined}
                        >
                            {card.sourceName}
                        </div>
                        {card.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                                {card.tags.slice(0, 3).map((tag) => (
                                    <span
                                        key={tag}
                                        className={`text-white text-[10px] px-1.5 py-0.5 rounded transition-all ${onFilterTag ? 'cursor-pointer hover:scale-105 active:scale-95' : ''
                                            } ${activeTags?.has(tag)
                                                ? 'bg-blue-600 hover:bg-blue-500'
                                                : onFilterTag
                                                    ? 'bg-white/20 hover:bg-white/40'
                                                    : 'bg-white/20'
                                            }`}
                                        onClick={(e) => {
                                            if (onFilterTag) {
                                                e.stopPropagation();
                                                onFilterTag(tag);
                                            }
                                        }}
                                        title={onFilterTag ? "Add tag to filter" : undefined}
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </>
    );
}
