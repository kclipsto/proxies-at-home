import { useState } from "react";

export interface ArtworkGridProps {
    imageUrls: string[];
    selectedId: string | undefined;
    processedDisplayUrl: string | null;
    onSelectArtwork: (url: string) => void;
}

/**
 * Grid of selectable artwork images for a card.
 * Shows processed display URL for the currently selected artwork.
 */
export function ArtworkGrid({
    imageUrls,
    selectedId,
    processedDisplayUrl,
    onSelectArtwork,
}: ArtworkGridProps) {
    return (
        <>
            {imageUrls.map((pngUrl) => (
                <ArtworkGridItem
                    key={pngUrl}
                    url={pngUrl}
                    isSelected={selectedId === pngUrl}
                    processedDisplayUrl={processedDisplayUrl}
                    onSelect={() => onSelectArtwork(pngUrl)}
                />
            ))}
        </>
    );
}

function ArtworkGridItem({
    url,
    isSelected,
    processedDisplayUrl,
    onSelect
}: {
    url: string;
    isSelected: boolean;
    processedDisplayUrl: string | null;
    onSelect: () => void;
}) {
    const [isLoading, setIsLoading] = useState(true);
    const imageSrc = isSelected && processedDisplayUrl ? processedDisplayUrl : url;

    return (
        <div className="relative w-full" style={{ aspectRatio: '63/88' }}>
            <img
                src={imageSrc}
                loading="lazy"
                className={`absolute inset-0 w-full h-full object-cover rounded-xl border-4 cursor-pointer transition-opacity duration-300 z-10 ${isSelected ? "border-green-500" : "border-transparent"
                    } ${isLoading ? "opacity-0" : "opacity-100"}`}
                onClick={onSelect}
                onLoad={() => setIsLoading(false)}
            />
            {/* Green overlay for selected card */}
            {isSelected && !isLoading && (
                <div className="absolute inset-0 bg-green-500/20 rounded-xl pointer-events-none z-20" />
            )}
        </div>
    );
}
