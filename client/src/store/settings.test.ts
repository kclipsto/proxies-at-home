import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSettingsStore } from "./settings";

// Mock indexedDbStorage
vi.mock("./indexedDbStorage", () => ({
    indexedDbStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
    },
}));

describe("useSettingsStore", () => {
    beforeEach(() => {
        useSettingsStore.getState().resetSettings();
        vi.clearAllMocks();
    });

    it("should have default settings", () => {
        const state = useSettingsStore.getState();
        expect(state.pageSizePreset).toBe("Letter");
        expect(state.pageOrientation).toBe("portrait");
        expect(state.columns).toBe(3);
        expect(state.rows).toBe(3);
    });

    it("should update page size preset", () => {
        const { setPageSizePreset } = useSettingsStore.getState();

        setPageSizePreset("A4");

        const state = useSettingsStore.getState();
        expect(state.pageSizePreset).toBe("A4");
        expect(state.pageSizeUnit).toBe("mm");
        expect(state.pageWidth).toBe(210);
        expect(state.pageHeight).toBe(297);
    });

    it("should swap page orientation", () => {
        const { swapPageOrientation } = useSettingsStore.getState();

        swapPageOrientation();

        let state = useSettingsStore.getState();
        expect(state.pageOrientation).toBe("landscape");
        expect(state.pageWidth).toBe(11);
        expect(state.pageHeight).toBe(8.5);

        swapPageOrientation();

        state = useSettingsStore.getState();
        expect(state.pageOrientation).toBe("portrait");
        expect(state.pageWidth).toBe(8.5);
        expect(state.pageHeight).toBe(11);
    });

    it("should update simple settings", () => {
        const state = useSettingsStore.getState();

        state.setColumns(4);
        expect(useSettingsStore.getState().columns).toBe(4);

        state.setRows(5);
        expect(useSettingsStore.getState().rows).toBe(5);

        state.setBleedEdgeWidth(2);
        expect(useSettingsStore.getState().bleedEdgeWidth).toBe(2);

        state.setBleedEdge(false);
        expect(useSettingsStore.getState().bleedEdge).toBe(false);

        state.setGuideColor("#000000");
        expect(useSettingsStore.getState().guideColor).toBe("#000000");

        state.setGuideWidth(1);
        expect(useSettingsStore.getState().guideWidth).toBe(1);

        state.setZoom(2);
        expect(useSettingsStore.getState().zoom).toBe(2);

        state.setCardSpacingMm(5);
        expect(useSettingsStore.getState().cardSpacingMm).toBe(5);

        state.setCardPositionX(10);
        expect(useSettingsStore.getState().cardPositionX).toBe(10);

        state.setCardPositionY(20);
        expect(useSettingsStore.getState().cardPositionY).toBe(20);

        state.setDpi(600);
        expect(useSettingsStore.getState().dpi).toBe(600);

        state.setGlobalLanguage("es");
        expect(useSettingsStore.getState().globalLanguage).toBe("es");
    });

    it("should reset settings", () => {
        const state = useSettingsStore.getState();
        state.setColumns(10);
        state.resetSettings();

        expect(useSettingsStore.getState().columns).toBe(3);
    });

    it("should migrate state correctly", () => {
        const options = useSettingsStore.persist.getOptions();
        const migrate = options.migrate;

        if (!migrate) {
            throw new Error("Migrate function not found");
        }

        // Test invalid state
        expect(migrate(null, 0)).toEqual(expect.objectContaining({ pageSizePreset: "Letter" }));
        expect(migrate("invalid", 0)).toEqual(expect.objectContaining({ pageSizePreset: "Letter" }));

        // Test version < 2 (should remove page dimensions)
        const oldState = {
            pageSizePreset: "A4",
            pageWidth: 100,
            pageHeight: 200,
            pageSizeUnit: "mm",
            columns: 5
        };

        const migrated = migrate(oldState, 1) as Record<string, unknown>;
        expect(migrated.columns).toBe(5);
        expect(migrated.pageSizePreset).toBe("A4");
        // Migration merges defaultPageSettings, so these will be present
        expect(migrated.pageWidth).toBe(8.5);
        expect(migrated.pageHeight).toBe(11);
        expect(migrated.pageSizeUnit).toBe("in");

        // Test version >= 2 (should keep state)
        const newState = {
            pageSizePreset: "A4",
            pageWidth: 210,
            pageHeight: 297,
            pageSizeUnit: "mm",
            columns: 5
        };

        const migratedNew = migrate(newState, 2);
        expect(migratedNew).toEqual(expect.objectContaining(newState));
    });

    it("should merge state correctly", () => {
        const options = useSettingsStore.persist.getOptions();
        const merge = options.merge;

        if (!merge) {
            throw new Error("Merge function not found");
        }

        const currentState = useSettingsStore.getState();

        // Test merging persisted state with landscape orientation
        const persistedState = {
            pageSizePreset: "A4",
            pageOrientation: "landscape",
            columns: 4
        };

        const merged = merge(persistedState, currentState) as Record<string, unknown>;

        expect(merged.columns).toBe(4);
        expect(merged.pageSizePreset).toBe("A4");
        expect(merged.pageOrientation).toBe("landscape");
        // A4 is 210x297 mm. Landscape should be 297x210.
        expect(merged.pageWidth).toBe(297);
        expect(merged.pageHeight).toBe(210);
        expect(merged.pageSizeUnit).toBe("mm");
    });

    describe("Custom Page Size", () => {
        it("should set custom page width and height", () => {
            const { setPageWidth, setPageHeight } = useSettingsStore.getState();

            setPageWidth(10);
            let state = useSettingsStore.getState();
            expect(state.pageWidth).toBe(10);
            expect(state.customPageWidth).toBe(10);
            expect(state.pageSizePreset).toBe("Custom");

            setPageHeight(20);
            state = useSettingsStore.getState();
            expect(state.pageHeight).toBe(20);
            expect(state.customPageHeight).toBe(20);
            expect(state.pageSizePreset).toBe("Custom");
        });

        it("should convert units correctly", () => {
            const { setPageWidth, setPageHeight, setPageSizeUnit } = useSettingsStore.getState();

            // Set initial values in inches
            setPageWidth(10);
            setPageHeight(20);

            // Convert to mm
            setPageSizeUnit("mm");
            let state = useSettingsStore.getState();
            expect(state.pageSizeUnit).toBe("mm");
            expect(state.pageWidth).toBeCloseTo(254);
            expect(state.pageHeight).toBeCloseTo(508);
            expect(state.customPageWidth).toBeCloseTo(254);
            expect(state.customPageHeight).toBeCloseTo(508);
            expect(state.customPageUnit).toBe("mm");

            // Convert back to inches
            setPageSizeUnit("in");
            state = useSettingsStore.getState();
            expect(state.pageSizeUnit).toBe("in");
            expect(state.pageWidth).toBeCloseTo(10);
            expect(state.pageHeight).toBeCloseTo(20);
        });

        it("should persist custom values when switching presets", () => {
            const { setPageWidth, setPageHeight, setPageSizePreset } = useSettingsStore.getState();

            // Set custom values
            setPageWidth(15);
            setPageHeight(25);

            // Switch to preset
            setPageSizePreset("Letter");
            let state = useSettingsStore.getState();
            expect(state.pageSizePreset).toBe("Letter");
            expect(state.pageWidth).toBe(8.5);

            // Switch back to Custom
            setPageSizePreset("Custom");
            state = useSettingsStore.getState();
            expect(state.pageSizePreset).toBe("Custom");
            expect(state.pageWidth).toBe(15);
            expect(state.pageHeight).toBe(25);
        });

        it("should sync custom values on orientation swap", () => {
            const { setPageWidth, setPageHeight, swapPageOrientation } = useSettingsStore.getState();

            // Set custom values
            setPageWidth(10);
            setPageHeight(20);

            // Swap orientation
            swapPageOrientation();
            const state = useSettingsStore.getState();
            expect(state.pageOrientation).toBe("landscape");
            expect(state.pageWidth).toBe(20);
            expect(state.pageHeight).toBe(10);
            // Verify custom values are also swapped
            expect(state.customPageWidth).toBe(20);
            expect(state.customPageHeight).toBe(10);
        });

        it("should merge custom state correctly", () => {
            const options = useSettingsStore.persist.getOptions();
            const merge = options.merge;

            if (!merge) throw new Error("Merge function not found");

            const currentState = useSettingsStore.getState();

            // Test merging persisted custom state
            const persistedState = {
                pageSizePreset: "Custom",
                customPageWidth: 12.5,
                customPageHeight: 18.5,
                customPageUnit: "in",
                columns: 4
            };

            const merged = merge(persistedState, currentState) as Record<string, unknown>;

            expect(merged.pageSizePreset).toBe("Custom");
            expect(merged.pageWidth).toBe(12.5);
            expect(merged.pageHeight).toBe(18.5);
            expect(merged.pageSizeUnit).toBe("in");
        });
    });
});
