import { useRef, useEffect, useMemo } from "react";
import type { Image } from "../db";

export function useImageCache(images: Image[], darkenNearBlack: boolean) {
    const urlCacheRef = useRef<Map<string, { blob: Blob; url: string }>>(new Map());
    const revocationQueueRef = useRef<string[]>([]);
    const prevResultRef = useRef<Record<string, string>>({});

    const processedImageUrls: Record<string, string> = useMemo(() => {
        const urls: Record<string, string> = {};
        if (!images) return prevResultRef.current;

        const currentCache = urlCacheRef.current;
        const usedIds = new Set<string>();
        let hasChanges = false;

        images.forEach((img) => {
            const selectedBlob = darkenNearBlack ? img.displayBlobDarkened : img.displayBlob;

            if (selectedBlob && selectedBlob.size > 0) {
                usedIds.add(img.id);

                const cached = currentCache.get(img.id);
                // Compare by size since Dexie may return new Blob instances for the same data
                if (cached && cached.blob.size === selectedBlob.size) {
                    // Blob size unchanged, reuse existing URL
                    urls[img.id] = cached.url;
                } else {
                    // New or changed blob - this is a real change
                    if (cached) {
                        revocationQueueRef.current.push(cached.url);
                    }
                    const newUrl = URL.createObjectURL(selectedBlob);
                    urls[img.id] = newUrl;
                    currentCache.set(img.id, { blob: selectedBlob, url: newUrl });
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
        // This prevents downstream re-renders when the images array changes but URLs don't
        const prevUrls = prevResultRef.current;
        if (!hasChanges && Object.keys(urls).length === Object.keys(prevUrls).length) {
            // Check if all URLs are the same
            let allSame = true;
            for (const id in urls) {
                if (urls[id] !== prevUrls[id]) {
                    allSame = false;
                    break;
                }
            }
            if (allSame) {
                // console.log('[PerfTrace] useImageCache: No changes, returning prevUrls');
                return prevUrls;
            }
        }

        // console.log('[PerfTrace] useImageCache: processedImageUrls updated. New keys:', Object.keys(urls).length);
        prevResultRef.current = urls;
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

