import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MpcArtGrid } from "./MpcArtGrid";
import type { MpcAutofillCard } from "@/helpers/mpcAutofillApi";

describe("MpcArtGrid", () => {
    const mockCard: MpcAutofillCard = {
        identifier: "card-123",
        name: "Test Card",
        sourceName: "Test Source",
        source: "google_drive",
        extension: "png",
        size: 1024,
        dpi: 1200,
        mediumThumbnailUrl: "https://example.com/medium.jpg",
        smallThumbnailUrl: "https://example.com/small.jpg",
        tags: ["tag1", "tag2"],
    };

    const defaultProps = {
        cards: [mockCard],
        onSelectCard: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("loading state", () => {
        it("should show loading spinner when isLoading is true", () => {
            render(<MpcArtGrid {...defaultProps} isLoading={true} />);

            expect(screen.getByText("Searching MPC Autofill...")).toBeTruthy();
        });
    });

    describe("empty state", () => {
        it("should render nothing when cards is empty and not loading", () => {
            const { container } = render(<MpcArtGrid {...defaultProps} cards={[]} />);

            expect(container.firstChild).toBeNull();
        });
    });

    describe("with cards", () => {
        it("should render card images", () => {
            render(<MpcArtGrid {...defaultProps} />);

            const images = screen.getAllByRole("img");
            expect(images).toHaveLength(1);
            expect(images[0].getAttribute("alt")).toBe("Test Card");
        });

        it("should display DPI badge", () => {
            render(<MpcArtGrid {...defaultProps} />);

            expect(screen.getByText("1200 DPI")).toBeTruthy();
        });

        it("should call onSelectCard when card is clicked", () => {
            render(<MpcArtGrid {...defaultProps} />);

            const image = screen.getByRole("img");
            const card = image.closest(".relative");
            if (card) {
                fireEvent.click(card);
                expect(defaultProps.onSelectCard).toHaveBeenCalledWith(mockCard);
            }
        });

        it("should debounce rapid clicks", async () => {
            render(<MpcArtGrid {...defaultProps} />);

            const image = screen.getByRole("img");
            const card = image.closest(".relative");
            if (card) {
                fireEvent.click(card);
                fireEvent.click(card);
                fireEvent.click(card);

                // Only one call should go through due to debounce
                expect(defaultProps.onSelectCard).toHaveBeenCalledTimes(1);
            }
        });

        it("should fallback to medium thumbnail on error", () => {
            render(<MpcArtGrid {...defaultProps} />);

            const image = screen.getByRole("img") as HTMLImageElement;
            fireEvent.error(image);

            expect(image.src).toBe("https://example.com/medium.jpg");
        });

        it("should display source name", () => {
            render(<MpcArtGrid {...defaultProps} />);
            expect(screen.getByText("Test Source")).toBeTruthy();
        });

        it("should display tags", () => {
            render(<MpcArtGrid {...defaultProps} />);
            expect(screen.getByText("tag1")).toBeTruthy();
            expect(screen.getByText("tag2")).toBeTruthy();
        });
    });

    describe("filtering", () => {
        it("should call onFilterDpi when DPI badge is clicked", () => {
            const onFilterDpi = vi.fn();
            render(<MpcArtGrid {...defaultProps} onFilterDpi={onFilterDpi} />);

            const dpiBadge = screen.getByText("1200 DPI");
            fireEvent.click(dpiBadge);

            expect(onFilterDpi).toHaveBeenCalledWith(1200);
            // Should not trigger card selection
            expect(defaultProps.onSelectCard).not.toHaveBeenCalled();
        });

        it("should highlight active DPI filter", () => {
            const onFilterDpi = vi.fn();
            render(
                <MpcArtGrid
                    {...defaultProps}
                    onFilterDpi={onFilterDpi}
                    activeMinDpi={1000}
                />
            );

            // Card has 1200 DPI which is >= 1000, so it should be highlighted
            const dpiBadge = screen.getByText("1200 DPI");
            expect(dpiBadge.className).toContain("bg-blue-600");
        });

        it("should call onFilterSource when source is clicked", () => {
            const onFilterSource = vi.fn();
            render(<MpcArtGrid {...defaultProps} onFilterSource={onFilterSource} />);

            const source = screen.getByText("Test Source");
            fireEvent.click(source);

            expect(onFilterSource).toHaveBeenCalledWith("Test Source");
            expect(defaultProps.onSelectCard).not.toHaveBeenCalled();
        });

        it("should highlight active source filter", () => {
            const onFilterSource = vi.fn();
            render(
                <MpcArtGrid
                    {...defaultProps}
                    onFilterSource={onFilterSource}
                    activeSources={new Set(["Test Source"])}
                />
            );

            const source = screen.getByText("Test Source");
            expect(source.className).toContain("bg-blue-600");
        });

        it("should call onFilterTag when tag is clicked", () => {
            const onFilterTag = vi.fn();
            render(<MpcArtGrid {...defaultProps} onFilterTag={onFilterTag} />);

            const tag = screen.getByText("tag1");
            fireEvent.click(tag);

            expect(onFilterTag).toHaveBeenCalledWith("tag1");
            expect(defaultProps.onSelectCard).not.toHaveBeenCalled();
        });

        it("should highlight active tag filter", () => {
            const onFilterTag = vi.fn();
            render(
                <MpcArtGrid
                    {...defaultProps}
                    onFilterTag={onFilterTag}
                    activeTags={new Set(["tag1"])}
                />
            );

            const tag = screen.getByText("tag1");
            expect(tag.className).toContain("bg-blue-600");
        });
    });
});

