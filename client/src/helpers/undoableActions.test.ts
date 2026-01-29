import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    undoableReorderCards,
    undoableReorderMultipleCards,
    undoableDeleteCard,
    undoableAddCards,
    undoableDuplicateCard,
} from "./undoableActions";
import { db } from "@/db";
import { addCards } from "./dbUtils";
import type { CardOption } from "@/types";

// Mock the database
vi.mock("@/db", () => ({
    db: {
        cards: {
            get: vi.fn(),
            delete: vi.fn(),
            add: vi.fn(),
            update: vi.fn(),
            bulkGet: vi.fn(),
            bulkDelete: vi.fn(),
            bulkAdd: vi.fn(),
            bulkUpdate: vi.fn(),
            where: vi.fn(() => ({
                equals: vi.fn(() => ({
                    first: vi.fn(),
                    toArray: vi.fn().mockResolvedValue([]),
                })),
                anyOf: vi.fn(() => ({
                    toArray: vi.fn().mockResolvedValue([]),
                })),
            })),
            filter: vi.fn(() => ({
                toArray: vi.fn().mockResolvedValue([]),
            })),
            toArray: vi.fn().mockResolvedValue([]),
        },
        images: {
            get: vi.fn(),
            delete: vi.fn(),
            add: vi.fn(),
            update: vi.fn(),
            bulkGet: vi.fn().mockResolvedValue([]),
            filter: vi.fn(() => ({
                keys: vi.fn().mockResolvedValue([]),
            })),
        },
        transaction: vi.fn((_mode, _tables, fn) => fn()),
    },
}));

// Mock dbUtils
vi.mock("./dbUtils", () => ({
    addCardWithImage: vi.fn().mockResolvedValue({
        uuid: "new-card-uuid",
        name: "Test Card",
        order: 1,
    }),
    addCards: vi.fn().mockResolvedValue([]),
    duplicateCard: vi.fn(),
    deleteCard: vi.fn(),
    deleteCardAndImage: vi.fn(),
    changeCardArtwork: vi.fn(),
    rebalanceCardOrders: vi.fn(),
    createLinkedBackCard: vi.fn().mockResolvedValue("back-uuid"),
    createLinkedBackCardsBulk: vi.fn().mockResolvedValue(["back-uuid"]),
    addRemoteImage: vi.fn(),
}));

// Mock undoRedo store
const mockPushAction = vi.fn();
vi.mock("@/store/undoRedo", () => ({
    useUndoRedoStore: {
        getState: vi.fn(() => ({
            pushAction: mockPushAction,
        })),
    },
}));

// Mock settings store
vi.mock("@/store/settings", () => ({
    useSettingsStore: {
        getState: vi.fn(() => ({
            defaultCardbackId: "__builtin_mtg__",
        })),
        subscribe: vi.fn(() => () => { }), // Returns unsubscribe function
    },
}));

// Mock cardbackLibrary
vi.mock("./cardbackLibrary", () => ({
    BUILTIN_CARDBACKS: [
        { id: "__builtin_mtg__", name: "MTG", hasBuiltInBleed: true },
    ],
}));

describe("undoableActions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("undoableReorderCards", () => {
        it("should push an undo action for reordering", async () => {
            const mockCard = { uuid: "card-123", order: 0 };
            vi.mocked(db.cards.get).mockResolvedValue(mockCard as unknown as CardOption);

            await undoableReorderCards("card-123", 0, 2);

            expect(mockPushAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "REORDER_CARDS",
                    description: "Reorder cards",
                })
            );
        });

        it("should include undo and redo functions in the action", async () => {
            const mockCard = { uuid: "card-123", order: 0 };
            vi.mocked(db.cards.get).mockResolvedValue(mockCard as unknown as CardOption);

            await undoableReorderCards("card-123", 0, 2);

            const pushedAction = mockPushAction.mock.calls[0][0];
            expect(typeof pushedAction.undo).toBe("function");
            expect(typeof pushedAction.redo).toBe("function");
        });
    });

    describe("undoableReorderMultipleCards", () => {
        it("should push an undo action for reordering multiple cards", async () => {
            const adjustments = [
                { uuid: "card-1", oldOrder: 0, newOrder: 2 },
                { uuid: "card-2", oldOrder: 1, newOrder: 0 },
            ];
            const mockCards = [
                { uuid: "card-1", order: 0 },
                { uuid: "card-2", order: 1 },
            ];
            vi.mocked(db.cards.bulkGet).mockResolvedValue(mockCards as unknown as CardOption[]);

            await undoableReorderMultipleCards(adjustments);

            expect(mockPushAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "REORDER_MULTIPLE_CARDS",
                    description: "Reorder 2 cards",
                })
            );
        });

        it("should not push action for empty adjustments array", async () => {
            await undoableReorderMultipleCards([]);

            expect(mockPushAction).not.toHaveBeenCalled();
        });

        it("should include undo and redo functions in the action", async () => {
            const adjustments = [
                { uuid: "card-1", oldOrder: 0, newOrder: 2 },
            ];

            await undoableReorderMultipleCards(adjustments);

            const pushedAction = mockPushAction.mock.calls[0][0];
            expect(typeof pushedAction.undo).toBe("function");
            expect(typeof pushedAction.redo).toBe("function");
        });
    });
    describe("undoableDeleteCard", () => {
        it("should push an undo action for deleting a card", async () => {
            vi.mocked(db.cards.get).mockResolvedValueOnce({
                uuid: "card-1",
                name: "Delete Me",
                imageId: "img-1",
            } as unknown as CardOption);

            await undoableDeleteCard("card-1");
            expect(mockPushAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "DELETE_CARD",
                    description: expect.stringContaining('Delete "'),
                })
            );
        });
    });

    describe("undoableAddCards", () => {
        it("should push an undo action for adding cards", async () => {
            const cardsToAdd = [{ name: "New Card", lang: "en", isUserUpload: false }];
            vi.mocked(addCards).mockResolvedValue([{ uuid: "new-uuid", name: "New Card", imageId: "img-1" } as unknown as CardOption]);

            await undoableAddCards(cardsToAdd);

            expect(mockPushAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "ADD_CARDS",
                    description: expect.stringContaining('Add "'),
                })
            );
        });
    });

    describe("undoableDuplicateCard", () => {
        it("should push an undo action for duplicating a card", async () => {
            // Mock finding the new card
            const original = { uuid: "old-uuid", name: "Old Card" };
            const newCard = { uuid: "new-uuid", name: "Old Card" };

            // First call returns original
            // Second call returns original + new
            vi.mocked(db.cards.get).mockResolvedValueOnce(original as unknown as CardOption);
            vi.mocked(db.cards.toArray)
                .mockResolvedValueOnce([original] as unknown as CardOption[])
                .mockResolvedValueOnce([original, newCard] as unknown as CardOption[]);

            await undoableDuplicateCard("old-uuid");

            expect(mockPushAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "DUPLICATE_CARD",
                    description: expect.stringContaining('Duplicate "'),
                })
            );
        });
    });
});
