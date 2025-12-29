import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ResponsiveModal } from "./ResponsiveModal";
import { ToggleButtonGroup } from "./ToggleButtonGroup";

describe("ResponsiveModal", () => {
    describe("rendering", () => {
        it("should render when isOpen is true", () => {
            render(
                <ResponsiveModal isOpen={true} onClose={() => { }}>
                    <div>Modal Content</div>
                </ResponsiveModal>
            );

            expect(screen.getByText("Modal Content")).toBeDefined();
        });

        it("should not render when isOpen is false", () => {
            render(
                <ResponsiveModal isOpen={false} onClose={() => { }}>
                    <div>Modal Content</div>
                </ResponsiveModal>
            );

            expect(screen.queryByText("Modal Content")).toBeNull();
        });

        it("should render with custom header", () => {
            render(
                <ResponsiveModal
                    isOpen={true}
                    onClose={() => { }}
                    header={<div>Custom Header</div>}
                >
                    <div>Modal Content</div>
                </ResponsiveModal>
            );

            expect(screen.getByText("Custom Header")).toBeDefined();
        });

        it("should render with title", () => {
            render(
                <ResponsiveModal
                    isOpen={true}
                    onClose={() => { }}
                    title="Modal Title"
                >
                    <div>Modal Content</div>
                </ResponsiveModal>
            );

            expect(screen.getByText("Modal Title")).toBeDefined();
        });
    });

    describe("close behavior", () => {
        it("should call onClose when backdrop is clicked", () => {
            const onClose = vi.fn();
            render(
                <ResponsiveModal isOpen={true} onClose={onClose}>
                    <div>Modal Content</div>
                </ResponsiveModal>
            );

            // Click the backdrop (portaled to document.body, find via class)
            const backdrop = document.querySelector('.fixed.inset-0');
            if (backdrop) {
                fireEvent.click(backdrop);
            }
            expect(onClose).toHaveBeenCalled();
        });

        it("should NOT call onClose when modal container is clicked", () => {
            const onClose = vi.fn();
            render(
                <ResponsiveModal isOpen={true} onClose={onClose}>
                    <div>Modal Content</div>
                </ResponsiveModal>
            );

            // Click the modal content
            fireEvent.click(screen.getByText("Modal Content"));
            expect(onClose).not.toHaveBeenCalled();
        });

        it("should call onClose when escape key is pressed", () => {
            const onClose = vi.fn();
            render(
                <ResponsiveModal isOpen={true} onClose={onClose}>
                    <div>Modal Content</div>
                </ResponsiveModal>
            );

            fireEvent.keyDown(window, { key: "Escape" });
            expect(onClose).toHaveBeenCalled();
        });
    });

    describe("header click handling with ToggleButtonGroup", () => {
        it("should allow ToggleButtonGroup onChange to fire in header", () => {
            const onChange = vi.fn();
            const onClose = vi.fn();

            render(
                <ResponsiveModal
                    isOpen={true}
                    onClose={onClose}
                    header={
                        <div>
                            <ToggleButtonGroup
                                options={[
                                    { id: "scryfall", label: "Scryfall" },
                                    { id: "mpc", label: "MPC" },
                                ]}
                                value="scryfall"
                                onChange={onChange}
                            />
                        </div>
                    }
                >
                    <div>Modal Content</div>
                </ResponsiveModal>
            );

            fireEvent.pointerUp(screen.getByText("MPC"));
            expect(onChange).toHaveBeenCalledWith("mpc");
            expect(onClose).not.toHaveBeenCalled();
        });

        it("should allow multiple ToggleButtonGroups in header", () => {
            const onFaceChange = vi.fn();
            const onViewChange = vi.fn();
            const onSourceChange = vi.fn();
            const onClose = vi.fn();

            render(
                <ResponsiveModal
                    isOpen={true}
                    onClose={onClose}
                    header={
                        <div>
                            <ToggleButtonGroup
                                options={[
                                    { id: "front", label: "Front" },
                                    { id: "back", label: "Back" },
                                ]}
                                value="front"
                                onChange={onFaceChange}
                            />
                            <ToggleButtonGroup
                                options={[
                                    { id: "artwork", label: "Artwork" },
                                    { id: "settings", label: "Settings" },
                                ]}
                                value="artwork"
                                onChange={onViewChange}
                            />
                            <ToggleButtonGroup
                                options={[
                                    { id: "scryfall", label: "Scryfall" },
                                    { id: "mpc", label: "MPC" },
                                ]}
                                value="scryfall"
                                onChange={onSourceChange}
                            />
                        </div>
                    }
                >
                    <div>Modal Content</div>
                </ResponsiveModal>
            );

            fireEvent.pointerUp(screen.getByText("Back"));
            expect(onFaceChange).toHaveBeenCalledWith("back");

            fireEvent.pointerUp(screen.getByText("Settings"));
            expect(onViewChange).toHaveBeenCalledWith("settings");

            fireEvent.pointerUp(screen.getByText("MPC"));
            expect(onSourceChange).toHaveBeenCalledWith("mpc");

            expect(onClose).not.toHaveBeenCalled();
        });

        it("should NOT close modal when clicking ToggleButtonGroup buttons", () => {
            const onChange = vi.fn();
            const onClose = vi.fn();

            render(
                <ResponsiveModal
                    isOpen={true}
                    onClose={onClose}
                    header={
                        <div>
                            <ToggleButtonGroup
                                options={[
                                    { id: "front", label: "Front" },
                                    { id: "back", label: "Back" },
                                ]}
                                value="front"
                                onChange={onChange}
                            />
                        </div>
                    }
                >
                    <div>Modal Content</div>
                </ResponsiveModal>
            );

            // Click all buttons using pointerUp (ToggleButtonGroup uses onPointerUp)
            fireEvent.pointerUp(screen.getByText("Front"));
            fireEvent.pointerUp(screen.getByText("Back"));
            fireEvent.pointerUp(screen.getByText("Front"));

            expect(onClose).not.toHaveBeenCalled();
            expect(onChange).toHaveBeenCalledTimes(3);
        });
    });

    describe("content click handling", () => {
        it("should allow button clicks in content area", () => {
            const onClick = vi.fn();
            const onClose = vi.fn();

            render(
                <ResponsiveModal isOpen={true} onClose={onClose}>
                    <button onClick={onClick}>Click Me</button>
                </ResponsiveModal>
            );

            fireEvent.click(screen.getByText("Click Me"));
            expect(onClick).toHaveBeenCalled();
            expect(onClose).not.toHaveBeenCalled();
        });
    });

    describe("mobileLandscapeSidebar mode", () => {
        it("should render floating close button when mobileLandscapeSidebar is true", () => {
            render(
                <ResponsiveModal
                    isOpen={true}
                    onClose={() => { }}
                    mobileLandscapeSidebar
                >
                    <div>Modal Content</div>
                </ResponsiveModal>
            );

            // The floating close button should exist (hidden on non-landscape)
            const closeButtons = screen.getAllByLabelText("Close modal");
            expect(closeButtons.length).toBeGreaterThan(0);
        });
    });
});
