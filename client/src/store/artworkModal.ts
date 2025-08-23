import { create } from "zustand";
import type { CardOption } from "../types/Card";

type ArtworkModalData = {
  card: CardOption | null;
  index: number | null;
};

type Store = {
  open: boolean;
  card: CardOption | null;
  index: number | null;
  openModal: (data: ArtworkModalData) => void;
  closeModal: () => void;
  updateCard: (updatedCard: Partial<CardOption>) => void;
};

export const useArtworkModalStore = create<Store>((set) => ({
  open: false,
  card: null,
  index: null,
  openModal: (data) => set({ open: true, card: data.card, index: data.index }),
  closeModal: () => set({ open: false, card: null, index: null }),
  updateCard: (updatedCard) =>
    set((state) => {
      if (!state.card) return state;

      return { ...state, card: { ...state.card, ...updatedCard } };
    }),
}));
