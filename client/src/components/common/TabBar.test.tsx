import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TabBar } from "./TabBar";

describe("TabBar", () => {
    describe("rendering", () => {
        it("should render all tabs", () => {
            const tabs = [
                { id: "tab1", label: "Tab 1" },
                { id: "tab2", label: "Tab 2" },
                { id: "tab3", label: "Tab 3" },
            ];

            render(
                <TabBar
                    tabs={tabs}
                    activeTab="tab1"
                    onTabChange={() => { }}
                />
            );

            expect(screen.getByText("Tab 1")).toBeDefined();
            expect(screen.getByText("Tab 2")).toBeDefined();
            expect(screen.getByText("Tab 3")).toBeDefined();
        });

        it("should render tabs with icons", () => {
            const tabs = [
                { id: "tab1", label: "Tab 1", icon: <span data-testid="icon1">🔍</span> },
                { id: "tab2", label: "Tab 2", icon: <span data-testid="icon2">⚙️</span> },
            ];

            render(
                <TabBar
                    tabs={tabs}
                    activeTab="tab1"
                    onTabChange={() => { }}
                />
            );

            expect(screen.getByTestId("icon1")).toBeDefined();
            expect(screen.getByTestId("icon2")).toBeDefined();
        });

        it("should have aria-labels for accessibility", () => {
            const tabs = [
                { id: "tab1", label: "Settings" },
                { id: "tab2", label: "Artwork" },
            ];

            render(
                <TabBar
                    tabs={tabs}
                    activeTab="tab1"
                    onTabChange={() => { }}
                />
            );

            expect(screen.getByLabelText("Settings Tab")).toBeDefined();
            expect(screen.getByLabelText("Artwork Tab")).toBeDefined();
        });
    });

    describe("tab selection", () => {
        it("should call onTabChange when clicking a tab", () => {
            const onTabChange = vi.fn();
            const tabs = [
                { id: "tab1", label: "Tab 1" },
                { id: "tab2", label: "Tab 2" },
            ];

            render(
                <TabBar
                    tabs={tabs}
                    activeTab="tab1"
                    onTabChange={onTabChange}
                />
            );

            fireEvent.click(screen.getByText("Tab 2"));
            expect(onTabChange).toHaveBeenCalledWith("tab2");
        });

        it("should call onTabChange with correct tab id", () => {
            const onTabChange = vi.fn();
            const tabs = [
                { id: "front", label: "Front" },
                { id: "back", label: "Back" },
            ];

            render(
                <TabBar
                    tabs={tabs}
                    activeTab="front"
                    onTabChange={onTabChange}
                />
            );

            fireEvent.click(screen.getByText("Back"));
            expect(onTabChange).toHaveBeenCalledWith("back");

            fireEvent.click(screen.getByText("Front"));
            expect(onTabChange).toHaveBeenCalledWith("front");
        });
    });

    describe("variants", () => {
        it("should apply primary variant styles by default", () => {
            const tabs = [{ id: "tab1", label: "Tab 1" }];

            const { container } = render(
                <TabBar
                    tabs={tabs}
                    activeTab="tab1"
                    onTabChange={() => { }}
                />
            );

            const wrapper = container.firstChild as HTMLElement;
            expect(wrapper.className).toContain("bg-white");
        });

        it("should apply secondary variant styles", () => {
            const tabs = [{ id: "tab1", label: "Tab 1" }];

            const { container } = render(
                <TabBar
                    tabs={tabs}
                    activeTab="tab1"
                    onTabChange={() => { }}
                    variant="secondary"
                />
            );

            const wrapper = container.firstChild as HTMLElement;
            expect(wrapper.className).toContain("bg-gray-50");
        });

        it("should apply smaller size classes for secondary variant", () => {
            const tabs = [{ id: "tab1", label: "Tab 1" }];

            render(
                <TabBar
                    tabs={tabs}
                    activeTab="tab1"
                    onTabChange={() => { }}
                    variant="secondary"
                />
            );

            const button = screen.getByRole("button");
            expect(button.className).toContain("px-4");
            expect(button.className).toContain("py-2");
            expect(button.className).toContain("text-sm");
        });

        it("should apply larger size classes for primary variant", () => {
            const tabs = [{ id: "tab1", label: "Tab 1" }];

            render(
                <TabBar
                    tabs={tabs}
                    activeTab="tab1"
                    onTabChange={() => { }}
                    variant="primary"
                />
            );

            const button = screen.getByRole("button");
            expect(button.className).toContain("px-6");
            expect(button.className).toContain("py-3");
        });
    });

    describe("active state styling", () => {
        it("should apply active styles to the active tab (primary)", () => {
            const tabs = [
                { id: "tab1", label: "Tab 1" },
                { id: "tab2", label: "Tab 2" },
            ];

            render(
                <TabBar
                    tabs={tabs}
                    activeTab="tab1"
                    onTabChange={() => { }}
                    variant="primary"
                />
            );

            const activeTab = screen.getByText("Tab 1");
            expect(activeTab.className).toContain("border-blue-600");
            expect(activeTab.className).toContain("text-blue-600");
        });

        it("should apply inactive styles to non-active tabs (primary)", () => {
            const tabs = [
                { id: "tab1", label: "Tab 1" },
                { id: "tab2", label: "Tab 2" },
            ];

            render(
                <TabBar
                    tabs={tabs}
                    activeTab="tab1"
                    onTabChange={() => { }}
                    variant="primary"
                />
            );

            const inactiveTab = screen.getByText("Tab 2");
            expect(inactiveTab.className).toContain("border-transparent");
            expect(inactiveTab.className).toContain("text-gray-500");
        });

        it("should apply active styles to the active tab (secondary)", () => {
            const tabs = [
                { id: "tab1", label: "Tab 1" },
                { id: "tab2", label: "Tab 2" },
            ];

            render(
                <TabBar
                    tabs={tabs}
                    activeTab="tab2"
                    onTabChange={() => { }}
                    variant="secondary"
                />
            );

            const activeTab = screen.getByText("Tab 2");
            expect(activeTab.className).toContain("text-blue-600");
            expect(activeTab.className).toContain("rounded-t-lg");
        });
    });

    describe("custom className", () => {
        it("should apply custom className", () => {
            const tabs = [{ id: "tab1", label: "Tab 1" }];

            const { container } = render(
                <TabBar
                    tabs={tabs}
                    activeTab="tab1"
                    onTabChange={() => { }}
                    className="custom-class"
                />
            );

            const wrapper = container.firstChild as HTMLElement;
            expect(wrapper.className).toContain("custom-class");
        });
    });
});
