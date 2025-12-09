import { create } from "zustand";
import { db } from "../db";
import { cancelAllProcessing } from "../helpers/cancellationService";
import { useUndoRedoStore } from "./undoRedo";

type Store = {
  clearAllCardsAndImages: () => Promise<void>;
};

export const useCardsStore = create<Store>()(() => ({
  clearAllCardsAndImages: async () => {
    // Cancel all processing before clearing
    cancelAllProcessing();

    // Clear undo/redo history (not undoable)
    useUndoRedoStore.getState().clearHistory();

    await db.transaction("rw", db.cards, db.images, async () => {
      await db.cards.clear();
      await db.images.clear();
    });
  },
}));
