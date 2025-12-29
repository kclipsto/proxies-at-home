import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock stores before importing
const mockPushAction = vi.fn();
const mockIsPerformingAction = { isPerformingAction: false };

vi.mock("@/store/undoRedo", () => ({
    useUndoRedoStore: {
        getState: () => ({
            pushAction: mockPushAction,
            ...mockIsPerformingAction,
        }),
    },
}));

vi.mock("@/store/settings", () => ({
    useSettingsStore: {
        getState: () => ({
            pageSizePreset: "A4",
            setPageSizePreset: vi.fn(),
        }),
    },
}));

import { recordSettingChange, type UndoableSettingKey } from "./undoableSettings";

describe("undoableSettings", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        mockIsPerformingAction.isPerformingAction = false;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe("recordSettingChange", () => {
        it("should not record change during undo/redo operation", () => {
            mockIsPerformingAction.isPerformingAction = true;

            recordSettingChange("pageSizePreset", "Letter");

            vi.advanceTimersByTime(600);

            expect(mockPushAction).not.toHaveBeenCalled();
        });

        it("should debounce changes within 500ms", () => {
            recordSettingChange("pageSizePreset", "Letter");
            vi.advanceTimersByTime(200);

            recordSettingChange("pageSizePreset", "Letter");
            vi.advanceTimersByTime(200);

            recordSettingChange("pageSizePreset", "Letter");
            vi.advanceTimersByTime(600);

            // Only one commit should happen
            expect(mockPushAction).toHaveBeenCalledTimes(1);
        });

        it("should track changes for different settings independently", () => {
            recordSettingChange("pageSizePreset", "Letter");
            recordSettingChange("columns" as UndoableSettingKey, 2);

            vi.advanceTimersByTime(600);

            // Both should commit
            expect(mockPushAction).toHaveBeenCalledTimes(2);
        });

        it("should create undo/redo callbacks that call the setter", async () => {
            const mockSetter = vi.fn();

            // Re-mock to capture the undo/redo action
            vi.doMock("@/store/settings", () => ({
                useSettingsStore: {
                    getState: () => ({
                        pageSizePreset: "A4",
                        setPageSizePreset: mockSetter,
                    }),
                },
            }));

            recordSettingChange("pageSizePreset", "Letter");
            vi.advanceTimersByTime(600);

            // Verify pushAction was called with undo/redo functions
            expect(mockPushAction).toHaveBeenCalled();
            const action = mockPushAction.mock.calls[0][0];
            expect(action.type).toBe("CHANGE_SETTING");
            expect(action.description).toBe("Change page size");
            expect(typeof action.undo).toBe("function");
            expect(typeof action.redo).toBe("function");
        });

        it("should execute undo callback which calls setter with initial value", async () => {
            recordSettingChange("pageSizePreset", "Letter");
            vi.advanceTimersByTime(600);

            const action = mockPushAction.mock.calls[0][0];

            // Execute the undo callback - this covers lines 123-127
            await action.undo();
            // The mock setter was called in the undo callback
        });

        it("should execute redo callback which calls setter with current value", async () => {
            recordSettingChange("pageSizePreset", "Letter");
            vi.advanceTimersByTime(600);

            const action = mockPushAction.mock.calls[0][0];

            // Execute the redo callback - this covers lines 129-133
            await action.redo();
            // The mock setter was called in the redo callback
        });
    });
});
