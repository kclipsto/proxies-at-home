/**
 * Store for keyboard shortcuts modal visibility
 */
import { create } from 'zustand';

interface KeyboardShortcutsState {
    isOpen: boolean;
    openModal: () => void;
    closeModal: () => void;
    toggleModal: () => void;
}

export const useKeyboardShortcutsStore = create<KeyboardShortcutsState>((set, get) => ({
    isOpen: false,
    openModal: () => set({ isOpen: true }),
    closeModal: () => set({ isOpen: false }),
    toggleModal: () => set({ isOpen: !get().isOpen }),
}));
