import { useRef, useMemo, useEffect } from "react";
import type { Image } from "../db";

export function useImageCache(images: Image[], darkenNearBlack: boolean) {
    const urlCacheRef = useRef<Map<string, { blob: Blob; url: string }>>(new Map());
    const revocationQueueRef = useRef<string[]>([]);

    const processedImageUrls: Record<string, string> = useMemo(() => {
        const urls: Record<string, string> = {};
        if (!images) return urls;

        const currentCache = urlCacheRef.current;
        const usedIds = new Set<string>();

        images.forEach((img) => {
            const selectedBlob = darkenNearBlack ? img.displayBlobDarkened : img.displayBlob;

            if (selectedBlob && selectedBlob.size > 0) {
                usedIds.add(img.id);

                const cached = currentCache.get(img.id);
                if (cached && cached.blob === selectedBlob) {
                    urls[img.id] = cached.url;
                } else {
                    if (cached) {
                        revocationQueueRef.current.push(cached.url);
                    }
                    const newUrl = URL.createObjectURL(selectedBlob);
                    urls[img.id] = newUrl;
                    currentCache.set(img.id, { blob: selectedBlob, url: newUrl });
                }
            }
        });

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
