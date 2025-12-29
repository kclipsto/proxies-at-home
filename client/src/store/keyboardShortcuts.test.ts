import { describe, it, expect, beforeEach } from "vitest";
import { useKeyboardShortcutsStore } from "./keyboardShortcuts";

describe("keyboardShortcutsStore", () => {
    beforeEach(() => {
        useKeyboardShortcutsStore.getState().closeModal();
    });

    describe("initial state", () => {
        it("should have modal closed initially", () => {
            const state = useKeyboardShortcutsStore.getState();
            expect(state.isOpen).toBe(false);
        });
    });

    describe("openModal", () => {
        it("should open modal", () => {
            useKeyboardShortcutsStore.getState().openModal();
            expect(useKeyboardShortcutsStore.getState().isOpen).toBe(true);
        });
    });

    describe("closeModal", () => {
        it("should close modal", () => {
            useKeyboardShortcutsStore.getState().openModal();
            useKeyboardShortcutsStore.getState().closeModal();
            expect(useKeyboardShortcutsStore.getState().isOpen).toBe(false);
        });
    });

    describe("toggleModal", () => {
        it("should open modal when closed", () => {
            expect(useKeyboardShortcutsStore.getState().isOpen).toBe(false);
            useKeyboardShortcutsStore.getState().toggleModal();
            expect(useKeyboardShortcutsStore.getState().isOpen).toBe(true);
        });

        it("should close modal when open", () => {
            useKeyboardShortcutsStore.getState().openModal();
            expect(useKeyboardShortcutsStore.getState().isOpen).toBe(true);
            useKeyboardShortcutsStore.getState().toggleModal();
            expect(useKeyboardShortcutsStore.getState().isOpen).toBe(false);
        });
    });
});
