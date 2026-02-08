import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PerCardOffsetModal } from "./PerCardOffsetModal";
import { useSettingsStore } from "@/store/settings";

// Mock dependencies
vi.mock("@/helpers/exportCuttingTemplate", () => ({
    settingsToCuttingTemplate: vi.fn(),
    downloadCuttingTemplatePDF: vi.fn(),
}));

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
};

describe("PerCardOffsetModal", () => {
    const mockOnClose = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        useSettingsStore.setState({
            columns: 2,
            rows: 2,
            perCardBackOffsets: {},
            pageWidth: 210,
            pageHeight: 297,
        });
    });

    it("should render the modal when open", () => {
        render(<PerCardOffsetModal isOpen={true} onClose={mockOnClose} />);
        expect(screen.getByText("Adjust Card Back Placement")).toBeTruthy();
    });

    it("should display the correct number of card slots", () => {
        useSettingsStore.setState({ columns: 2, rows: 2 });
        render(<PerCardOffsetModal isOpen={true} onClose={mockOnClose} />);
        // 2x2 grid = 4 cards
        // We look for buttons with title starting with "Card"
        const cardButtons = screen.getAllByTitle(/Card \d+/);
        expect(cardButtons).toHaveLength(4);
    });

    it("should show card details when a card is selected", () => {
        render(<PerCardOffsetModal isOpen={true} onClose={mockOnClose} />);

        // Click first card
        const firstCard = screen.getByTitle(/Card 1/);
        fireEvent.click(firstCard);

        expect(screen.getByText("Card 1")).toBeTruthy();

        // Labels are now external
        expect(screen.getByText("X Offset (mm)")).toBeTruthy();
        expect(screen.getByText("Y Offset (mm)")).toBeTruthy();
        expect(screen.getByText("Rotation (degrees)")).toBeTruthy();

        // Verify sliders are present (3 sliders: X, Y, Rotation)
        const sliders = screen.getAllByRole("slider");
        expect(sliders.length).toBe(3);

        // X and Y sliders should have range +/- 10
        expect(sliders[0].getAttribute("min")).toBe("-10");
        expect(sliders[0].getAttribute("max")).toBe("10");
        expect(sliders[1].getAttribute("min")).toBe("-10");
        expect(sliders[1].getAttribute("max")).toBe("10");

        // Rotation slider should have range +/- 360
        expect(sliders[2].getAttribute("min")).toBe("-360");
        expect(sliders[2].getAttribute("max")).toBe("360");

        expect(screen.getByText("Reset Selected Cards")).toBeTruthy();
        expect(screen.getByText("Preview")).toBeTruthy();
        expect(screen.queryByText("Back to Edit")).toBeNull();
    });

    it("should show placeholder when no card is selected", () => {
        render(<PerCardOffsetModal isOpen={true} onClose={mockOnClose} />);
        expect(screen.getByText("Click on a card to adjust its position")).toBeTruthy();
    });

    it("should have a Reset All Offsets button with correct styling (gray)", () => {
        render(<PerCardOffsetModal isOpen={true} onClose={mockOnClose} />);
        const resetAllBtn = screen.getByText("Reset All Offsets");

        // Check for gray styling classes
        expect(resetAllBtn.className).toContain("bg-gray-500");
        // Ensure it doesn't have the red 'failure' color class (which usually adds bg-red-xxx)
        expect(resetAllBtn.className).not.toContain("bg-red-");
    });

    it("should have correct layout structure (flex-col) for controls", () => {
        render(<PerCardOffsetModal isOpen={true} onClose={mockOnClose} />);

        // Find the controls panel by finding the Reset All button and going up to its container
        // The structure is: div.w-96 > div.border-t > button
        // But based on our change: div.w-96 > div.border-t > button
        // Wait, the button is directly in the div.w-96 container's footer area?
        // Let's look at the component structure again:
        // <div className="w-96 flex flex-col gap-4 flex-shrink-0">
        //   ... content ...
        //   <div className="pt-4 border-t ...">
        //     <Button>Reset All Offsets</Button>
        //   </div>
        // </div>

        const resetBtn = screen.getByText("Reset All Offsets");
        const buttonContainer = resetBtn.closest('.pt-4');
        const controlsPanel = buttonContainer?.parentElement;

        expect(controlsPanel).toBeTruthy();
        expect(controlsPanel?.className).toContain('flex');
        expect(controlsPanel?.className).toContain('flex-col');
        expect(controlsPanel?.className).toContain('w-96');
    });
});
