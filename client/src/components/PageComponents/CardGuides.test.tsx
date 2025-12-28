import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, it, expect } from "vitest";
import { CardGuides } from "./CardGuides";

describe("CardGuides", () => {
    const defaultProps = {
        guideWidth: 10,
        guideColor: "#00ff00",
        perCardGuideStyle: "corners",
        guidePlacement: "inside" as const,
        guideOffset: "3mm",
    };

    describe("rendering with corners style", () => {
        it("renders all eight corner guides", () => {
            render(<CardGuides {...defaultProps} />);

            // Top Left guides
            expect(screen.getByTestId("guide-top-left-h")).toBeInTheDocument();
            expect(screen.getByTestId("guide-top-left-v")).toBeInTheDocument();

            // Top Right guides
            expect(screen.getByTestId("guide-top-right-h")).toBeInTheDocument();
            expect(screen.getByTestId("guide-top-right-v")).toBeInTheDocument();

            // Bottom Left guides
            expect(screen.getByTestId("guide-bottom-left-h")).toBeInTheDocument();
            expect(screen.getByTestId("guide-bottom-left-v")).toBeInTheDocument();

            // Bottom Right guides
            expect(screen.getByTestId("guide-bottom-right-h")).toBeInTheDocument();
            expect(screen.getByTestId("guide-bottom-right-v")).toBeInTheDocument();
        });

        it("positions guides at correct offset", () => {
            render(<CardGuides {...defaultProps} guideOffset="3mm" />);

            const topLeftH = screen.getByTestId("guide-top-left-h");
            expect(topLeftH).toHaveStyle({
                top: "3mm",
                left: "3mm",
            });

            const topRightH = screen.getByTestId("guide-top-right-h");
            expect(topRightH).toHaveStyle({
                top: "3mm",
                right: "3mm",
            });

            const bottomLeftH = screen.getByTestId("guide-bottom-left-h");
            expect(bottomLeftH).toHaveStyle({
                bottom: "3mm",
                left: "3mm",
            });

            const bottomRightH = screen.getByTestId("guide-bottom-right-h");
            expect(bottomRightH).toHaveStyle({
                bottom: "3mm",
                right: "3mm",
            });
        });

        it("positions guides correctly with 0mm offset", () => {
            render(<CardGuides {...defaultProps} guideOffset="0mm" />);

            const topLeftH = screen.getByTestId("guide-top-left-h");
            expect(topLeftH).toHaveStyle({
                top: "0mm",
                left: "0mm",
            });
        });
    });

    describe("rendering with none style", () => {
        it("renders nothing when perCardGuideStyle is none", () => {
            const { container } = render(<CardGuides {...defaultProps} perCardGuideStyle="none" />);
            // The outer div should be empty or null was returned
            expect(container.firstChild).toBeNull();
        });
    });

    describe("rendering with zero width", () => {
        it("renders nothing when guideWidth is 0", () => {
            const { container } = render(<CardGuides {...defaultProps} guideWidth={0} />);
            // Container has the outer div but inner content is null
            expect(container.querySelector('[data-testid]')).toBeNull();
        });
    });

    describe("guide colors", () => {
        it("applies guide color from props", () => {
            render(<CardGuides {...defaultProps} guideColor="#ff0000" />);

            const topLeftH = screen.getByTestId("guide-top-left-h");
            expect(topLeftH).toHaveStyle({
                backgroundColor: "#ff0000",
            });
        });
    });

    describe("outside placement", () => {
        it("calculates offset for outside placement", () => {
            render(<CardGuides {...defaultProps} guidePlacement="outside" guideOffset="3mm" />);

            const topLeftH = screen.getByTestId("guide-top-left-h");
            // Outside placement subtracts guide width from offset
            expect(topLeftH).toHaveStyle({
                top: "calc(3mm - 10px)",
                left: "calc(3mm - 10px)",
            });
        });
    });
});
