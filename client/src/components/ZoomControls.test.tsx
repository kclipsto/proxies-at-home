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
});
