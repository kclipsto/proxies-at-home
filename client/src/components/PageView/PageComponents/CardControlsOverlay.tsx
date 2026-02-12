/**
 * CardControlsOverlay - HTML overlay controls for PixiJS canvas cards
 * 
 * Renders selection checkboxes, drag handles, and flip buttons
 * positioned over cards rendered by PixiVirtualCanvas.
 */

import { memo, useRef, useCallback, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { Check, RefreshCw } from "lucide-react";
import { useArtworkModalStore } from "@/store";
import { useSelectionStore } from "@/store/selection";
import { PlaceholderCard } from "@/components/common";
import type { CardOption } from "@/types";

export interface CardControlLayout {
    card: CardOption;
    globalIndex: number;
    screenX: number;
    screenY: number;
    width: number;
    height: number;
    hasImage: boolean;
}

interface CardControlsOverlayProps {
    cardLayouts: CardControlLayout[];
    allCards: CardOption[]; // All navigable cards for modal navigation
    containerWidth: number;
    containerHeight: number;
    scrollContainerRef: React.RefObject<HTMLDivElement | null>; // Direct ref for synchronous scroll sync
    mobile?: boolean;
    disabled?: boolean;
    zoom: number;
    onRangeSelect?: (index: number) => void;
    setContextMenu: (menu: {
        visible: boolean;
        x: number;
        y: number;
        cardUuid: string;
    }) => void;
}

/**
 * Single card control overlay - handles one card's interactive controls
 */
const CardControl = memo(function CardControl({
    card,
    globalIndex,
    screenX,
    screenY,
    width,
    height,
    hasImage,
    allCards,
    mobile,
    disabled,
    zoom,
    onRangeSelect,
    setContextMenu,
}: CardControlLayout & {
    allCards: CardOption[];
    mobile?: boolean;
    disabled?: boolean;
    zoom: number;
    onRangeSelect?: (index: number) => void;
    setContextMenu: (menu: {
        visible: boolean;
        x: number;
        y: number;
        cardUuid: string;
    }) => void;
}) {
    const openArtworkModal = useArtworkModalStore((state) => state.openModal);

    // Selection state
    const isSelected = useSelectionStore((state) => state.selectedCards.has(card.uuid));
    const toggleSelection = useSelectionStore((state) => state.toggleSelection);
    const hasAnySelection = useSelectionStore((state) => state.selectedCards.size > 0);
    const isFlipped = useSelectionStore((state) => state.flippedCards.has(card.uuid));
    const toggleFlip = useSelectionStore((state) => state.toggleFlip);

    // Sortable setup for drag/drop reordering
    // On mobile, drag is enabled via long-press (TouchSensor has 200ms delay)
    const { attributes, listeners, setNodeRef, transition, isDragging } = useSortable({
        id: card.uuid,
        disabled: disabled,
    });

    // Don't apply useSortable transform - positions are calculated from localCards
    // which updates dynamically during drag. Applying transform would cause double movement.
    const style = {
        transition,
    };

    const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleCardClick = useCallback((e: React.MouseEvent) => {
        // Shift+click for range selection
        if (e.shiftKey && onRangeSelect) {
            e.preventDefault();
            e.stopPropagation();
            onRangeSelect(globalIndex);
            return;
        }

        // Ctrl/Cmd+click for multi-select
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            toggleSelection(card.uuid, globalIndex);
            return;
        }

        // Detect if this is an MPC card to set initial art source
        const isMpcCard = card.imageId?.includes('/api/cards/images/mpc');
        const initialArtSource = isMpcCard ? 'mpc' as const : undefined;

        if (mobile) {
            if (clickTimeoutRef.current) {
                clearTimeout(clickTimeoutRef.current);
                clickTimeoutRef.current = null;
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({
                    visible: true,
                    x: e.clientX,
                    y: e.clientY,
                    cardUuid: card.uuid,
                });
            } else {
                clickTimeoutRef.current = setTimeout(() => {
                    openArtworkModal({
                        card,
                        index: globalIndex,
                        allCards,
                        initialTab: isSelected ? 'settings' : 'artwork',
                        initialFace: isFlipped ? 'back' : 'front',
                        initialArtSource,
                    });
                    clickTimeoutRef.current = null;
                }, 300);
            }
        } else {
            openArtworkModal({
                card,
                index: globalIndex,
                allCards,
                initialTab: isSelected ? 'settings' : 'artwork',
                initialFace: isFlipped ? 'back' : 'front',
                initialArtSource,
            });
        }
    }, [allCards, card, globalIndex, isFlipped, isSelected, mobile, onRangeSelect, openArtworkModal, setContextMenu, toggleSelection]);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        if (!mobile) {
            setContextMenu({
                visible: true,
                x: e.clientX,
                y: e.clientY,
                cardUuid: card.uuid,
            });
        }
    }, [card.uuid, mobile, setContextMenu]);

    const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (e.shiftKey && onRangeSelect) {
            onRangeSelect(globalIndex);
        } else {
            toggleSelection(card.uuid, globalIndex);
        }
    }, [card.uuid, globalIndex, onRangeSelect, toggleSelection]);

    const handleFlipClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        toggleFlip(card.uuid);
    }, [card.uuid, toggleFlip]);

    return (
        <div
            ref={setNodeRef}
            {...attributes}
            data-dnd-sortable-item={card.uuid}
            {...listeners}
            className={`absolute group ${isDragging ? 'opacity-0 z-50' : ''} ${mobile ? 'touch-action-none' : ''}`}
            style={{
                left: screenX,
                top: screenY,
                width,
                height,
                pointerEvents: 'auto',
                ...style,
            }}
            onClick={handleCardClick}
            onContextMenu={handleContextMenu}
        >
            {/* Controls container - Scaled to zoom so buttons grow/shrink with card */}
            <div
                className="absolute top-0 left-0 pointer-events-none"
                style={{
                    width: width / zoom,
                    height: height / zoom,
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top left',
                }}
            >
                {/* Inner Overlay content - relative to unzoomed size */}
                <div className="absolute inset-0">
                    {/* Loading spinner or error state - shown when image is not yet loaded */}
                    {!hasImage && (
                        <PlaceholderCard
                            name={card.name}
                            error={card.lookupError}
                            onErrorClick={(e) => {
                                e.stopPropagation();
                                openArtworkModal({
                                    card,
                                    index: globalIndex,
                                    allCards,
                                    initialTab: 'artwork',
                                    initialOpenAdvancedSearch: true,
                                });
                            }}
                        />
                    )}

                    {/* Selection Overlay - visible when card is selected */}
                    {isSelected && (
                        <div className="absolute inset-0 bg-blue-500/30 pointer-events-none z-10 border-4 border-blue-500" />
                    )}

                    {/* Selection Checkbox */}
                    <div
                        className={`absolute left-1 top-1 ${mobile ? 'w-7 h-7' : 'w-5 h-5'} rounded border-2 flex items-center justify-center cursor-pointer z-20 transition-opacity pointer-events-auto ${isSelected
                            ? 'bg-blue-600 border-blue-600 opacity-100'
                            : hasAnySelection
                                ? 'bg-white/80 border-gray-400 opacity-100'
                                : mobile
                                    ? 'bg-white/80 border-gray-400 opacity-50'
                                    : 'bg-white/80 border-gray-400 opacity-0 group-hover:opacity-100'
                            }`}
                        onClick={handleCheckboxClick}
                        title="Select card"
                    >
                        {isSelected && <Check className={`${mobile ? 'w-4 h-4' : 'w-3.5 h-3.5'} text-white`} />}
                    </div>

                    {/* ↻ Flip Button */}
                    <div
                        data-testid="flip-button"
                        className={`absolute ${mobile ? 'right-[4px] top-1 w-8 h-8' : 'right-[4px] top-1 w-6 h-6'} rounded-sm flex items-center justify-center cursor-pointer group-hover:opacity-100 select-none z-20 transition-colors pointer-events-auto ${isFlipped
                            ? 'bg-blue-500 text-white opacity-100'
                            : 'bg-white text-gray-700 opacity-50 hover:bg-gray-100'
                            }`}
                        title={isFlipped ? "Show front" : "Show back"}
                        onClick={handleFlipClick}
                    >
                        <RefreshCw className={`${mobile ? 'w-5 h-5' : 'w-3.5 h-3.5'}`} />
                    </div>
                </div>
            </div>
        </div>
    );
});

