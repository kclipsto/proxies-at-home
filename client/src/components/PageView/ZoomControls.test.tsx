import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ZoomControls } from "./ZoomControls";
import { useSettingsStore } from "@/store/settings";

// Mock the store
vi.mock("@/store/settings", () => ({
    useSettingsStore: vi.fn(),
}));

describe("ZoomControls", () => {
    it("should reset zoom on double click (desktop)", () => {
        const setZoom = vi.fn();
        (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (state: unknown) => unknown) => selector({
            zoom: 1.5,
            setZoom,
        }));

        render(<ZoomControls />);
        const slider = screen.getByRole("slider");

        fireEvent.doubleClick(slider);
        expect(setZoom).toHaveBeenCalledWith(1.0);
    });

    it("should reset zoom on double tap (mobile)", () => {
        const setZoom = vi.fn();
        (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (state: unknown) => unknown) => selector({
            zoom: 1.5,
            setZoom,
        }));

        render(<ZoomControls />);
        const slider = screen.getByRole("slider");

        // First tap
        fireEvent.touchStart(slider);

        // Second tap within 300ms
        fireEvent.touchStart(slider);

        expect(setZoom).toHaveBeenCalledWith(1.0);
    });

    it("should not reset zoom on single tap", () => {
        const setZoom = vi.fn();
        (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (state: unknown) => unknown) => selector({
            zoom: 1.5,
            setZoom,
        }));

        render(<ZoomControls />);
        const slider = screen.getByRole("slider");

        // Single tap
        fireEvent.touchStart(slider);

        expect(setZoom).not.toHaveBeenCalled();
    });

    it("should not reset zoom on slow double tap", async () => {
        const setZoom = vi.fn();
        (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (state: unknown) => unknown) => selector({
            zoom: 1.5,
            setZoom,
        }));

        render(<ZoomControls />);
        const slider = screen.getByRole("slider");

        // Mock Date.now
        const realDateNow = Date.now;
        let currentTime = 1000;
        global.Date.now = () => currentTime;

        // First tap
        fireEvent.touchStart(slider);

        // Advance time > 300ms
        currentTime += 350;

        // Second tap
        fireEvent.touchStart(slider);

        expect(setZoom).not.toHaveBeenCalled();

        // Restore Date.now
        global.Date.now = realDateNow;
    });

    it("should zoom out when zoom out button clicked", () => {
        const setZoom = vi.fn();
        (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (state: unknown) => unknown) => selector({
            zoom: 1.5,
            setZoom,
        }));

        render(<ZoomControls />);
        const buttons = screen.getAllByRole("button");
        const zoomOutButton = buttons[0]; // First button is zoom out

        fireEvent.click(zoomOutButton);
        expect(setZoom).toHaveBeenCalledWith(1.4);
    });

    it("should zoom in when zoom in button clicked", () => {
        const setZoom = vi.fn();
        (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (state: unknown) => unknown) => selector({
            zoom: 1.5,
            setZoom,
        }));

        render(<ZoomControls />);
        const buttons = screen.getAllByRole("button");
        const zoomInButton = buttons[1]; // Second button is zoom in

        fireEvent.click(zoomInButton);
        expect(setZoom).toHaveBeenCalledWith(1.6);
    });

    it("should change zoom on slider change", () => {
        const setZoom = vi.fn();
        (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (state: unknown) => unknown) => selector({
            zoom: 1.0,
            setZoom,
        }));

        render(<ZoomControls />);
        const slider = screen.getByRole("slider");

        fireEvent.change(slider, { target: { value: "75" } });
        expect(setZoom).toHaveBeenCalled();
    });

    it("should render compact mode", () => {
        const setZoom = vi.fn();
        (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (state: unknown) => unknown) => selector({
            zoom: 1.0,
            setZoom,
        }));

        render(<ZoomControls compact={true} />);
        // Compact mode doesn't have slider
        expect(screen.queryByRole("slider")).toBeNull();
        // But still has buttons
        expect(screen.getAllByRole("button").length).toBe(2);
    });

    it("should use controlled mode when zoom and onZoomChange are provided", () => {
        const onZoomChange = vi.fn();
        (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (state: unknown) => unknown) => selector({
            zoom: 1.0,
            setZoom: vi.fn(),
        }));

        render(<ZoomControls zoom={2.0} onZoomChange={onZoomChange} />);
        expect(screen.getByText("2.0x")).toBeDefined();

        const buttons = screen.getAllByRole("button");
        fireEvent.click(buttons[1]); // Zoom in
        expect(onZoomChange).toHaveBeenCalled();
    });
});

