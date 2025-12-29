import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useProcessingMonitor } from "./useProcessingMonitor";
import type { ImageProcessor } from "@/helpers/imageProcessor";

// Mock dependencies
const mockShowProcessingToast = vi.fn();
const mockHideProcessingToast = vi.fn();

vi.mock("@/store/toast", () => ({
    useToastStore: {
        getState: () => ({
            showProcessingToast: mockShowProcessingToast,
            hideProcessingToast: mockHideProcessingToast,
        }),
    },
}));

const mockOnActivityChange = vi.fn();
vi.mock("@/helpers/effectCache", () => ({
    getEffectProcessor: () => ({
        onActivityChange: mockOnActivityChange,
    }),
}));

vi.mock("@/helpers/importSession", () => ({
    hasActiveSession: vi.fn().mockReturnValue(false),
    getCurrentSession: vi.fn().mockReturnValue(null),
}));

describe("useProcessingMonitor", () => {
    let mockImageProcessor: ImageProcessor;
    let imageActivityCallback: ((isActive: boolean) => void) | null = null;

    beforeEach(() => {
        vi.clearAllMocks();
        imageActivityCallback = null;

        mockImageProcessor = {
            onActivityChange: vi.fn((callback) => {
                imageActivityCallback = callback;
                return vi.fn(); // unsubscribe
            }),
        } as unknown as ImageProcessor;

        mockOnActivityChange.mockReturnValue(vi.fn()); // unsubscribe for effect processor
    });

    it("should subscribe to image processor activity changes", () => {
        renderHook(() => useProcessingMonitor(mockImageProcessor));

        expect(mockImageProcessor.onActivityChange).toHaveBeenCalledTimes(1);
    });

    it("should subscribe to effect processor activity changes", () => {
        renderHook(() => useProcessingMonitor(mockImageProcessor));

        expect(mockOnActivityChange).toHaveBeenCalledTimes(1);
    });

    it("should show toast when image processing is active", () => {
        renderHook(() => useProcessingMonitor(mockImageProcessor));

        // Simulate image processing becoming active
        if (imageActivityCallback) {
            imageActivityCallback(true);
        }

        expect(mockShowProcessingToast).toHaveBeenCalled();
    });

    it("should hide toast when image processing is inactive", () => {
        renderHook(() => useProcessingMonitor(mockImageProcessor));

        // Simulate image processing becoming inactive
        if (imageActivityCallback) {
            imageActivityCallback(false);
        }

        expect(mockHideProcessingToast).toHaveBeenCalled();
    });

    it("should unsubscribe on unmount", () => {
        const unsubscribeImage = vi.fn();
        const unsubscribeEffect = vi.fn();

        (mockImageProcessor.onActivityChange as ReturnType<typeof vi.fn>).mockReturnValue(unsubscribeImage);
        mockOnActivityChange.mockReturnValue(unsubscribeEffect);

        const { unmount } = renderHook(() => useProcessingMonitor(mockImageProcessor));

        unmount();

        expect(unsubscribeImage).toHaveBeenCalled();
        expect(unsubscribeEffect).toHaveBeenCalled();
    });
});
