import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchResultsList } from "./SearchResultsList";

describe("SearchResultsList", () => {
    const defaultProps = {
        suggestions: ["Card A", "Card B", "Card C"],
        hoveredIndex: null,
        setHoveredIndex: vi.fn(),
        onClose: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should render suggestions count", () => {
        render(<SearchResultsList {...defaultProps} />);

        expect(screen.getByText("3 Results")).toBeTruthy();
    });

    it("should render all suggestions", () => {
        render(<SearchResultsList {...defaultProps} />);

        expect(screen.getByText("Card A")).toBeTruthy();
        expect(screen.getByText("Card B")).toBeTruthy();
        expect(screen.getByText("Card C")).toBeTruthy();
    });

    it("should show 'No results found' when empty", () => {
        render(<SearchResultsList {...defaultProps} suggestions={[]} />);

        expect(screen.getByText("0 Results")).toBeTruthy();
        expect(screen.getByText("No results found")).toBeTruthy();
    });

    it("should call onClose when Close List button is clicked", () => {
        render(<SearchResultsList {...defaultProps} />);

        fireEvent.click(screen.getByText("Close List"));

        expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it("should call setHoveredIndex and onClose when item is clicked", () => {
        render(<SearchResultsList {...defaultProps} />);

        fireEvent.click(screen.getByText("Card B"));

        expect(defaultProps.setHoveredIndex).toHaveBeenCalledWith(1);
        expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it("should highlight hovered item", () => {
        const { container } = render(
            <SearchResultsList {...defaultProps} hoveredIndex={0} />
        );

        const firstItem = container.querySelector("#result-item-0");
        expect(firstItem?.className).toContain("bg-indigo-50");
    });

    it("should show indicator dot for hovered item", () => {
        render(<SearchResultsList {...defaultProps} hoveredIndex={1} />);

        // The hovered item should have the indicator dot
        const items = screen.getAllByRole("listitem");
        expect(items[1].querySelector(".rounded-full")).toBeTruthy();
    });
});
