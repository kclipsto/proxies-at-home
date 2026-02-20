import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useSettingsStore } from "./settings";
import { CONSTANTS } from "@/constants/commonConstants";

// Mock dependencies
vi.mock("./undoRedo", () => ({
    useUndoRedoStore: {
        getState: vi.fn(() => ({
            pushAction: vi.fn(),
        })),
    },
}));

vi.mock("@/helpers/undoableSettings", () => ({
    recordSettingChange: vi.fn(),
}));

describe("useSettingsStore", () => {
    // Store initial state for restoration
    const initialState = useSettingsStore.getState();

    beforeEach(() => {
        // Reset to a known state before each test
        useSettingsStore.setState({
            pageWidth: 8.5,
            pageHeight: 11,
            pageSizeUnit: "in",
            pageSizePreset: "Letter",
            pageOrientation: "portrait",
            customPageWidth: 8.5,
            customPageHeight: 11,
            customPageUnit: "in",
            columns: 3,
            rows: 3,
            bleedEdgeWidth: 1,
            bleedEdge: true,
            zoom: 1,
            dpi: 900,
            sortBy: "manual",
            sortOrder: "asc",
            filterManaCost: [],
            filterColors: [],
            filterTypes: [],
            filterCategories: [],
            filterMatchType: "partial",
        });
    });

    afterEach(() => {
        // Restore initial state
        useSettingsStore.setState(initialState);
    });

    describe("setPageSizePreset", () => {
        it("should set A4 preset with correct dimensions", () => {
            const { setPageSizePreset } = useSettingsStore.getState();

            setPageSizePreset("A4");

            const state = useSettingsStore.getState();
            expect(state.pageSizePreset).toBe("A4");
            expect(state.pageWidth).toBe(210);
            expect(state.pageHeight).toBe(297);
            expect(state.pageSizeUnit).toBe("mm");
            expect(state.pageOrientation).toBe("portrait");
        });

        it("should set Letter preset with correct dimensions", () => {
            const { setPageSizePreset } = useSettingsStore.getState();

            setPageSizePreset("Letter");

            const state = useSettingsStore.getState();
            expect(state.pageSizePreset).toBe("Letter");
            expect(state.pageWidth).toBe(8.5);
            expect(state.pageHeight).toBe(11);
            expect(state.pageSizeUnit).toBe("in");
        });

        it("should restore custom dimensions when switching to Custom", () => {
            useSettingsStore.setState({
                customPageWidth: 10,
                customPageHeight: 12,
                customPageUnit: "in"
            });
            const { setPageSizePreset } = useSettingsStore.getState();

            setPageSizePreset("Custom");

            const state = useSettingsStore.getState();
            expect(state.pageSizePreset).toBe("Custom");
            expect(state.pageWidth).toBe(10);
            expect(state.pageHeight).toBe(12);
        });
    });

    describe("setPageWidth", () => {
        it("should update width and switch to Custom preset", () => {
            const { setPageWidth } = useSettingsStore.getState();

            setPageWidth(9);

            const state = useSettingsStore.getState();
            expect(state.pageWidth).toBe(9);
            expect(state.customPageWidth).toBe(9);
            expect(state.pageSizePreset).toBe("Custom");
        });
    });

    describe("setPageHeight", () => {
        it("should update height and switch to Custom preset", () => {
            const { setPageHeight } = useSettingsStore.getState();

            setPageHeight(14);

            const state = useSettingsStore.getState();
            expect(state.pageHeight).toBe(14);
            expect(state.customPageHeight).toBe(14);
            expect(state.pageSizePreset).toBe("Custom");
        });
    });

    describe("setPageSizeUnit", () => {
        it("should convert dimensions from inches to mm", () => {
            const { setPageSizeUnit } = useSettingsStore.getState();

            setPageSizeUnit("mm");

            const state = useSettingsStore.getState();
            expect(state.pageSizeUnit).toBe("mm");
            expect(state.pageWidth).toBeCloseTo(8.5 * CONSTANTS.MM_PER_IN, 1);
            expect(state.pageHeight).toBeCloseTo(11 * CONSTANTS.MM_PER_IN, 1);
        });

        it("should convert dimensions from mm to inches", () => {
            useSettingsStore.setState({
                pageWidth: 210,
                pageHeight: 297,
                pageSizeUnit: "mm"
            });
            const { setPageSizeUnit } = useSettingsStore.getState();

            setPageSizeUnit("in");

            const state = useSettingsStore.getState();
            expect(state.pageSizeUnit).toBe("in");
            expect(state.pageWidth).toBeCloseTo(210 / CONSTANTS.MM_PER_IN, 1);
            expect(state.pageHeight).toBeCloseTo(297 / CONSTANTS.MM_PER_IN, 1);
        });

        it("should do nothing if already in target unit", () => {
            const { setPageSizeUnit } = useSettingsStore.getState();

            setPageSizeUnit("in");

            const state = useSettingsStore.getState();
            expect(state.pageWidth).toBe(8.5);
        });
    });

    describe("swapPageOrientation", () => {
        it("should swap width and height", () => {
            const { swapPageOrientation } = useSettingsStore.getState();

            swapPageOrientation();

            const state = useSettingsStore.getState();
            expect(state.pageWidth).toBe(11);
            expect(state.pageHeight).toBe(8.5);
            expect(state.pageOrientation).toBe("landscape");
        });

        it("should swap back to portrait", () => {
            useSettingsStore.setState({ pageOrientation: "landscape" });
            const { swapPageOrientation } = useSettingsStore.getState();

            swapPageOrientation();

            const state = useSettingsStore.getState();
            expect(state.pageOrientation).toBe("portrait");
        });

        it("should also swap custom dimensions when in Custom mode", () => {
            useSettingsStore.setState({
                pageSizePreset: "Custom",
                customPageWidth: 10,
                customPageHeight: 12
            });
            const { swapPageOrientation } = useSettingsStore.getState();

            swapPageOrientation();

            const state = useSettingsStore.getState();
            expect(state.customPageWidth).toBe(12);
            expect(state.customPageHeight).toBe(10);
        });
    });

    describe("simple setters", () => {
        it("setColumns should update columns", () => {
            const { setColumns } = useSettingsStore.getState();
            setColumns(4);
            expect(useSettingsStore.getState().columns).toBe(4);
        });

        it("setRows should update rows", () => {
            const { setRows } = useSettingsStore.getState();
            setRows(4);
            expect(useSettingsStore.getState().rows).toBe(4);
        });

        it("setBleedEdgeWidth should update bleedEdgeWidth", () => {
            const { setBleedEdgeWidth } = useSettingsStore.getState();
            setBleedEdgeWidth(2);
            expect(useSettingsStore.getState().bleedEdgeWidth).toBe(2);
        });

        it("setBleedEdge should update bleedEdge", () => {
            const { setBleedEdge } = useSettingsStore.getState();
            setBleedEdge(false);
            expect(useSettingsStore.getState().bleedEdge).toBe(false);
        });

        it("setZoom should update zoom", () => {
            const { setZoom } = useSettingsStore.getState();
            setZoom(1.5);
            expect(useSettingsStore.getState().zoom).toBe(1.5);
        });

        it("setDpi should update dpi", () => {
            const { setDpi } = useSettingsStore.getState();
            setDpi(600);
            expect(useSettingsStore.getState().dpi).toBe(600);
        });

        it("setSortBy should update sortBy", () => {
            const { setSortBy } = useSettingsStore.getState();
            setSortBy("name");
            expect(useSettingsStore.getState().sortBy).toBe("name");
        });

        it("setSortOrder should update sortOrder", () => {
            const { setSortOrder } = useSettingsStore.getState();
            setSortOrder("desc");
            expect(useSettingsStore.getState().sortOrder).toBe("desc");
        });
    });

    describe("setCardSpacingMm", () => {
        it("should update card spacing", () => {
            const { setCardSpacingMm } = useSettingsStore.getState();
            setCardSpacingMm(2);
            expect(useSettingsStore.getState().cardSpacingMm).toBe(2);
        });

        it("should clamp negative values to 0", () => {
            const { setCardSpacingMm } = useSettingsStore.getState();
            setCardSpacingMm(-5);
            expect(useSettingsStore.getState().cardSpacingMm).toBe(0);
        });
    });



    describe("filter settings", () => {
        it("setFilterManaCost should update filter", () => {
            const { setFilterManaCost } = useSettingsStore.getState();
            setFilterManaCost([1, 2, 3]);
            expect(useSettingsStore.getState().filterManaCost).toEqual([1, 2, 3]);
        });

        it("setFilterColors should update filter", () => {
            const { setFilterColors } = useSettingsStore.getState();
            setFilterColors(["W", "U", "B"]);
            expect(useSettingsStore.getState().filterColors).toEqual(["W", "U", "B"]);
        });

        it("setFilterTypes should update filter", () => {
            const { setFilterTypes } = useSettingsStore.getState();
            setFilterTypes(["Creature", "Instant"]);
            expect(useSettingsStore.getState().filterTypes).toEqual(["Creature", "Instant"]);
        });

        it("setFilterCategories should update filter", () => {
            const { setFilterCategories } = useSettingsStore.getState();
            setFilterCategories(["Main", "Sideboard"]);
            expect(useSettingsStore.getState().filterCategories).toEqual(["Main", "Sideboard"]);
        });



        it("setFilterMatchType should update match type", () => {
            const { setFilterMatchType } = useSettingsStore.getState();
            setFilterMatchType("exact");
            expect(useSettingsStore.getState().filterMatchType).toBe("exact");
        });
    });

    describe("additional settings", () => {
        it("setDecklistSortAlpha should update setting", () => {
            const { setDecklistSortAlpha } = useSettingsStore.getState();
            setDecklistSortAlpha(true);
            expect(useSettingsStore.getState().decklistSortAlpha).toBe(true);
        });

        it("setShowProcessingToasts should update setting", () => {
            const { setShowProcessingToasts } = useSettingsStore.getState();
            setShowProcessingToasts(false);
            expect(useSettingsStore.getState().showProcessingToasts).toBe(false);
        });

        it("setDefaultCardbackId should update setting", () => {
            const { setDefaultCardbackId } = useSettingsStore.getState();
            setDefaultCardbackId("custom-back");
            expect(useSettingsStore.getState().defaultCardbackId).toBe("custom-back");
        });

        it("setExportMode should update setting", () => {
            const { setExportMode } = useSettingsStore.getState();
            setExportMode("duplex");
            expect(useSettingsStore.getState().exportMode).toBe("duplex");
        });

        it("setHasHydrated should update setting", () => {
            const { setHasHydrated } = useSettingsStore.getState();
            setHasHydrated(true);
            expect(useSettingsStore.getState().hasHydrated).toBe(true);
        });
    });

    describe("bleed settings", () => {
        it("setWithBleedSourceAmount should update setting", () => {
            const { setWithBleedSourceAmount } = useSettingsStore.getState();
            setWithBleedSourceAmount(5);
            expect(useSettingsStore.getState().withBleedSourceAmount).toBe(5);
        });

        it("setWithBleedTargetMode should update setting", () => {
            const { setWithBleedTargetMode } = useSettingsStore.getState();
            setWithBleedTargetMode("none");
            expect(useSettingsStore.getState().withBleedTargetMode).toBe("none");
        });

        it("setWithBleedTargetAmount should update setting", () => {
            const { setWithBleedTargetAmount } = useSettingsStore.getState();
            setWithBleedTargetAmount(4);
            expect(useSettingsStore.getState().withBleedTargetAmount).toBe(4);
        });

        it("setNoBleedTargetMode should update setting", () => {
            const { setNoBleedTargetMode } = useSettingsStore.getState();
            setNoBleedTargetMode("manual");
            expect(useSettingsStore.getState().noBleedTargetMode).toBe("manual");
        });

        it("setNoBleedTargetAmount should update setting", () => {
            const { setNoBleedTargetAmount } = useSettingsStore.getState();
            setNoBleedTargetAmount(2);
            expect(useSettingsStore.getState().noBleedTargetAmount).toBe(2);
        });
    });

    describe("guide settings", () => {
        it("setGuideColor should update setting", () => {
            const { setGuideColor } = useSettingsStore.getState();
            setGuideColor("#FF0000");
            expect(useSettingsStore.getState().guideColor).toBe("#FF0000");
        });

        it("setGuideWidth should update setting", () => {
            const { setGuideWidth } = useSettingsStore.getState();
            setGuideWidth(2);
            expect(useSettingsStore.getState().guideWidth).toBe(2);
        });

        it("setCutLineStyle should update setting", () => {
            const { setCutLineStyle } = useSettingsStore.getState();
            setCutLineStyle("edges");
            expect(useSettingsStore.getState().cutLineStyle).toBe("edges");
        });

        it("setPerCardGuideStyle should update setting", () => {
            const { setPerCardGuideStyle } = useSettingsStore.getState();
            setPerCardGuideStyle("rounded-corners");
            expect(useSettingsStore.getState().perCardGuideStyle).toBe("rounded-corners");
        });

        it("setGuidePlacement should update setting", () => {
            const { setGuidePlacement } = useSettingsStore.getState();
            setGuidePlacement("inside");
            expect(useSettingsStore.getState().guidePlacement).toBe("inside");
        });
    });

    describe("position settings", () => {
        it("setCardPositionX should update setting", () => {
            const { setCardPositionX } = useSettingsStore.getState();
            setCardPositionX(5);
            expect(useSettingsStore.getState().cardPositionX).toBe(5);
        });

        it("setCardPositionY should update setting", () => {
            const { setCardPositionY } = useSettingsStore.getState();
            setCardPositionY(10);
            expect(useSettingsStore.getState().cardPositionY).toBe(10);
        });
    });

    describe("language and panel width", () => {
        it("setGlobalLanguage should update setting", () => {
            const { setGlobalLanguage } = useSettingsStore.getState();
            setGlobalLanguage("de");
            expect(useSettingsStore.getState().globalLanguage).toBe("de");
        });



        it("setBleedEdgeUnit should update setting", () => {
            const { setBleedEdgeUnit } = useSettingsStore.getState();
            setBleedEdgeUnit("in");
            expect(useSettingsStore.getState().bleedEdgeUnit).toBe("in");
        });

        it("setDarkenMode should update setting", () => {
            const { setDarkenMode } = useSettingsStore.getState();
            setDarkenMode('darken-all');
            expect(useSettingsStore.getState().darkenMode).toBe('darken-all');
        });
    });

    describe("resetSettings", () => {
        it("should reset to default settings", () => {
            // Modify some settings first
            useSettingsStore.setState({
                columns: 5,
                rows: 5,
                zoom: 2,
                sortBy: "name",
            });

            const { resetSettings } = useSettingsStore.getState();
            resetSettings();

            const state = useSettingsStore.getState();
            expect(state.columns).toBe(3);
            expect(state.rows).toBe(3);
            expect(state.zoom).toBe(1);
            expect(state.sortBy).toBe("manual");
        });
    });
});
