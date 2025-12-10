import { create } from "zustand";
import type { CardOption } from "../../../shared/types";

type ArtworkModalData = {
  card: CardOption | null;
  index: number | null;
  initialTab?: 'artwork' | 'settings';
};

type Store = {
  open: boolean;
  card: CardOption | null;
  index: number | null;
  initialTab: 'artwork' | 'settings';
  openModal: (data: ArtworkModalData) => void;
  closeModal: () => void;
  updateCard: (updatedCard: CardOption) => void;
};

export const useArtworkModalStore = create<Store>((set) => ({
  open: false,
  card: null,
  index: null,
  initialTab: 'artwork',
  openModal: (data) => set({
    open: true,
    card: data.card,
    index: data.index,
    initialTab: data.initialTab ?? 'artwork',
  }),
  closeModal: () => set({ open: false, card: null, index: null, initialTab: 'artwork' }),
  updateCard: (updatedCard: CardOption) =>
    set((state) => {
      if (!state.card) return state;
      return { card: updatedCard };
    }),
}));
