import { create } from "zustand";
import type { CardOption } from "../../../shared/types";
import type { Image } from "../db";

type CardEditorModalData = {
    card: CardOption;
    image: Image | null;
    backCard?: CardOption;
    backImage?: Image | null;
    /** UUIDs of all cards to apply overrides to (for multi-select edit) */
    selectedCardUuids?: string[];
    /** Which face to show initially */
    initialFace?: 'front' | 'back';
};

type Store = {
    open: boolean;
    card: CardOption | null;
    image: Image | null;
    backCard: CardOption | undefined;
    backImage: Image | null | undefined;
    /** UUIDs of all cards to apply overrides to (for multi-select edit) */
    selectedCardUuids: string[];
    /** Which face to show initially */
    initialFace: 'front' | 'back';
    openModal: (data: CardEditorModalData) => void;
    closeModal: () => void;
};

export const useCardEditorModalStore = create<Store>((set) => ({
    open: false,
    card: null,
    image: null,
    backCard: undefined,
    backImage: undefined,
    selectedCardUuids: [],
    initialFace: 'front',
    openModal: (data) => set({
        open: true,
        card: data.card,
        image: data.image,
        backCard: data.backCard,
        backImage: data.backImage,
        selectedCardUuids: data.selectedCardUuids ?? [data.card.uuid],
        initialFace: data.initialFace ?? 'front',
    }),
    closeModal: () => set({
        open: false,
        card: null,
        image: null,
        backCard: undefined,
        backImage: undefined,
        selectedCardUuids: [],
        initialFace: 'front',
    }),
}));
