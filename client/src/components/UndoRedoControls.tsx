import { useUndoRedoStore } from "@/store/undoRedo";
import { Undo2, Redo2 } from "lucide-react";
import { useEffect, useState } from "react";

export function UndoRedoControls() {
    // Only subscribe to stack lengths
    const undoCount = useUndoRedoStore((state) => state.undoStack.length);
    const redoCount = useUndoRedoStore((state) => state.redoStack.length);
    const undo = useUndoRedoStore((state) => state.undo);
    const redo = useUndoRedoStore((state) => state.redo);

    // Track keyboard-triggered press states
    const [undoPressed, setUndoPressed] = useState(false);
    const [redoPressed, setRedoPressed] = useState(false);

    useEffect(() => {
        const isMac = navigator.platform.toUpperCase().includes('MAC');

        const handleKeyDown = (e: KeyboardEvent) => {
            const modifierActive = isMac ? e.metaKey : e.ctrlKey;
            if (modifierActive && e.key.toLowerCase() === "z") {
                if (e.shiftKey) {
                    setRedoPressed(true);
                } else {
                    setUndoPressed(true);
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === "z") {
                setUndoPressed(false);
                setRedoPressed(false);
            }
            // Also release on modifier key up
            if (e.key === "Control" || e.key === "Meta") {
                setUndoPressed(false);
                setRedoPressed(false);
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        document.addEventListener("keyup", handleKeyUp);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.removeEventListener("keyup", handleKeyUp);
        };
    }, []);

    const buttonBaseClass = "p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg text-gray-600 dark:text-gray-400 disabled:opacity-40 disabled:cursor-not-allowed transition-transform duration-75 active:translate-y-[2px]";

    return (
        <div className="flex items-center gap-2">
            <button
                disabled={undoCount === 0}
                onClick={() => void undo()}
                className={buttonBaseClass}
                style={undoPressed && undoCount > 0 ? { transform: 'translateY(2px)' } : undefined}
                aria-label="Undo"
            >
                <Undo2 className="size-5" />
            </button>
            <button
                disabled={redoCount === 0}
                onClick={() => void redo()}
                className={buttonBaseClass}
                style={redoPressed && redoCount > 0 ? { transform: 'translateY(2px)' } : undefined}
                aria-label="Redo"
            >
                <Redo2 className="size-5" />
            </button>
        </div>
    );
}
