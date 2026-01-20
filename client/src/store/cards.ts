import { create } from "zustand";
import { db } from "../db";
import { cancelAllProcessing } from "../helpers/cancellationService";
import { useUndoRedoStore } from "./undoRedo";
import { revokeAllCardbackUrls } from "../helpers/cardbackLibrary";
import { useProjectStore } from "./projectStore";

type Store = {
  clearAllCardsAndImages: () => Promise<void>;
};

export const useCardsStore = create<Store>()(() => ({
  clearAllCardsAndImages: async () => {
    const projectId = useProjectStore.getState().currentProjectId;
    if (!projectId) return;

    // Cancel all processing before clearing
    cancelAllProcessing();

    // Clear undo/redo history (not undoable)
    useUndoRedoStore.getState().clearHistory();

    // Revoke all cached blob URLs to prevent memory leaks
    revokeAllCardbackUrls();

    await db.transaction("rw", db.cards, db.images, async () => {
      // Clear only current project's cards
      await db.cards.where('projectId').equals(projectId).delete();

      // Clear images cache (ephemeral cache for current project)
      await db.images.clear();
    });

    // Note: db.cardbacks is NOT cleared - cardbacks persist across clears
  },
}));
