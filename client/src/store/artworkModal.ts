import { create } from "zustand";
import type { CardOption } from "../../../shared/types";

type ArtworkModalData = {
  card: CardOption | null;
  index: number | null;
  allCards?: CardOption[]; // List of all navigable cards
  initialTab?: 'artwork' | 'settings';
  initialFace?: 'front' | 'back';
  initialArtSource?: 'scryfall' | 'mpc';
};

type Store = {
  open: boolean;
  card: CardOption | null;
  index: number | null;
  allCards: CardOption[]; // List of all navigable cards
  initialTab: 'artwork' | 'settings';
  initialFace: 'front' | 'back';
  initialArtSource: 'scryfall' | 'mpc' | null;
  openModal: (data: ArtworkModalData) => void;
  closeModal: () => void;
  updateCard: (updatedCard: CardOption) => void;
  goToNextCard: () => void;
  goToPrevCard: () => void;
  advancedSearchZoom: number;
  setAdvancedSearchZoom: (zoom: number | ((prev: number) => number)) => void;
};

export const useArtworkModalStore = create<Store>((set, get) => ({
  open: false,
  card: null,
  index: null,
  allCards: [],
  initialTab: 'artwork',
  initialFace: 'front',
  initialArtSource: null,
  openModal: (data) => set({
    open: true,
    card: data.card,
    index: data.index,
    allCards: data.allCards ?? [],
    initialTab: data.initialTab ?? 'artwork',
    initialFace: data.initialFace ?? 'front',
    initialArtSource: data.initialArtSource ?? null,
  }),
  closeModal: () => set({ open: false, card: null, index: null, allCards: [], initialTab: 'artwork', initialFace: 'front', initialArtSource: null }),
  updateCard: (updatedCard: CardOption) =>
    set((state) => {
      if (!state.card || state.index === null) return state;
      // Update both the current card AND the corresponding entry in allCards
      const updatedAllCards = [...state.allCards];
      updatedAllCards[state.index] = updatedCard;
      return {
        card: updatedCard,
        allCards: updatedAllCards,
      };
    }),
  goToNextCard: () => {
    const { allCards, index } = get();
    if (allCards.length === 0 || index === null) return;
    // Wrap around: if at last card, go to first
    const nextIndex = (index + 1) % allCards.length;
    const nextCard = allCards[nextIndex];
    if (!nextCard) return;
    set({
      card: nextCard,
      index: nextIndex,
      initialTab: 'artwork',
      initialFace: 'front',
      initialArtSource: null, // Reset to allow detection from new card's imageId
    });
  },
  goToPrevCard: () => {
    const { allCards, index } = get();
    if (allCards.length === 0 || index === null) return;
    // Wrap around: if at first card, go to last
    const prevIndex = (index - 1 + allCards.length) % allCards.length;
    const prevCard = allCards[prevIndex];
    if (!prevCard) return;
    set({
      card: prevCard,
      index: prevIndex,
      initialTab: 'artwork',
      initialFace: 'front',
      initialArtSource: null, // Reset to allow detection from new card's imageId
    });
  },
  advancedSearchZoom: 1,
  setAdvancedSearchZoom: (zoom) => set((state) => ({
    advancedSearchZoom: typeof zoom === 'function' ? (zoom as (prev: number) => number)(state.advancedSearchZoom) : zoom
  })),
}));