/**
 * CardControlsOverlay - Container for all card control overlays
 * Renders positioned controls over the PixiJS canvas
 */
export const CardControlsOverlay = memo(function CardControlsOverlay({
    cardLayouts,
    allCards,
    containerWidth,
    containerHeight,
    scrollContainerRef,
    mobile,
    disabled,
    zoom,
    onRangeSelect,
    setContextMenu,
}: CardControlsOverlayProps) {
    const innerRef = useRef<HTMLDivElement>(null);

    // Synchronous scroll handling - bypasses React render cycle for perfect sync
    useEffect(() => {
        const scrollContainer = scrollContainerRef.current;
        const inner = innerRef.current;
        if (!scrollContainer || !inner) return;

        const handleScroll = () => {
            inner.style.transform = `translateY(${-scrollContainer.scrollTop}px)`;
        };

        // Initial position
        handleScroll();

        scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, [scrollContainerRef]);

    return (
        <div
            className="absolute top-0 left-0 pointer-events-none overflow-hidden"
            style={{
                width: containerWidth,
                height: containerHeight,
            }}
        >
            {/* Inner container with scroll transform - synced directly to scroll container */}
            <div ref={innerRef}>
                {cardLayouts.map((layout) => (
                    <CardControl
                        key={layout.card.uuid}
                        {...layout}
                        allCards={allCards}
                        mobile={mobile}
                        disabled={disabled}
                        zoom={zoom}
                        onRangeSelect={onRangeSelect}
                        setContextMenu={setContextMenu}
                    />
                ))}
            </div>
        </div>
    );
});

export default CardControlsOverlay;
