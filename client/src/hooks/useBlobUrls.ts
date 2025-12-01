import { useEffect, useMemo, useRef } from "react";
import type { Image } from "../db";

export function useBlobUrls(images: Image[], darkenNearBlack: boolean) {
    const urlCacheRef = useRef<Map<string, { blob: Blob; url: string }>>(new Map());
    const revocationQueueRef = useRef<string[]>([]);

    const processedImageUrls: Record<string, string> = useMemo(() => {
        const urls: Record<string, string> = {};
        if (!images) return urls;

        const currentCache = urlCacheRef.current;
        const usedIds = new Set<string>();

        images.forEach((img) => {
            // Select appropriate blob based on darkenNearBlack setting
            const selectedBlob = darkenNearBlack ? img.displayBlobDarkened : img.displayBlob;

            if (selectedBlob && selectedBlob.size > 0) {
                usedIds.add(img.id);

                // Check if we already have a URL for this exact blob
                const cached = currentCache.get(img.id);
                if (cached && cached.blob === selectedBlob) {
                    urls[img.id] = cached.url;
                } else {
                    // Queue old URL for revocation
                    if (cached) {
                        revocationQueueRef.current.push(cached.url);
                    }
                    // Create new URL
                    const newUrl = URL.createObjectURL(selectedBlob);
                    urls[img.id] = newUrl;
                    currentCache.set(img.id, { blob: selectedBlob, url: newUrl });
                }
            }
        });

        // Clean up URLs for images that no longer exist or don't have blobs
        for (const [id, cached] of currentCache.entries()) {
            if (!usedIds.has(id)) {
                revocationQueueRef.current.push(cached.url);
                currentCache.delete(id);
            }
        }

        return urls;
    }, [images, darkenNearBlack]);

    // Process revocation queue after render
    useEffect(() => {
        const queue = revocationQueueRef.current;
        if (queue.length > 0) {
            // Small delay to ensure DOM has updated
            const timer = setTimeout(() => {
                queue.forEach((url) => URL.revokeObjectURL(url));
            }, 2000);

            // Clear the ref immediately so we don't process again
            revocationQueueRef.current = [];

            return () => clearTimeout(timer);
        }
    });

    // Cleanup on unmount
    useEffect(() => {
        const cache = urlCacheRef.current;
        return () => {
            for (const cached of cache.values()) {
                URL.revokeObjectURL(cached.url);
            }
            cache.clear();
        };
    }, []);

    return processedImageUrls;
}
