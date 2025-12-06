import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, it, expect, vi } from "vitest";
import { CardView } from "./SortableCard";
import type { CardOption } from "../../../shared/types";

// Mock the stores
vi.mock("../store", () => ({
    useSettingsStore: (selector: (state: unknown) => unknown) => selector({
        guideWidth: 10,
        guideColor: "#00ff00",
        perCardGuideStyle: "corners",
        guidePlacement: "inside",
    }),
    useArtworkModalStore: (selector: (state: unknown) => unknown) => selector({
        openModal: vi.fn(),
    }),
}));

describe("CardView Guides", () => {
    const mockCard: CardOption = {
        uuid: "test-uuid",
        name: "Test Card",
        imageId: "test-image-id",
        set: "TST",
        number: "1",
        rarity: "common",
        type_line: "Creature",
        mana_cost: "{G}",
        order: 0,
        isUserUpload: false,
    };

    const defaultProps = {
        card: mockCard,
        index: 0,
        globalIndex: 0,
        imageSrc: "test-src",
        totalCardWidth: 63,
        totalCardHeight: 88,
        guideOffset: "3mm", // Valid offset
        setContextMenu: vi.fn(),
    };

    it("renders guides with correct positioning", () => {
        render(<CardView {...defaultProps} />);

        // Top Left Horizontal
        const topLeftH = screen.getByTestId("guide-top-left-h");
        expect(topLeftH).toHaveStyle({
            top: "3mm",
            left: "3mm",
        });

        // Top Right Horizontal
        const topRightH = screen.getByTestId("guide-top-right-h");
        expect(topRightH).toHaveStyle({
            top: "3mm",
            right: "3mm",
        });

        // Bottom Left Horizontal
        const bottomLeftH = screen.getByTestId("guide-bottom-left-h");
        expect(bottomLeftH).toHaveStyle({
            bottom: "3mm",
            left: "3mm",
        });

        // Bottom Right Horizontal
        const bottomRightH = screen.getByTestId("guide-bottom-right-h");
        expect(bottomRightH).toHaveStyle({
            bottom: "3mm",
            right: "3mm",
        });
    });

    it("renders guides correctly with 0mm offset", () => {
        render(<CardView {...defaultProps} guideOffset="0mm" />);

        const topLeftH = screen.getByTestId("guide-top-left-h");
        expect(topLeftH).toHaveStyle({
            top: "0mm",
            left: "0mm",
        });
    });
});
