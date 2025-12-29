import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScryfallArtContent } from "./ScryfallArtContent";
// Mock dependencies
vi.mock('@/store/settings', () => ({
    useSettingsStore: vi.fn(),
}));

// Mock ArtworkGrid to simplify testing
vi.mock("./ArtworkGrid", () => ({
    ArtworkGrid: ({ imageUrls, selectedId, onSelectArtwork }: { imageUrls: string[]; selectedId: string | undefined; onSelectArtwork: (url: string) => void; }) => (
        <div data-testid="artwork-grid">
            {imageUrls.map((url: string, i: number) => (
                <img
                    key={i}
                    src={url}
                    alt={`artwork - ${i} `}
                    onClick={() => onSelectArtwork(url)}
                    data-selected={url === selectedId ? "true" : "false"}
                />
            ))}
        </div>
    ),
}));

describe("ScryfallArtContent", () => {
    const defaultProps = {
        imageUrls: ["https://example.com/art1.png", "https://example.com/art2.png"],
        selectedId: undefined,
        processedDisplayUrl: null,
        onSelectArtwork: vi.fn(),
        zoomLevel: 1,
    };

    it("should render ArtworkGrid with image urls", () => {
        render(<ScryfallArtContent {...defaultProps} />);
        expect(screen.getByTestId("artwork-grid")).toBeTruthy();
    });

    it("should handle pinch-to-zoom gestures", () => {
        const { container } = render(<ScryfallArtContent {...defaultProps} />);

        // Use a testid on the container would be better, but we can target the grid div
        const gridDiv = container.firstChild as HTMLDivElement;

        // Verify initial zoom
        expect(gridDiv.style.zoom).toBe("1");

        // Simulate touch start with 2 fingers
        fireEvent.touchStart(gridDiv, {
            touches: [
                { clientX: 0, clientY: 0 },
                { clientX: 100, clientY: 0 } // Distance 100
            ]
        });

        // Simulate touch move (pinch out - distance 200)
        fireEvent.touchMove(gridDiv, {
            touches: [
                { clientX: 0, clientY: 0 },
                { clientX: 200, clientY: 0 } // Distance 200 -> Scale 2.0 -> New Zoom 2.0
            ]
        });

        expect(gridDiv.style.zoom).toBe("2");

        // Simulate pinch in (distance 50)
        fireEvent.touchMove(gridDiv, {
            touches: [
                { clientX: 0, clientY: 0 },
                { clientX: 50, clientY: 0 } // Scale 0.5 relative to start? 
                // Logic: initialDistance was set at touchStart (100).
                // Current distance 50. Scale = 0.5. InitialZoom was 1. Result 0.5.
            ]
        });

        expect(gridDiv.style.zoom).toBe("0.5");
    });

    it("should respect min/max zoom limits", () => {
        const { container } = render(<ScryfallArtContent {...defaultProps} />);
        const gridDiv = container.firstChild as HTMLDivElement;

        // Start
        fireEvent.touchStart(gridDiv, {
            touches: [
                { clientX: 0, clientY: 0 },
                { clientX: 100, clientY: 0 }
            ]
        });

        // Massive pinch out
        fireEvent.touchMove(gridDiv, {
            touches: [
                { clientX: 0, clientY: 0 },
                { clientX: 1000, clientY: 0 } // Scale 10 -> Zoom 10 -> Max 3
            ]
        });

        expect(gridDiv.style.zoom).toBe("3");

        // Massive pinch in
        fireEvent.touchMove(gridDiv, {
            touches: [
                { clientX: 0, clientY: 0 },
                { clientX: 1, clientY: 0 } // Scale 0.01 -> Zoom 0.01 -> Min 0.5
            ]
        });

        expect(gridDiv.style.zoom).toBe("0.5");
    });

    it("should ignore single touch events", () => {
        const { container } = render(<ScryfallArtContent {...defaultProps} />);
        const gridDiv = container.firstChild as HTMLDivElement;

        fireEvent.touchStart(gridDiv, {
            touches: [{ clientX: 0, clientY: 0 }]
        });

        fireEvent.touchMove(gridDiv, {
            touches: [{ clientX: 50, clientY: 0 }]
        });

        // Should remain at default
        expect(gridDiv.style.zoom).toBe("1");
    });

    it("updates local zoom when prop changes", () => {
        const { container, rerender } = render(<ScryfallArtContent {...defaultProps} />);
        const gridDiv = container.firstChild as HTMLDivElement;
        expect(gridDiv.style.zoom).toBe("1");

        rerender(<ScryfallArtContent {...defaultProps} zoomLevel={2} />);
        expect(gridDiv.style.zoom).toBe("2");
    });

    it("should handle zero initial distance (touches at same point)", () => {
        const { container } = render(<ScryfallArtContent {...defaultProps} />);
        const gridDiv = container.firstChild as HTMLDivElement;

        // Start with 2 fingers at same point (distance 0)
        fireEvent.touchStart(gridDiv, {
            touches: [
                { clientX: 100, clientY: 100 },
                { clientX: 100, clientY: 100 }
            ]
        });

        // Move one finger (distance > 0)
        fireEvent.touchMove(gridDiv, {
            touches: [
                { clientX: 100, clientY: 100 },
                { clientX: 200, clientY: 100 }
            ]
        });

        // Zoom should NOT change because initialDistance was 0 (avoid divide by zero/infinite scale)
        expect(gridDiv.style.zoom).toBe("1");
    });
});
