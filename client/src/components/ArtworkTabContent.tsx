import { useRef, useEffect, useState } from "react";
import { Button, Checkbox, Label } from "flowbite-react";
import { Search } from "lucide-react";
import { CardbackLibrary } from "./CardbackLibrary";
import { ArtworkGrid } from "./ArtworkGrid";
import type { CardOption } from "../../../shared/types";
import { isCardbackId, type CardbackOption } from "@/helpers/cardbackLibrary";

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
        imageUrls: string[] | undefined;
        id: string | undefined;
        processedDisplayUrl: string | null;
    };
    zoomLevel: number;
    isGettingMore: boolean;
    onOpenSearch: () => void;
    onSelectCardback: (id: string, name: string) => void;
    onSetAsDefaultCardback: (id: string, name: string) => void;
    onSelectArtwork: (url: string) => void;
    onGetMorePrints: () => void;
    onClose: () => void;
    onRequestDelete: (cardbackId: string, cardbackName: string) => void;
    onExecuteDelete: (cardbackId: string) => Promise<void>;
}

/**
 * The Artwork tab content - search, cardback toggle, apply-to-all, and image grids.
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
    filteredImageUrls,
    displayData,
    zoomLevel,
    isGettingMore,
    onOpenSearch,
    onSelectCardback,
    onSetAsDefaultCardback,
    onSelectArtwork,
    onGetMorePrints,
    onClose,
    onRequestDelete,
    onExecuteDelete,
}: ArtworkTabContentProps) {
    const gridRef = useRef<HTMLDivElement>(null);
    const zoomRef = useRef(zoomLevel);

    useEffect(() => {
        zoomRef.current = zoomLevel;
    }, [zoomLevel]);

    // Pinch-to-zoom handling
    const [localZoom, setLocalZoom] = useState(zoomLevel);
    useEffect(() => {
        setLocalZoom(zoomLevel);
    }, [zoomLevel]);

    useEffect(() => {
        const container = gridRef.current;
        if (!container) return;

        let initialDistance = 0;
        let initialZoom = 1;

        const getDistance = (touches: TouchList) => {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            return Math.sqrt(dx * dx + dy * dy);
        };

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                e.stopPropagation();
                initialDistance = getDistance(e.touches);
                initialZoom = zoomRef.current;
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                e.stopPropagation();
                const currentDistance = getDistance(e.touches);
                if (initialDistance > 0) {
                    const scale = currentDistance / initialDistance;
                    const newZoom = Math.min(Math.max(0.5, initialZoom * scale), 3);
                    setLocalZoom(newZoom);
                }
            }
        };

        container.addEventListener("touchstart", handleTouchStart, { passive: false, capture: true });
        container.addEventListener("touchmove", handleTouchMove, { passive: false, capture: true });

        return () => {
            container.removeEventListener("touchstart", handleTouchStart, { capture: true });
            container.removeEventListener("touchmove", handleTouchMove, { capture: true });
        };
    }, []);

    // Use isCardbackId to detect if the back card is using a cardback from the library
    // (vs a custom image like DFC back or "forest on back of mountain")
    const isUsingCardbackLibrary = linkedBackCard?.imageId ? isCardbackId(linkedBackCard.imageId) : false;
    const showCardbackButton = selectedFace === 'back' && !isDFC && linkedBackCard && !isUsingCardbackLibrary && !showCardbackLibrary;
    const showCardbackLibraryGrid = selectedFace === 'back' && !isDFC && !previewCardData && (!linkedBackCard || isUsingCardbackLibrary || showCardbackLibrary);
    const showArtworkGrid = selectedFace === 'front' || isDFC || (linkedBackCard && !isUsingCardbackLibrary && !showCardbackLibrary) || (selectedFace === 'back' && !!previewCardData);

    return (
        <div className="flex flex-col h-[65vh]">
            <div className="flex-none bg-white dark:bg-gray-700 p-6 pb-0 z-10">
                <div className="mb-4 flex gap-2">
                    <Button color="blue" className="flex-1" onClick={onOpenSearch}>
                        <Search className="mr-2 h-4 w-4" />
                        Search for a different card...
                    </Button>
                    {showCardbackButton && (
                        <Button
                            color="light"
                            onClick={() => setShowCardbackLibrary(true)}
                            title="Use a cardback from the library instead"
                        >
                            <CardbackIcon />
                            Use Cardback
                        </Button>
                    )}
                </div>
                {modalCard && (
                    <div className="flex items-center gap-2 mb-4">
                        <Checkbox
                            id="apply-to-all"
                            checked={applyToAll}
                            onChange={(e) => setApplyToAll(e.target.checked)}
                            className="size-5"
                        />
                        <Label htmlFor="apply-to-all" className="text-base">
                            Apply to all cards named "{selectedFace === 'back' ? tabLabels.back : tabLabels.front}"
                        </Label>
                    </div>
                )}
            </div>

            {modalCard && (
                <div
                    className="flex-grow overflow-y-auto p-6 pt-0"
                    style={{ touchAction: "pan-x pan-y" }}
                    ref={gridRef}
                >
                    <div
                        className="grid grid-cols-2 md:grid-cols-3 gap-4"
                        style={{ zoom: localZoom }}
                    >
                        {showCardbackLibraryGrid && (
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
                        )}

                        {showArtworkGrid && (
                            <ArtworkGrid
                                imageUrls={filteredImageUrls ?? displayData.imageUrls ?? []}
                                selectedId={displayData.id}
                                processedDisplayUrl={displayData.processedDisplayUrl}
                                onSelectArtwork={onSelectArtwork}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Hide Get All Prints button when showing cardback library - cardbacks don't have prints */}
            {modalCard && !showCardbackLibraryGrid && (
                <div className="flex-none p-6 pt-4 bg-white dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 z-10">
                    <Button
                        className="w-full"
                        color="blue"
                        size="xl"
                        onClick={onGetMorePrints}
                        disabled={isGettingMore}
                    >
                        {isGettingMore ? "Loading prints..." : "Get All Prints"}
                    </Button>
                </div>
            )}
        </div>
    );
}
