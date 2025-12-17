import { useEffect, useRef } from "react";
import { useUndoRedoStore } from "../store/undoRedo";
import { useSelectionStore } from "../store/selection";

export function usePageViewHotkeys(allCardUuids: string[], active: boolean = true) {
    const uuidsRef = useRef(allCardUuids);

    useEffect(() => {
        uuidsRef.current = allCardUuids;
    }, [allCardUuids]);

    useEffect(() => {
        if (!active) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
                return;
            }
            // Escape key clears selection (no modifier needed)
            if (e.key === "Escape") {
                const { selectedCards, clearSelection } = useSelectionStore.getState();
                if (selectedCards.size > 0) {
                    e.preventDefault();
                    clearSelection();
                }
                return;
            }

            // F key flips selected cards (no modifier needed)
            if (e.key.toLowerCase() === "f" && !e.metaKey && !e.ctrlKey) {
                const { selectedCards, toggleFlip } = useSelectionStore.getState();
                if (selectedCards.size > 0) {
                    e.preventDefault();
                    // toggleFlip already handles multi-select internally
                    // Just call it once with the first selected card
                    const firstUuid = selectedCards.values().next().value;
                    if (firstUuid) {
                        toggleFlip(firstUuid);
                    }
                }
                return;
            }

            // Use Cmd on macOS, Ctrl on Windows/Linux
            const isMac = navigator.platform.toUpperCase().includes('MAC');
            const modifierActive = isMac ? e.metaKey : e.ctrlKey;

            if (modifierActive) {
                switch (e.key.toLowerCase()) {
                    case "z":
                        if (e.shiftKey) {
                            // Redo
                            e.preventDefault();
                            void useUndoRedoStore.getState().redo();
                        } else {
                            // Undo
                            e.preventDefault();
                            void useUndoRedoStore.getState().undo();
                        }
                        break;
                    case "a":
                        // Select All
                        e.preventDefault();
                        useSelectionStore.getState().selectAll(uuidsRef.current);
                        break;
                }
            }
        };

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [active]);
}
