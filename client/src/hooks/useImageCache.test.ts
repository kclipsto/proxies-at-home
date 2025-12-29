import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useImageCache } from "./useImageCache";
import type { Image } from "../db";

// Mock URL.createObjectURL and revokeObjectURL
const mockObjectUrls = new Map<Blob, string>();
let urlCounter = 0;

beforeEach(() => {
    mockObjectUrls.clear();
    urlCounter = 0;

    global.URL.createObjectURL = vi.fn((blob: Blob) => {
        const url = `blob:test-${urlCounter++}`;
        mockObjectUrls.set(blob, url);
        return url;
    });

    global.URL.revokeObjectURL = vi.fn();
});

describe("useImageCache", () => {
    const createMockImage = (id: string, blobSize: number = 100): Image => ({
        id,
        displayBlob: new Blob([new Array(blobSize).fill('a').join('')]),
        displayBlobDarkened: new Blob([new Array(blobSize).fill('b').join('')]),
        refCount: 1,
    });

    describe("stable reference behavior", () => {
        it("should return stable reference when rerendering with same blob sizes", () => {
            const image1 = createMockImage("img1", 100);
            const images: Image[] = [image1];

            const { result, rerender } = renderHook(
                ({ imgs, mode }) => useImageCache(imgs, mode),
                { initialProps: { imgs: images, mode: 'none' as const } }
            );

            const firstResult = result.current.processedImageUrls;
            expect(Object.keys(firstResult)).toHaveLength(1);
            expect(firstResult["img1"]).toBeDefined();

            // Simulate Dexie returning new array with NEW Blob instances of same size
            const image1Refresh: Image = {
                ...image1,
                displayBlob: new Blob([new Array(100).fill('a').join('')]), // New instance, same size
            };

            rerender({ imgs: [image1Refresh], mode: 'none' as const });

            const secondResult = result.current.processedImageUrls;

            // Should return same reference since blob sizes match
            expect(secondResult).toBe(firstResult);
            // URL should be reused, not recreated
            expect(secondResult["img1"]).toBe(firstResult["img1"]);
        });

        it("should NOT create new URLs when blob sizes are unchanged", () => {
            const image1 = createMockImage("img1", 100);
            const images: Image[] = [image1];

            const { rerender } = renderHook(
                ({ imgs, mode }) => useImageCache(imgs, mode),
                { initialProps: { imgs: images, mode: 'none' as const } }
            );

            // First render creates one URL
            expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);

            // Simulate multiple Dexie updates with same-size blobs
            for (let i = 0; i < 5; i++) {
                const refreshedImage: Image = {
                    ...image1,
                    displayBlob: new Blob([new Array(100).fill('x').join('')]),
                };
                rerender({ imgs: [refreshedImage], mode: 'none' as const });
            }

            // Should still only have the initial URL creation
            expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
        });

        it("should create new URL when blob size changes", () => {
            const image1 = createMockImage("img1", 100);
            const images: Image[] = [image1];

            const { result, rerender } = renderHook(
                ({ imgs, mode }) => useImageCache(imgs, mode),
                { initialProps: { imgs: images, mode: 'none' as const } }
            );

            const firstUrl = result.current.processedImageUrls["img1"];
            expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);

            // Change blob size - this should trigger new URL
            const changedImage: Image = {
                ...image1,
                displayBlob: new Blob([new Array(200).fill('a').join('')]), // Different size
            };

            rerender({ imgs: [changedImage], mode: 'none' as const });

            const secondUrl = result.current.processedImageUrls["img1"];

            expect(secondUrl).not.toBe(firstUrl);
            expect(global.URL.createObjectURL).toHaveBeenCalledTimes(2);
        });
    });

    describe("image deduplication", () => {
        it("should handle multiple images with same size blobs independently", () => {
            const image1 = createMockImage("img1", 100);
            const image2 = createMockImage("img2", 100);
            const images: Image[] = [image1, image2];

            const { result } = renderHook(
                ({ imgs, mode }) => useImageCache(imgs, mode),
                { initialProps: { imgs: images, mode: 'none' as const } }
            );

            expect(Object.keys(result.current.processedImageUrls)).toHaveLength(2);
            expect(result.current.processedImageUrls["img1"]).toBeDefined();
            expect(result.current.processedImageUrls["img2"]).toBeDefined();
            // Each should have unique URL even with same size
            expect(result.current.processedImageUrls["img1"]).not.toBe(
                result.current.processedImageUrls["img2"]
            );
        });
    });

    describe("darkenMode toggle", () => {
        it("should use correct blob based on darkenMode", () => {
            const image: Image = {
                id: "img1",
                displayBlob: new Blob([new Array(100).fill('a').join('')]),
                displayBlobContrastEdges: new Blob([new Array(150).fill('b').join('')]), // Different size
                refCount: 1,
            };

            type Props = { imgs: Image[]; mode: 'none' | 'darken-all' | 'contrast-edges' | 'contrast-full' };
            const { result, rerender } = renderHook(
                ({ imgs, mode }: Props) => useImageCache(imgs, mode),
                { initialProps: { imgs: [image], mode: 'none' } as Props }
            );

            const normalUrl = result.current.processedImageUrls["img1"];

            rerender({ imgs: [image], mode: 'contrast-edges' });

            const darkenedUrl = result.current.processedImageUrls["img1"];

            // Should be different URLs since different blobs are used
            expect(darkenedUrl).not.toBe(normalUrl);
        });
    });
});
