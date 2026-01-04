import { useRef, useEffect, useState } from "react";
import { CardGrid } from "../common/CardGrid";
import { ArtworkGrid } from "./ArtworkGrid";

export interface ScryfallArtContentProps {
    imageUrls: string[];
    selectedId: string | undefined;
    processedDisplayUrl: string | null;
    onSelectArtwork: (url: string) => void;
    zoomLevel: number;
}

/**
 * Scryfall art content with grid layout and pinch-to-zoom support.
 * Used in ArtworkTabContent for displaying Scryfall artwork options.
 */
export function ScryfallArtContent({
    imageUrls,
    selectedId,
    processedDisplayUrl,
    onSelectArtwork,
    zoomLevel,
}: ScryfallArtContentProps) {
    const gridRef = useRef<HTMLDivElement>(null);
    const zoomRef = useRef(zoomLevel);

    // Local zoom state for pinch-to-zoom
    const [localZoom, setLocalZoom] = useState(zoomLevel);

    useEffect(() => {
        setLocalZoom(zoomLevel);
        zoomRef.current = zoomLevel;
    }, [zoomLevel]);

    // Pinch-to-zoom handling
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

    return (
        <CardGrid
            ref={gridRef}
            cardSize={localZoom}
            style={{ touchAction: "pan-x pan-y" }}
        >
            <ArtworkGrid
                imageUrls={imageUrls}
                selectedId={selectedId}
                processedDisplayUrl={processedDisplayUrl}
                onSelectArtwork={onSelectArtwork}
            />
        </CardGrid>
    );
}
