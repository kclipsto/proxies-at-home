import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Mock zustand stores
const mockSettingsState = vi.hoisted(() => ({
    pageSizeUnit: "mm" as const,
    pageWidth: 210,
    pageHeight: 297,
    columns: 3,
    rows: 3,
    bleedEdge: true,
    bleedEdgeWidth: 3,
    bleedEdgeUnit: "mm" as "mm" | "in",
    zoom: 1,
    setZoom: vi.fn(),
    settingsPanelWidth: 320,
    isSettingsPanelCollapsed: false,
    uploadPanelWidth: 320,
    isUploadPanelCollapsed: false,
    darkenMode: "none" as const,
    sortBy: "manual" as "manual" | "name" | "set" | "mana" | "color" | "type",
    filterManaCost: [] as string[],
    filterColors: [] as string[],
    filterTypes: [] as string[],
    filterCategories: [] as string[],
    cardPositionX: 0,
    cardPositionY: 0,
    withBleedTargetMode: "global" as const,
    withBleedTargetAmount: 3,
    noBleedTargetMode: "global" as const,
    noBleedTargetAmount: 3,
    cardSpacingMm: 0,
    guideWidth: 1,
    cutLineStyle: "edges" as const,
    perCardGuideStyle: "corners" as const,
    guideColor: "#000000",
    guidePlacement: "inside" as const,
}));

vi.mock("../store/settings", () => ({
    useSettingsStore: (selector: (state: typeof mockSettingsState) => unknown) => {
        if (typeof selector === "function") {
            return selector(mockSettingsState);
        }
        return mockSettingsState;
    },
}));

vi.mock("zustand/react/shallow", () => ({
    useShallow: (fn: (state: typeof mockSettingsState) => unknown) => fn,
}));

import { usePageViewSettings } from "./usePageViewSettings";

describe("usePageViewSettings", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset to defaults
        mockSettingsState.bleedEdge = true;
        mockSettingsState.bleedEdgeWidth = 3;
        mockSettingsState.bleedEdgeUnit = "mm";
        mockSettingsState.sortBy = "manual";
        mockSettingsState.filterManaCost = [];
        mockSettingsState.filterColors = [];
        mockSettingsState.filterTypes = [];
        mockSettingsState.filterCategories = [];
    });

    it("should return all settings", () => {
        const { result } = renderHook(() => usePageViewSettings());

        expect(result.current.pageWidth).toBe(210);
        expect(result.current.pageHeight).toBe(297);
        expect(result.current.columns).toBe(3);
        expect(result.current.rows).toBe(3);
    });

    describe("effectiveBleedWidth", () => {
        it("should return bleed width in mm when bleed is enabled and unit is mm", () => {
            const { result } = renderHook(() => usePageViewSettings());

            expect(result.current.effectiveBleedWidth).toBe(3);
        });

        it("should convert inches to mm when bleed is enabled and unit is in", () => {
            mockSettingsState.bleedEdgeUnit = "in";
            mockSettingsState.bleedEdgeWidth = 0.1;

            const { result } = renderHook(() => usePageViewSettings());

            // 0.1 * 25.4 = 2.54
            expect(result.current.effectiveBleedWidth).toBeCloseTo(2.54);
        });

        it("should return 0 when bleed is disabled", () => {
            mockSettingsState.bleedEdge = false;

            const { result } = renderHook(() => usePageViewSettings());

            expect(result.current.effectiveBleedWidth).toBe(0);
        });
    });

    describe("dndDisabled", () => {
        it("should be false when sortBy is manual and no filters", () => {
            const { result } = renderHook(() => usePageViewSettings());

            expect(result.current.dndDisabled).toBe(false);
        });

        it("should be true when sortBy is not manual", () => {
            mockSettingsState.sortBy = "name";

            const { result } = renderHook(() => usePageViewSettings());

            expect(result.current.dndDisabled).toBe(true);
        });

        it("should be true when mana cost filter is active", () => {
            mockSettingsState.filterManaCost = ["3"];

            const { result } = renderHook(() => usePageViewSettings());

            expect(result.current.dndDisabled).toBe(true);
        });

        it("should be true when color filter is active", () => {
            mockSettingsState.filterColors = ["R"];

            const { result } = renderHook(() => usePageViewSettings());

            expect(result.current.dndDisabled).toBe(true);
        });

        it("should be true when type filter is active", () => {
            mockSettingsState.filterTypes = ["Creature"];

            const { result } = renderHook(() => usePageViewSettings());

            expect(result.current.dndDisabled).toBe(true);
        });

        it("should be true when category filter is active", () => {
            mockSettingsState.filterCategories = ["Commander"];

            const { result } = renderHook(() => usePageViewSettings());

            expect(result.current.dndDisabled).toBe(true);
        });
    });

    describe("sourceSettings", () => {
        it("should return computed source settings", () => {
            const { result } = renderHook(() => usePageViewSettings());

            expect(result.current.sourceSettings).toEqual({
                withBleedTargetMode: "global",
                withBleedTargetAmount: 3,
                noBleedTargetMode: "global",
                noBleedTargetAmount: 3,
            });
        });
    });
});
