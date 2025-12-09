import { describe, it, expect, beforeEach, vi } from "vitest";
import { useUndoRedoStore } from "./undoRedo";

describe("undoRedo store", () => {
    beforeEach(() => {
        // Reset the store before each test
        useUndoRedoStore.setState({
            undoStack: [],
            redoStack: [],
            isPerformingAction: false,
        });
    });

    describe("pushAction", () => {
        it("should add action to undo stack", () => {
            const action = {
                type: "DELETE_CARD" as const,
                description: "Delete test card",
                undo: vi.fn().mockResolvedValue(undefined),
                redo: vi.fn().mockResolvedValue(undefined),
            };

            useUndoRedoStore.getState().pushAction(action);

            const state = useUndoRedoStore.getState();
            expect(state.undoStack).toHaveLength(1);
            expect(state.undoStack[0].description).toBe("Delete test card");
            expect(state.undoStack[0].id).toBeDefined();
            expect(state.undoStack[0].timestamp).toBeDefined();
        });

        it("should clear redo stack when new action is pushed", () => {
            const action1 = {
                type: "DELETE_CARD" as const,
                description: "Action 1",
                undo: vi.fn().mockResolvedValue(undefined),
                redo: vi.fn().mockResolvedValue(undefined),
            };

            // Simulate having something in redo stack
            useUndoRedoStore.setState({
                redoStack: [{
                    id: "test-id",
                    type: "ADD_CARDS" as const,
                    description: "Old action",
                    timestamp: Date.now(),
                    undo: vi.fn().mockResolvedValue(undefined),
                    redo: vi.fn().mockResolvedValue(undefined),
                }],
            });

            useUndoRedoStore.getState().pushAction(action1);

            const state = useUndoRedoStore.getState();
            expect(state.redoStack).toHaveLength(0);
        });

        it("should respect max history size of 50", () => {
            for (let i = 0; i < 60; i++) {
                useUndoRedoStore.getState().pushAction({
                    type: "DELETE_CARD" as const,
                    description: `Action ${i}`,
                    undo: vi.fn().mockResolvedValue(undefined),
                    redo: vi.fn().mockResolvedValue(undefined),
                });
            }

            const state = useUndoRedoStore.getState();
            expect(state.undoStack).toHaveLength(50);
            // First 10 actions should be dropped
            expect(state.undoStack[0].description).toBe("Action 10");
        });

        it("should not record actions while isPerformingAction is true", () => {
            useUndoRedoStore.setState({ isPerformingAction: true });

            useUndoRedoStore.getState().pushAction({
                type: "DELETE_CARD" as const,
                description: "Should be ignored",
                undo: vi.fn().mockResolvedValue(undefined),
                redo: vi.fn().mockResolvedValue(undefined),
            });

            const state = useUndoRedoStore.getState();
            expect(state.undoStack).toHaveLength(0);
        });
    });

    describe("undo", () => {
        it("should call undo function and move action to redo stack", async () => {
            const undoFn = vi.fn().mockResolvedValue(undefined);
            const action = {
                type: "DELETE_CARD" as const,
                description: "Test action",
                undo: undoFn,
                redo: vi.fn().mockResolvedValue(undefined),
            };

            useUndoRedoStore.getState().pushAction(action);
            await useUndoRedoStore.getState().undo();

            expect(undoFn).toHaveBeenCalled();

            const state = useUndoRedoStore.getState();
            expect(state.undoStack).toHaveLength(0);
            expect(state.redoStack).toHaveLength(1);
        });

        it("should do nothing if undo stack is empty", async () => {
            await useUndoRedoStore.getState().undo();

            const state = useUndoRedoStore.getState();
            expect(state.undoStack).toHaveLength(0);
            expect(state.redoStack).toHaveLength(0);
        });

        it("should do nothing if isPerformingAction is true", async () => {
            const undoFn = vi.fn().mockResolvedValue(undefined);
            useUndoRedoStore.getState().pushAction({
                type: "DELETE_CARD" as const,
                description: "Test",
                undo: undoFn,
                redo: vi.fn().mockResolvedValue(undefined),
            });

            useUndoRedoStore.setState({ isPerformingAction: true });
            await useUndoRedoStore.getState().undo();

            expect(undoFn).not.toHaveBeenCalled();
        });
    });

    describe("redo", () => {
        it("should call redo function and move action back to undo stack", async () => {
            const redoFn = vi.fn().mockResolvedValue(undefined);
            const action = {
                type: "DELETE_CARD" as const,
                description: "Test action",
                undo: vi.fn().mockResolvedValue(undefined),
                redo: redoFn,
            };

            useUndoRedoStore.getState().pushAction(action);
            await useUndoRedoStore.getState().undo();
            await useUndoRedoStore.getState().redo();

            expect(redoFn).toHaveBeenCalled();

            const state = useUndoRedoStore.getState();
            expect(state.undoStack).toHaveLength(1);
            expect(state.redoStack).toHaveLength(0);
        });

        it("should do nothing if redo stack is empty", async () => {
            await useUndoRedoStore.getState().redo();

            const state = useUndoRedoStore.getState();
            expect(state.undoStack).toHaveLength(0);
            expect(state.redoStack).toHaveLength(0);
        });
    });

    describe("canUndo and canRedo", () => {
        it("should return false when stacks are empty", () => {
            expect(useUndoRedoStore.getState().canUndo()).toBe(false);
            expect(useUndoRedoStore.getState().canRedo()).toBe(false);
        });

        it("should return true when stacks have items", async () => {
            useUndoRedoStore.getState().pushAction({
                type: "DELETE_CARD" as const,
                description: "Test",
                undo: vi.fn().mockResolvedValue(undefined),
                redo: vi.fn().mockResolvedValue(undefined),
            });

            expect(useUndoRedoStore.getState().canUndo()).toBe(true);
            expect(useUndoRedoStore.getState().canRedo()).toBe(false);

            await useUndoRedoStore.getState().undo();

            expect(useUndoRedoStore.getState().canUndo()).toBe(false);
            expect(useUndoRedoStore.getState().canRedo()).toBe(true);
        });

        it("should return false when isPerformingAction is true", () => {
            useUndoRedoStore.getState().pushAction({
                type: "DELETE_CARD" as const,
                description: "Test",
                undo: vi.fn().mockResolvedValue(undefined),
                redo: vi.fn().mockResolvedValue(undefined),
            });

            useUndoRedoStore.setState({ isPerformingAction: true });

            expect(useUndoRedoStore.getState().canUndo()).toBe(false);
        });
    });

    describe("clearHistory", () => {
        it("should clear both undo and redo stacks", async () => {
            useUndoRedoStore.getState().pushAction({
                type: "DELETE_CARD" as const,
                description: "Test 1",
                undo: vi.fn().mockResolvedValue(undefined),
                redo: vi.fn().mockResolvedValue(undefined),
            });
            useUndoRedoStore.getState().pushAction({
                type: "DELETE_CARD" as const,
                description: "Test 2",
                undo: vi.fn().mockResolvedValue(undefined),
                redo: vi.fn().mockResolvedValue(undefined),
            });

            await useUndoRedoStore.getState().undo(); // Move one to redo

            useUndoRedoStore.getState().clearHistory();

            const state = useUndoRedoStore.getState();
            expect(state.undoStack).toHaveLength(0);
            expect(state.redoStack).toHaveLength(0);
        });
    });

    describe("getUndoDescription and getRedoDescription", () => {
        it("should return null when stacks are empty", () => {
            expect(useUndoRedoStore.getState().getUndoDescription()).toBeNull();
            expect(useUndoRedoStore.getState().getRedoDescription()).toBeNull();
        });

        it("should return description of last action", async () => {
            useUndoRedoStore.getState().pushAction({
                type: "DELETE_CARD" as const,
                description: "Delete Sol Ring",
                undo: vi.fn().mockResolvedValue(undefined),
                redo: vi.fn().mockResolvedValue(undefined),
            });

            expect(useUndoRedoStore.getState().getUndoDescription()).toBe("Delete Sol Ring");
            expect(useUndoRedoStore.getState().getRedoDescription()).toBeNull();

            await useUndoRedoStore.getState().undo();

            expect(useUndoRedoStore.getState().getUndoDescription()).toBeNull();
            expect(useUndoRedoStore.getState().getRedoDescription()).toBe("Delete Sol Ring");
        });
    });
});
