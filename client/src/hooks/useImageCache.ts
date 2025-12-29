import { useRef, useEffect, useMemo } from "react";
import type { Image } from "../db";
import type { DarkenMode } from "../store/settings";
import type { CardOption } from "../../../shared/types";

/**
 * Select the appropriate display blob based on darken mode.
 */
function selectDisplayBlob(img: Image, darkenMode: DarkenMode): Blob | undefined {
    switch (darkenMode) {
        case 'none':
            return img.displayBlob;
        case 'darken-all':
            return img.displayBlobDarkenAll ?? img.displayBlobDarkened ?? img.displayBlob;
        case 'contrast-edges':
            return img.displayBlobContrastEdges ?? img.displayBlobDarkened ?? img.displayBlob;
        case 'contrast-full':
            return img.displayBlobContrastFull ?? img.displayBlobDarkened ?? img.displayBlob;
        default:
            return img.displayBlob;
    }
}

/**
 * Hook to manage object URLs for processed images with caching and revocation.
 * Supports per-card darkenMode overrides - cards with specific overrides will use
 * their override, otherwise falls back to global darkenMode.
 */
export function useImageCache(
    images: Image[],
    darkenMode: DarkenMode,
    cards?: CardOption[]
) {
    const urlCacheRef = useRef<Map<string, { blob: Blob; url: string; mode: DarkenMode }>>(new Map());
    const revocationQueueRef = useRef<string[]>([]);
    const prevResultRef = useRef<Record<string, string>>({});

    // Build a map from imageId to card for quick lookup
    // Also create a version key from overrides to detect changes
    const overridesVersion = useMemo(() => {
        if (!cards) return '';
        // Create a simple hash from all card darkenMode overrides
        return cards.map(c => `${c.imageId}:${c.overrides?.darkenMode ?? ''}`).join('|');
    }, [cards]);

    const cardsByImageId = useMemo(() => {
        const map = new Map<string, CardOption>();
        if (cards) {
            cards.forEach(card => {
                if (card.imageId) {
                    map.set(card.imageId, card);
                }
            });
        }
        return map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cards, overridesVersion]);

    const processedImageUrls: Record<string, string> = useMemo(() => {
        const urls: Record<string, string> = {};
        if (!images) return prevResultRef.current ?? {};

        const currentCache = urlCacheRef.current;
        const usedIds = new Set<string>();
        let hasChanges = false;

        images.forEach((img) => {
            // Check for per-card darkenMode override
            const card = cardsByImageId.get(img.id);
            const effectiveDarkenMode = card?.overrides?.darkenMode ?? darkenMode;
            const selectedBlob = selectDisplayBlob(img, effectiveDarkenMode);

            if (selectedBlob && selectedBlob.size > 0) {
                usedIds.add(img.id);

                const cached = currentCache.get(img.id);
                // Compare by size AND mode since a card's override may have changed
                if (cached && cached.blob.size === selectedBlob.size && cached.mode === effectiveDarkenMode) {
                    // Blob size and mode unchanged, reuse existing URL
                    urls[img.id] = cached.url;
                } else {
                    // New or changed blob - this is a real change
                    if (cached) {
                        revocationQueueRef.current.push(cached.url);
                    }
                    const newUrl = URL.createObjectURL(selectedBlob);
                    urls[img.id] = newUrl;
                    currentCache.set(img.id, { blob: selectedBlob, url: newUrl, mode: effectiveDarkenMode });
                    hasChanges = true;
                }
            }
        });

        // Clean up removed images
        for (const [id, cached] of currentCache.entries()) {
            if (!usedIds.has(id)) {
                revocationQueueRef.current.push(cached.url);
                currentCache.delete(id);
                hasChanges = true;
            }
        }

        // Only return a new object reference if something actually changed
        const prevUrls = prevResultRef.current;
        if (!hasChanges && Object.keys(urls).length === Object.keys(prevUrls).length) {
            let allSame = true;
            for (const id in urls) {
                if (urls[id] !== prevUrls[id]) {
                    allSame = false;
                    break;
                }
            }
            if (allSame) {
                return prevUrls;
            }
        }

        prevResultRef.current = urls;
        return urls;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [images, darkenMode, cardsByImageId, overridesVersion]);

    // Process revocation queue after render
    useEffect(() => {
        const queue = revocationQueueRef.current;
        if (queue.length > 0) {
            const timer = setTimeout(() => {
                queue.forEach((url) => URL.revokeObjectURL(url));
            }, 2000);
            revocationQueueRef.current = [];

            return () => clearTimeout(timer);
        }
    });

    // Cleanup on unmount
    useEffect(() => {
        const cache = urlCacheRef.current;
        return () => {
            const urlsToRevoke = Array.from(cache.values()).map((c) => c.url);
            setTimeout(() => {
                urlsToRevoke.forEach((url) => URL.revokeObjectURL(url));
            }, 5000);
            cache.clear();
        };
    }, []);

    return { processedImageUrls };
}
