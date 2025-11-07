import { create } from "zustand";
import { db } from "../db"; // Import the Dexie database instance

type Store = {
  clearAllCardsAndImages: () => Promise<void>;
};

export const useCardsStore = create<Store>()(() => ({
  clearAllCardsAndImages: async () => {
    await db.transaction("rw", db.cards, db.images, async () => {
      await db.cards.clear();
      await db.images.clear();
    });
  },
}));

