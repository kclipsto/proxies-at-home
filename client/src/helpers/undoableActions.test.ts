import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    undoableReorderCards,
    undoableReorderMultipleCards,
} from "./undoableActions";

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
            await undoableReorderCards("card-123", 0, 2);

            expect(mockPushAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "REORDER_CARDS",
                    description: "Reorder cards",
                })
            );
        });

        it("should include undo and redo functions in the action", async () => {
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
});
