import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DefaultCardbackCheckbox } from "./DefaultCardbackCheckbox";

// Mock dependencies
vi.mock("@/db", () => ({
    db: {
        cards: {
            get: vi.fn(),
            bulkGet: vi.fn().mockResolvedValue([]),
            update: vi.fn(),
            bulkUpdate: vi.fn(),
        },
    },
}));

vi.mock("@/store/selection", () => ({
    useSelectionStore: {
        getState: vi.fn(() => ({
            selectedCards: new Set<string>(),
        })),
    },
}));

vi.mock("@/helpers/undoableActions", () => ({
    undoableChangeCardback: vi.fn(),
}));

import { db } from "@/db";
import { useSelectionStore } from "@/store/selection";
import { undoableChangeCardback } from "@/helpers/undoableActions";

describe("DefaultCardbackCheckbox", () => {
    const defaultProps = {
        linkedBackCard: {
            uuid: "back-uuid",
            name: "Back Card",
            usesDefaultCardback: false,
        } as Parameters<typeof DefaultCardbackCheckbox>[0]["linkedBackCard"],
        modalCard: {
            uuid: "front-uuid",
            name: "Front Card",
            linkedBackId: "back-uuid",
        } as Parameters<typeof DefaultCardbackCheckbox>[0]["modalCard"],
        defaultCardbackId: "default-cb-id",
        cardbackOptions: [
            { id: "default-cb-id", name: "Default Cardback", imageUrl: "", source: "builtin" as const, hasBuiltInBleed: true },
            { id: "other-cb-id", name: "Other Cardback", imageUrl: "", source: "builtin" as const },
        ],
        onClose: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (useSelectionStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
            selectedCards: new Set<string>(),
        });
    });

    describe("rendering", () => {
        it("should render checkbox with label", () => {
            render(<DefaultCardbackCheckbox {...defaultProps} />);

            expect(screen.getByRole("checkbox")).toBeDefined();
            expect(screen.getByText(/Use default cardback/)).toBeDefined();
        });

        it("should render checkbox unchecked when usesDefaultCardback is false", () => {
            render(<DefaultCardbackCheckbox {...defaultProps} />);

            const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
            expect(checkbox.checked).toBe(false);
        });

        it("should render checkbox checked when usesDefaultCardback is true", () => {
            const props = {
                ...defaultProps,
                linkedBackCard: { ...defaultProps.linkedBackCard, usesDefaultCardback: true },
            };
            render(<DefaultCardbackCheckbox {...props} />);

            const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
            expect(checkbox.checked).toBe(true);
        });
    });

    describe("checking the checkbox (switching to default)", () => {
        it("should call undoableChangeCardback when checked", async () => {
            (db.cards.get as ReturnType<typeof vi.fn>).mockResolvedValue({
                uuid: "front-uuid",
                linkedBackId: "back-uuid",
            });

            render(<DefaultCardbackCheckbox {...defaultProps} />);

            const checkbox = screen.getByRole("checkbox");
            fireEvent.click(checkbox);

            // Wait for async operations
            await vi.waitFor(() => {
                expect(undoableChangeCardback).toHaveBeenCalledWith(
                    ["front-uuid"],
                    "default-cb-id",
                    "Default Cardback",
                    true
                );
            });
        });

        it("should update linkedBackCard to usesDefaultCardback=true", async () => {
            (db.cards.get as ReturnType<typeof vi.fn>).mockResolvedValue({
                uuid: "front-uuid",
                linkedBackId: "back-uuid",
            });
            (db.cards.bulkGet as ReturnType<typeof vi.fn>).mockResolvedValue([{
                uuid: "front-uuid",
                linkedBackId: "back-uuid",
            }]);

            render(<DefaultCardbackCheckbox {...defaultProps} />);

            const checkbox = screen.getByRole("checkbox");
            fireEvent.click(checkbox);

            await vi.waitFor(() => {
                expect(db.cards.bulkUpdate).toHaveBeenCalledWith([
                    { key: "back-uuid", changes: { usesDefaultCardback: true } }
                ]);
            });
        });

        it("should call onClose after switching to default", async () => {
            (db.cards.get as ReturnType<typeof vi.fn>).mockResolvedValue({
                uuid: "front-uuid",
                linkedBackId: "back-uuid",
            });

            render(<DefaultCardbackCheckbox {...defaultProps} />);

            const checkbox = screen.getByRole("checkbox");
            fireEvent.click(checkbox);

            await vi.waitFor(() => {
                expect(defaultProps.onClose).toHaveBeenCalled();
            });
        });
    });

    describe("unchecking the checkbox (removing default)", () => {
        it("should update linkedBackCard to usesDefaultCardback=false", async () => {
            const props = {
                ...defaultProps,
                linkedBackCard: { ...defaultProps.linkedBackCard, usesDefaultCardback: true },
            };

            render(<DefaultCardbackCheckbox {...props} />);

            const checkbox = screen.getByRole("checkbox");
            fireEvent.click(checkbox);

            await vi.waitFor(() => {
                expect(db.cards.update).toHaveBeenCalledWith("back-uuid", { usesDefaultCardback: false });
            });
        });
    });

    describe("multi-select behavior", () => {
        it("should update all selected cards when multi-select is active and checked", async () => {
            const selectedUuids = ["front-uuid", "front-uuid-2"];
            (useSelectionStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
                selectedCards: new Set(selectedUuids),
            });

            // Mock bulkGet for front cards
            (db.cards.bulkGet as ReturnType<typeof vi.fn>)
                .mockResolvedValueOnce([
                    { uuid: "front-uuid", linkedBackId: "back-uuid" },
                    { uuid: "front-uuid-2", linkedBackId: "back-uuid-2" }
                ])
                // Mock bulkGet for back cards (second call - actually re-fetching front cards)
                .mockResolvedValueOnce([
                    { uuid: "front-uuid", linkedBackId: "back-uuid" },
                    { uuid: "front-uuid-2", linkedBackId: "back-uuid-2" }
                ]);

            render(<DefaultCardbackCheckbox {...defaultProps} />);

            const checkbox = screen.getByRole("checkbox");
            fireEvent.click(checkbox);

            await vi.waitFor(() => {
                // Check if bulk update was called for front cards (change cardback)
                expect(undoableChangeCardback).toHaveBeenCalledWith(
                    selectedUuids,
                    "default-cb-id",
                    "Default Cardback",
                    true
                );

                // Check if bulk update was called for back cards (set usesDefaultCardback)
                expect(db.cards.bulkUpdate).toHaveBeenCalledWith([
                    { key: "back-uuid", changes: { usesDefaultCardback: true } },
                    { key: "back-uuid-2", changes: { usesDefaultCardback: true } }
                ]);
            });
        });

        it("should update all selected cards when multi-select is active and unchecked", async () => {
            const selectedUuids = ["front-uuid", "front-uuid-2"];
            (useSelectionStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
                selectedCards: new Set(selectedUuids),
            });

            // Mock bulkGet for finding back cards
            (db.cards.bulkGet as ReturnType<typeof vi.fn>).mockResolvedValue([
                { uuid: "front-uuid", linkedBackId: "back-uuid" },
                { uuid: "front-uuid-2", linkedBackId: "back-uuid-2" }
            ]);

            const props = {
                ...defaultProps,
                linkedBackCard: { ...defaultProps.linkedBackCard, usesDefaultCardback: true },
            };
            render(<DefaultCardbackCheckbox {...props} />);

            const checkbox = screen.getByRole("checkbox");
            fireEvent.click(checkbox);

            await vi.waitFor(() => {
                expect(db.cards.bulkUpdate).toHaveBeenCalledWith([
                    { key: "back-uuid", changes: { usesDefaultCardback: false } },
                    { key: "back-uuid-2", changes: { usesDefaultCardback: false } }
                ]);
            });
        });

        it("should handle mixed selection properly", async () => {
            // Case where one card doesn't have a linked back
            const selectedUuids = ["front-uuid", "front-uuid-no-back"];
            (useSelectionStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
                selectedCards: new Set(selectedUuids),
            });

            (db.cards.bulkGet as ReturnType<typeof vi.fn>).mockResolvedValue([
                { uuid: "front-uuid", linkedBackId: "back-uuid" },
                { uuid: "front-uuid-no-back" } // No linked back
            ]);

            const props = {
                ...defaultProps,
                linkedBackCard: { ...defaultProps.linkedBackCard, usesDefaultCardback: true },
            };
            render(<DefaultCardbackCheckbox {...props} />);

            const checkbox = screen.getByRole("checkbox");
            fireEvent.click(checkbox);

            await vi.waitFor(() => {
                // Should only update the valid one
                expect(db.cards.bulkUpdate).toHaveBeenCalledWith([
                    { key: "back-uuid", changes: { usesDefaultCardback: false } }
                ]);
            });
        });
    });

    describe("accessibility", () => {
        it("should have proper label association", () => {
            render(<DefaultCardbackCheckbox {...defaultProps} />);

            const checkbox = screen.getByRole("checkbox");
            const label = screen.getByText(/Use default cardback/);

            expect(checkbox.id).toBe("use-default-cardback");
            expect(label.getAttribute("for")).toBe("use-default-cardback");
        });
    });
});
