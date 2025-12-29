import { describe, it, expect, beforeEach } from "vitest";
import { useCardEditorModalStore } from "./cardEditorModal";
import type { CardOption } from "../../../shared/types";
import type { Image } from "../db";

describe("cardEditorModalStore", () => {
    const mockCard = {
        uuid: "card-123",
        name: "Test Card",
        order: 1,
        isUserUpload: false,
    } as CardOption;

    const mockImage = {
        uuid: "img-123",
        id: "img-123",
        blob: new Blob(["test"]),
        originalHeight: 100,
        originalWidth: 75,
        refCount: 1,
    } as Image;

    beforeEach(() => {
        useCardEditorModalStore.getState().closeModal();
    });

    describe("initial state", () => {
        it("should have modal closed initially", () => {
            const state = useCardEditorModalStore.getState();
            expect(state.open).toBe(false);
            expect(state.card).toBeNull();
            expect(state.image).toBeNull();
        });
    });

    describe("openModal", () => {
        it("should open modal with card and image", () => {
            useCardEditorModalStore.getState().openModal({
                card: mockCard,
                image: mockImage,
            });

            const state = useCardEditorModalStore.getState();
            expect(state.open).toBe(true);
            expect(state.card).toEqual(mockCard);
            expect(state.image).toEqual(mockImage);
        });

        it("should set selectedCardUuids to card uuid by default", () => {
            useCardEditorModalStore.getState().openModal({
                card: mockCard,
                image: mockImage,
            });

            const state = useCardEditorModalStore.getState();
            expect(state.selectedCardUuids).toEqual([mockCard.uuid]);
        });

        it("should use provided selectedCardUuids for multi-select", () => {
            useCardEditorModalStore.getState().openModal({
                card: mockCard,
                image: mockImage,
                selectedCardUuids: ["uuid1", "uuid2", "uuid3"],
            });

            const state = useCardEditorModalStore.getState();
            expect(state.selectedCardUuids).toEqual(["uuid1", "uuid2", "uuid3"]);
        });

        it("should set initialFace to front by default", () => {
            useCardEditorModalStore.getState().openModal({
                card: mockCard,
                image: mockImage,
            });

            const state = useCardEditorModalStore.getState();
            expect(state.initialFace).toBe("front");
        });

        it("should set initialFace when provided", () => {
            useCardEditorModalStore.getState().openModal({
                card: mockCard,
                image: mockImage,
                initialFace: "back",
            });

            const state = useCardEditorModalStore.getState();
            expect(state.initialFace).toBe("back");
        });

        it("should set backCard and backImage when provided", () => {
            const backCard = { uuid: "back-123", name: "Back Card", order: 2, isUserUpload: false } as CardOption;
            const backImage = { ...mockImage, uuid: "back-img-123", id: "back-img-123" };

            useCardEditorModalStore.getState().openModal({
                card: mockCard,
                image: mockImage,
                backCard,
                backImage,
            });

            const state = useCardEditorModalStore.getState();
            expect(state.backCard).toEqual(backCard);
            expect(state.backImage).toEqual(backImage);
        });
    });

    describe("closeModal", () => {
        it("should close modal and reset all state", () => {
            // First open the modal
            useCardEditorModalStore.getState().openModal({
                card: mockCard,
                image: mockImage,
                selectedCardUuids: ["uuid1", "uuid2"],
                initialFace: "back",
            });

            // Close it
            useCardEditorModalStore.getState().closeModal();

            const state = useCardEditorModalStore.getState();
            expect(state.open).toBe(false);
            expect(state.card).toBeNull();
            expect(state.image).toBeNull();
            expect(state.backCard).toBeUndefined();
            expect(state.backImage).toBeUndefined();
            expect(state.selectedCardUuids).toEqual([]);
            expect(state.initialFace).toBe("front");
        });
    });
});
