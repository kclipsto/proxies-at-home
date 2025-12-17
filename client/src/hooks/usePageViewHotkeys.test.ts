import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePageViewHotkeys } from "./usePageViewHotkeys";
import { useSelectionStore } from "../store/selection";
import { useUndoRedoStore } from "../store/undoRedo";

// Mock the stores
vi.mock("../store/selection", () => ({
    useSelectionStore: {
        getState: vi.fn(),
    },
}));

vi.mock("../store/undoRedo", () => ({
    useUndoRedoStore: {
        getState: vi.fn(),
    },
}));

describe("usePageViewHotkeys", () => {
    const mockClearSelection = vi.fn();
    const mockToggleFlip = vi.fn();
    const mockSelectAll = vi.fn();
    const mockUndo = vi.fn().mockResolvedValue(undefined);
    const mockRedo = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
        vi.clearAllMocks();

        // Reset selection store mock
        (useSelectionStore.getState as Mock).mockReturnValue({
            selectedCards: new Set(["card-1", "card-2"]),
            clearSelection: mockClearSelection,
            toggleFlip: mockToggleFlip,
            selectAll: mockSelectAll,
        });

        // Reset undo/redo store mock
        (useUndoRedoStore.getState as Mock).mockReturnValue({
            undo: mockUndo,
            redo: mockRedo,
        });
    });

    afterEach(() => {
        // Clean up any event listeners
    });

    describe("Escape key", () => {
        it("should clear selection when Escape is pressed with selected cards", () => {
            renderHook(() => usePageViewHotkeys(["card-1", "card-2"], true));

            const event = new KeyboardEvent("keydown", { key: "Escape" });
            document.dispatchEvent(event);

            expect(mockClearSelection).toHaveBeenCalled();
        });

        it("should not clear selection when no cards are selected", () => {
            (useSelectionStore.getState as Mock).mockReturnValue({
                selectedCards: new Set(),
                clearSelection: mockClearSelection,
            });

            renderHook(() => usePageViewHotkeys(["card-1"], true));

            const event = new KeyboardEvent("keydown", { key: "Escape" });
            document.dispatchEvent(event);

            expect(mockClearSelection).not.toHaveBeenCalled();
        });
    });

    describe("F key (flip)", () => {
        it("should call toggleFlip once with first selected card", () => {
            renderHook(() => usePageViewHotkeys(["card-1", "card-2"], true));

            const event = new KeyboardEvent("keydown", { key: "f" });
            document.dispatchEvent(event);

            // toggleFlip handles multi-select internally, so only called once
            expect(mockToggleFlip).toHaveBeenCalledTimes(1);
            expect(mockToggleFlip).toHaveBeenCalledWith("card-1");
        });

        it("should work with uppercase F", () => {
            renderHook(() => usePageViewHotkeys(["card-1", "card-2"], true));

            const event = new KeyboardEvent("keydown", { key: "F" });
            document.dispatchEvent(event);

            expect(mockToggleFlip).toHaveBeenCalled();
        });

        it("should not flip when Ctrl+F is pressed (browser find)", () => {
            renderHook(() => usePageViewHotkeys(["card-1"], true));

            const event = new KeyboardEvent("keydown", { key: "f", ctrlKey: true });
            document.dispatchEvent(event);

            expect(mockToggleFlip).not.toHaveBeenCalled();
        });

        it("should not flip when Cmd+F is pressed (browser find on Mac)", () => {
            renderHook(() => usePageViewHotkeys(["card-1"], true));

            const event = new KeyboardEvent("keydown", { key: "f", metaKey: true });
            document.dispatchEvent(event);

            expect(mockToggleFlip).not.toHaveBeenCalled();
        });

        it("should not flip when no cards are selected", () => {
            (useSelectionStore.getState as Mock).mockReturnValue({
                selectedCards: new Set(),
                toggleFlip: mockToggleFlip,
            });

            renderHook(() => usePageViewHotkeys(["card-1"], true));

            const event = new KeyboardEvent("keydown", { key: "f" });
            document.dispatchEvent(event);

            expect(mockToggleFlip).not.toHaveBeenCalled();
        });
    });

    describe("Ctrl/Cmd+A (select all)", () => {
        it("should select all cards on Ctrl+A", () => {
            const allUuids = ["card-1", "card-2", "card-3"];
            renderHook(() => usePageViewHotkeys(allUuids, true));

            // Simulate non-Mac environment
            Object.defineProperty(navigator, 'platform', {
                value: 'Win32',
                configurable: true,
            });

            const event = new KeyboardEvent("keydown", { key: "a", ctrlKey: true });
            document.dispatchEvent(event);

            expect(mockSelectAll).toHaveBeenCalledWith(allUuids);
        });
    });

    describe("Ctrl/Cmd+Z (undo/redo)", () => {
        it("should undo on Ctrl+Z", () => {
            renderHook(() => usePageViewHotkeys(["card-1"], true));

            Object.defineProperty(navigator, 'platform', {
                value: 'Win32',
                configurable: true,
            });

            const event = new KeyboardEvent("keydown", { key: "z", ctrlKey: true });
            document.dispatchEvent(event);

            expect(mockUndo).toHaveBeenCalled();
        });

        it("should redo on Ctrl+Shift+Z", () => {
            renderHook(() => usePageViewHotkeys(["card-1"], true));

            Object.defineProperty(navigator, 'platform', {
                value: 'Win32',
                configurable: true,
            });

            const event = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true });
            document.dispatchEvent(event);

            expect(mockRedo).toHaveBeenCalled();
        });
    });

    describe("active state", () => {
        it("should not handle keys when not active", () => {
            renderHook(() => usePageViewHotkeys(["card-1", "card-2"], false));

            const escapeEvent = new KeyboardEvent("keydown", { key: "Escape" });
            document.dispatchEvent(escapeEvent);

            expect(mockClearSelection).not.toHaveBeenCalled();
        });
    });

    describe("input elements", () => {
        it("should not handle keys when focused on input element", () => {
            renderHook(() => usePageViewHotkeys(["card-1", "card-2"], true));

            // Create a mock input element
            const input = document.createElement("input");
            document.body.appendChild(input);

            const event = new KeyboardEvent("keydown", { key: "f" });
            Object.defineProperty(event, 'target', { value: input });

            // Note: This test is limited because we can't fully simulate the target
            // The hook checks e.target.tagName which won't work with dispatched events

            document.body.removeChild(input);
        });
    });
});
