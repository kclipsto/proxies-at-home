import { create } from "zustand";

/**
 * Action types that can be undone/redone
 */
export type ActionType =
    | "ADD_CARDS"
    | "DELETE_CARD"
    | "DUPLICATE_CARD"
    | "REORDER_CARDS"
    | "REORDER_MULTIPLE_CARDS"
    | "CHANGE_ARTWORK"
    | "CHANGE_CARDBACK"
    | "CHANGE_SETTING"
    | "UPDATE_BLEED_SETTINGS";

/**
 * Represents an undoable action in the history
 */
export interface UndoableAction {
    id: string;
    type: ActionType;
    timestamp: number;
    description: string;
    /** Function to reverse this action */
    undo: () => Promise<void>;
    /** Function to replay this action */
    redo: () => Promise<void>;
}

const MAX_HISTORY_SIZE = 50;

interface UndoRedoState {
    undoStack: UndoableAction[];
    redoStack: UndoableAction[];
    isPerformingAction: boolean; // Prevents recording during undo/redo
}

interface UndoRedoActions {
    /** Push a new undoable action onto the stack */
    pushAction: (action: Omit<UndoableAction, "id" | "timestamp">) => void;
    /** Undo the last action */
    undo: () => Promise<void>;
    /** Redo the last undone action */
    redo: () => Promise<void>;
    /** Check if undo is available */
    canUndo: () => boolean;
    /** Check if redo is available */
    canRedo: () => boolean;
    /** Clear all history (called on "Clear All Cards") */
    clearHistory: () => void;
    /** Get the description of the action that would be undone */
    getUndoDescription: () => string | null;
    /** Get the description of the action that would be redone */
    getRedoDescription: () => string | null;
}

type UndoRedoStore = UndoRedoState & UndoRedoActions;

export const useUndoRedoStore = create<UndoRedoStore>()((set, get) => ({
    undoStack: [],
    redoStack: [],
    isPerformingAction: false,

    pushAction: (action) => {
        // Don't record actions during undo/redo operations
        if (get().isPerformingAction) return;

        const newAction: UndoableAction = {
            ...action,
            id: crypto.randomUUID(),
            timestamp: Date.now(),
        };

        set((state) => {
            const newUndoStack = [...state.undoStack, newAction];
            // Trim to max size
            if (newUndoStack.length > MAX_HISTORY_SIZE) {
                newUndoStack.shift();
            }
            return {
                undoStack: newUndoStack,
                // Clear redo stack when new action is performed
                redoStack: [],
            };
        });
    },

    undo: async () => {
        const { undoStack, isPerformingAction } = get();
        if (undoStack.length === 0 || isPerformingAction) return;

        const action = undoStack[undoStack.length - 1];

        set({ isPerformingAction: true });

        try {
            await action.undo();

            set((state) => ({
                undoStack: state.undoStack.slice(0, -1),
                redoStack: [...state.redoStack, action],
            }));
        } catch (error) {
            console.error("[UndoRedo] Failed to undo action:", error);
        } finally {
            set({ isPerformingAction: false });
        }
    },

    redo: async () => {
        const { redoStack, isPerformingAction } = get();
        if (redoStack.length === 0 || isPerformingAction) return;

        const action = redoStack[redoStack.length - 1];

        set({ isPerformingAction: true });

        try {
            await action.redo();

            set((state) => ({
                redoStack: state.redoStack.slice(0, -1),
                undoStack: [...state.undoStack, action],
            }));
        } catch (error) {
            console.error("[UndoRedo] Failed to redo action:", error);
        } finally {
            set({ isPerformingAction: false });
        }
    },

    canUndo: () => {
        const { undoStack, isPerformingAction } = get();
        return undoStack.length > 0 && !isPerformingAction;
    },

    canRedo: () => {
        const { redoStack, isPerformingAction } = get();
        return redoStack.length > 0 && !isPerformingAction;
    },

    clearHistory: () => {
        set({ undoStack: [], redoStack: [] });
    },

    getUndoDescription: () => {
        const { undoStack } = get();
        if (undoStack.length === 0) return null;
        return undoStack[undoStack.length - 1].description;
    },

    getRedoDescription: () => {
        const { redoStack } = get();
        if (redoStack.length === 0) return null;
        return redoStack[redoStack.length - 1].description;
    },
}));
