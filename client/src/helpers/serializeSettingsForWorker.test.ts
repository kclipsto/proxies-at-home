import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock settings store with vi.hoisted
const mockSettingsState = vi.hoisted(() => ({
    bleedEdge: true,
    bleedEdgeWidth: 3,
    bleedEdgeUnit: "mm" as "mm" | "in",
    withBleedSourceAmount: 3,
    withBleedTargetMode: "global" as const,
    withBleedTargetAmount: 2,
    noBleedTargetMode: "global" as const,
    noBleedTargetAmount: 3,
    darkenMode: "none" as const,
    dpi: 300,
    pageWidth: 210,
    pageHeight: 297,
    pageSizeUnit: "mm" as const,
    columns: 3,
    rows: 3,
    cardSpacingMm: 0,
    cardPositionX: 0,
    cardPositionY: 0,
    guideColor: "#000000",
    guideWidth: 1,
    cutLineStyle: "edges" as const,
    perCardGuideStyle: "corners" as const,
    guidePlacement: "inside" as const,
    cutGuideLengthMm: 5,
}));

vi.mock("../store/settings", () => ({
    useSettingsStore: {
        getState: () => mockSettingsState,
    },
}));

import { serializePdfSettingsForWorker } from "./serializeSettingsForWorker";

describe("serializeSettingsForWorker", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset to defaults
        mockSettingsState.bleedEdgeUnit = "mm";
        mockSettingsState.bleedEdgeWidth = 3;
    });

    describe("serializePdfSettingsForWorker", () => {
        it("should serialize bleed settings in mm", () => {
            const result = serializePdfSettingsForWorker();

            expect(result.bleedEdge).toBe(true);
            expect(result.bleedEdgeWidthMm).toBe(3);
        });

        it("should convert bleed width from inches to mm", () => {
            mockSettingsState.bleedEdgeUnit = "in";
            mockSettingsState.bleedEdgeWidth = 0.1;

            const result = serializePdfSettingsForWorker();

            // 0.1 inches * 25.4 = 2.54 mm
            expect(result.bleedEdgeWidthMm).toBeCloseTo(2.54);
        });

        it("should include source settings", () => {
            const result = serializePdfSettingsForWorker();

            expect(result.sourceSettings).toEqual({
                withBleedTargetMode: "global",
                withBleedTargetAmount: 2,
                noBleedTargetMode: "global",
                noBleedTargetAmount: 3,
            });
        });

        it("should include page layout settings", () => {
            const result = serializePdfSettingsForWorker();

            expect(result.pageWidth).toBe(210);
            expect(result.pageHeight).toBe(297);
            expect(result.pageSizeUnit).toBe("mm");
            expect(result.columns).toBe(3);
            expect(result.rows).toBe(3);
        });

        it("should include positioning settings", () => {
            const result = serializePdfSettingsForWorker();

            expect(result.cardSpacingMm).toBe(0);
            expect(result.cardPositionX).toBe(0);
            expect(result.cardPositionY).toBe(0);
        });

        it("should include guide settings", () => {
            const result = serializePdfSettingsForWorker();

            expect(result.guideColor).toBe("#000000");
            expect(result.guideWidthCssPx).toBe(1);
            expect(result.cutLineStyle).toBe("edges");
            expect(result.perCardGuideStyle).toBe("corners");
            expect(result.guidePlacement).toBe("inside");
            expect(result.cutGuideLengthMm).toBe(5);
        });

        it("should include darken and DPI settings", () => {
            const result = serializePdfSettingsForWorker();

            expect(result.darkenMode).toBe("none");
            expect(result.dpi).toBe(300);
        });

        it("should include withBleedSourceAmount", () => {
            const result = serializePdfSettingsForWorker();

            expect(result.withBleedSourceAmount).toBe(3);
        });
    });
});
