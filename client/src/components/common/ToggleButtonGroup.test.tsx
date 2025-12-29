import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ToggleButtonGroup } from "./ToggleButtonGroup";

describe("ToggleButtonGroup", () => {
    describe("rendering", () => {
        it("should render all options", () => {
            const options = [
                { id: "option1", label: "Option 1" },
                { id: "option2", label: "Option 2" },
            ];

            render(
                <ToggleButtonGroup
                    options={options}
                    value="option1"
                    onChange={() => { }}
                />
            );

            expect(screen.getByText("Option 1")).toBeDefined();
            expect(screen.getByText("Option 2")).toBeDefined();
        });

        it("should render buttons for each option", () => {
            const options = [
                { id: "scryfall", label: "Scryfall" },
                { id: "mpc", label: "MPC" },
            ];

            render(
                <ToggleButtonGroup
                    options={options}
                    value="scryfall"
                    onChange={() => { }}
                />
            );

            const buttons = screen.getAllByRole("button");
            expect(buttons).toHaveLength(2);
        });
    });

    describe("click handling", () => {
        it("should call onChange when clicking an option", () => {
            const onChange = vi.fn();
            const options = [
                { id: "scryfall", label: "Scryfall" },
                { id: "mpc", label: "MPC" },
            ];

            render(
                <ToggleButtonGroup
                    options={options}
                    value="scryfall"
                    onChange={onChange}
                />
            );

            fireEvent.pointerUp(screen.getByText("MPC"));
            expect(onChange).toHaveBeenCalledWith("mpc");
        });

        it("should call onChange with correct id when clicking different options", () => {
            const onChange = vi.fn();
            const options = [
                { id: "front", label: "Front" },
                { id: "back", label: "Back" },
            ];

            render(
                <ToggleButtonGroup
                    options={options}
                    value="front"
                    onChange={onChange}
                />
            );

            fireEvent.pointerUp(screen.getByText("Back"));
            expect(onChange).toHaveBeenCalledWith("back");

            fireEvent.pointerUp(screen.getByText("Front"));
            expect(onChange).toHaveBeenCalledWith("front");
        });

        it("should call onChange even when clicking the already-selected option", () => {
            const onChange = vi.fn();
            const options = [
                { id: "artwork", label: "Artwork" },
                { id: "settings", label: "Settings" },
            ];

            render(
                <ToggleButtonGroup
                    options={options}
                    value="artwork"
                    onChange={onChange}
                />
            );

            fireEvent.pointerUp(screen.getByText("Artwork"));
            expect(onChange).toHaveBeenCalledWith("artwork");
        });
    });

    describe("active state styling", () => {
        it("should apply active styles to selected option", () => {
            const options = [
                { id: "option1", label: "Option 1" },
                { id: "option2", label: "Option 2" },
            ];

            render(
                <ToggleButtonGroup
                    options={options}
                    value="option1"
                    onChange={() => { }}
                />
            );

            const activeButton = screen.getByText("Option 1");
            expect(activeButton.className).toContain("bg-white");
        });

        it("should apply inactive styles to non-selected option", () => {
            const options = [
                { id: "option1", label: "Option 1" },
                { id: "option2", label: "Option 2" },
            ];

            render(
                <ToggleButtonGroup
                    options={options}
                    value="option1"
                    onChange={() => { }}
                />
            );

            const inactiveButton = screen.getByText("Option 2");
            expect(inactiveButton.className).toContain("text-gray-500");
        });
    });

    describe("custom className", () => {
        it("should apply custom className to container", () => {
            const options = [{ id: "option1", label: "Option 1" }];

            const { container } = render(
                <ToggleButtonGroup
                    options={options}
                    value="option1"
                    onChange={() => { }}
                    className="custom-class"
                />
            );

            const wrapper = container.firstChild as HTMLElement;
            expect(wrapper.className).toContain("custom-class");
        });
    });

    describe("integration with wrapping elements", () => {
        it("should fire onChange when wrapped in a div", () => {
            const onChange = vi.fn();
            const options = [
                { id: "scryfall", label: "Scryfall" },
                { id: "mpc", label: "MPC" },
            ];

            render(
                <div>
                    <ToggleButtonGroup
                        options={options}
                        value="scryfall"
                        onChange={onChange}
                    />
                </div>
            );

            fireEvent.pointerUp(screen.getByText("MPC"));
            expect(onChange).toHaveBeenCalledWith("mpc");
        });

        it("should fire onChange when parent has click handler with stopPropagation", () => {
            const onChange = vi.fn();
            const parentClick = vi.fn();
            const options = [
                { id: "scryfall", label: "Scryfall" },
                { id: "mpc", label: "MPC" },
            ];

            render(
                <div onClick={(e) => { e.stopPropagation(); parentClick(); }}>
                    <ToggleButtonGroup
                        options={options}
                        value="scryfall"
                        onChange={onChange}
                    />
                </div>
            );

            fireEvent.pointerUp(screen.getByText("MPC"));
            expect(onChange).toHaveBeenCalledWith("mpc");
            // Note: parent click won't be called since we're using pointerUp, not click
        });

        it("should fire onChange when deeply nested", () => {
            const onChange = vi.fn();
            const options = [
                { id: "artwork", label: "Artwork" },
                { id: "settings", label: "Settings" },
            ];

            render(
                <div className="outer">
                    <div className="middle">
                        <div className="inner">
                            <ToggleButtonGroup
                                options={options}
                                value="artwork"
                                onChange={onChange}
                            />
                        </div>
                    </div>
                </div>
            );

            fireEvent.pointerUp(screen.getByText("Settings"));
            expect(onChange).toHaveBeenCalledWith("settings");
        });
    });
});
