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
});
