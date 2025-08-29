import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CardOption } from "../types/Card";

type Store = {
  // ---------- persisted ----------
  cards: CardOption[];

  globalLanguage: string;
  setGlobalLanguage: (lang: string) => void;

  setCards: (cards: CardOption[]) => void;
  appendCards: (newCards: CardOption[]) => void;
  updateCard: (pos: number, updatedCard: Partial<CardOption>) => void;

  // ---------- volatile (NOT persisted) ----------
  selectedImages: Record<string, string>;
  setSelectedImages: (images: Record<string, string>) => void;
  appendSelectedImages: (newImages: Record<string, string>) => void;
  clearSelectedImage: (uuid: string) => void;
  clearManySelectedImages: (uuids: string[]) => void;

  originalSelectedImages: Record<string, string>;
  setOriginalSelectedImages: (images: Record<string, string>) => void;
  appendOriginalSelectedImages: (newImages: Record<string, string>) => void;

  uploadedImages: Record<string, string>;
  setUploadedImages: (images: Record<string, string>) => void;
  appendUploadedImages: (newImages: Record<string, string>) => void;

  uploadedOriginalImages: Record<string, string>;
  setUploadedOriginalImages: (images: Record<string, string>) => void;
  appendUploadedOriginalImages: (newImages: Record<string, string>) => void;

  uploadedFiles: Record<string, File>;
  setUploadedFiles: (files: Record<string, File>) => void;
  appendUploadedFiles: (newFiles: Record<string, File>) => void;

  removeCardAt: (pos: number) => void;
  clearVolatileForCard: (uuid: string) => void;
};

export const useCardsStore = create<Store>()(
  persist(
    (set, _) => ({
      // ---------- persisted ----------
      cards: [],

      globalLanguage: "en",
      setGlobalLanguage: (lang) => set({ globalLanguage: lang }),

      setCards: (cards) => set({ cards }),
      appendCards: (newCards) =>
        set((state) => ({ cards: [...state.cards, ...newCards] })),
      updateCard: (pos, updatedCard) =>
        set((state) => ({
          cards: state.cards.map((card, index) =>
            index === pos ? { ...card, ...updatedCard } : card
          ),
        })),

      // ---------- volatile ----------
      selectedImages: {},
      setSelectedImages: (images) => set({ selectedImages: images }),
      appendSelectedImages: (newImages) =>
        set((state) => ({
          selectedImages: { ...state.selectedImages, ...newImages },
        })),
      clearSelectedImage: (uuid) =>
        set((state) => {
          const newSelected = { ...state.selectedImages };
          delete newSelected[uuid];
          return { selectedImages: newSelected };
        }),
      clearManySelectedImages: (uuids) =>
        set((state) => {
          const newSelected = { ...state.selectedImages };
          for (const uuid of uuids) {
            delete newSelected[uuid];
          }
          return { selectedImages: newSelected };
        }),

      originalSelectedImages: {},
      setOriginalSelectedImages: (images) =>
        set({ originalSelectedImages: images }),
      appendOriginalSelectedImages: (newImages) =>
        set((state) => ({
          originalSelectedImages: {
            ...state.originalSelectedImages,
            ...newImages,
          },
        })),

      uploadedImages: {},
      setUploadedImages: (images) => set({ uploadedImages: images }),
      appendUploadedImages: (newImages) =>
        set((state) => ({
          uploadedImages: { ...state.uploadedImages, ...newImages },
        })),

      uploadedOriginalImages: {},
      setUploadedOriginalImages: (images) =>
        set({ uploadedOriginalImages: images }),
      appendUploadedOriginalImages: (newImages) =>
        set((state) => ({
          uploadedOriginalImages: {
            ...state.uploadedOriginalImages,
            ...newImages,
          },
        })),

      uploadedFiles: {},
      setUploadedFiles: (files) => set({ uploadedFiles: files }),
      appendUploadedFiles: (newFiles) =>
        set((state) => ({
          uploadedFiles: { ...state.uploadedFiles, ...newFiles },
        })),

      // helpers
      removeCardAt: (pos) =>
        set((state) => {
          const cards = [...state.cards];
          const [removed] = cards.splice(pos, 1);
          if (removed?.uuid) {
            const uuid = removed.uuid;
            const {
              selectedImages,
              originalSelectedImages,
              uploadedImages,
              uploadedOriginalImages,
              uploadedFiles
            } = state;

            delete selectedImages[uuid];
            delete originalSelectedImages[uuid];
            delete uploadedImages[uuid];
            delete uploadedOriginalImages[uuid];
            delete uploadedFiles[uuid];

            return {
              cards,
              selectedImages: { ...selectedImages },
              originalSelectedImages: { ...originalSelectedImages },
              uploadedImages: { ...uploadedImages },
              uploadedOriginalImages: { ...uploadedOriginalImages },
              uploadedFiles: { ...uploadedFiles }
            };
          }
          return { cards };
        }),

      clearVolatileForCard: (uuid) =>
        set((state) => {
          const {
            selectedImages,
            originalSelectedImages,
            uploadedImages,
            uploadedOriginalImages,
            uploadedFiles,
          } = state;
          delete selectedImages[uuid];
          delete originalSelectedImages[uuid];
          delete uploadedImages[uuid];
          delete uploadedOriginalImages[uuid];
          delete uploadedFiles[uuid];

          return {
            selectedImages: { ...selectedImages },
            originalSelectedImages: { ...originalSelectedImages },
            uploadedImages: { ...uploadedImages },
            uploadedOriginalImages: { ...uploadedOriginalImages },
            uploadedFiles: { ...uploadedFiles },
          };
        }),
    }),
    {
      name: "proxxied:cards:v3", 
      version: 3,

      partialize: (state) => ({
        cards: state.cards,
      }),

      storage: createJSONStorage(() => localStorage),

      migrate: (persistedState: any, version) => {
        if (!persistedState) return persistedState;

        if (version < 3) {
          delete persistedState.selectedImages;
          delete persistedState.originalSelectedImages;
          delete persistedState.uploadedImages;
          delete persistedState.uploadedOriginalImages;
          delete persistedState.uploadedFiles;
        }
        return persistedState;
      },
    }
  )
);