import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMediaQuery } from "./useMediaQuery";

describe("useMediaQuery", () => {
    const mockMatchMedia = vi.fn();
    const mockAddEventListener = vi.fn();
    const mockRemoveEventListener = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock matchMedia
        mockMatchMedia.mockImplementation((query: string) => ({
            matches: query === "(min-width: 768px)",
            media: query,
            addEventListener: mockAddEventListener,
            removeEventListener: mockRemoveEventListener,
        }));

        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: mockMatchMedia,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should return initial match state", () => {
        const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));

        expect(result.current).toBe(true);
        expect(mockMatchMedia).toHaveBeenCalledWith("(min-width: 768px)");
    });

    it("should return false for non-matching query", () => {
        const { result } = renderHook(() => useMediaQuery("(max-width: 480px)"));

        expect(result.current).toBe(false);
    });

    it("should add event listener on mount", () => {
        renderHook(() => useMediaQuery("(min-width: 768px)"));

        expect(mockAddEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    });

    it("should remove event listener on unmount", () => {
        const { unmount } = renderHook(() => useMediaQuery("(min-width: 768px)"));

        unmount();

        expect(mockRemoveEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    });

    it("should register listener for media changes", () => {
        let capturedListener: (() => void) | null = null;

        mockMatchMedia.mockImplementation((query: string) => ({
            matches: query === "(min-width: 768px)",
            media: query,
            addEventListener: (_event: string, listener: () => void) => {
                capturedListener = listener;
            },
            removeEventListener: vi.fn(),
        }));

        renderHook(() => useMediaQuery("(min-width: 768px)"));

        // Verify listener was registered
        expect(capturedListener).not.toBeNull();
    });

    it("should handle query parameter changes", () => {
        const { result, rerender } = renderHook(
            ({ query }) => useMediaQuery(query),
            { initialProps: { query: "(min-width: 768px)" } }
        );

        expect(result.current).toBe(true);

        rerender({ query: "(max-width: 480px)" });

        expect(result.current).toBe(false);
    });
});
