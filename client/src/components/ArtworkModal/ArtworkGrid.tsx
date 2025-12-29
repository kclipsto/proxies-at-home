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
            {imageUrls.map((pngUrl, i) => {
                const isSelected = selectedId === pngUrl;
                const imageSrc = isSelected && processedDisplayUrl
                    ? processedDisplayUrl
                    : pngUrl;
                return (
                    <img
                        key={i}
                        src={imageSrc}
                        loading="lazy"
                        className={`w-full cursor-pointer border-4 rounded-xl ${isSelected ? "border-green-500" : "border-transparent"
                            }`}
                        onClick={() => onSelectArtwork(pngUrl)}
                    />
                );
            })}
        </>
    );
}
