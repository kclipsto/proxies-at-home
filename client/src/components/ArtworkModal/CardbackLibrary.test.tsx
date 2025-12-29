import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CardbackLibrary } from "./CardbackLibrary";
import type { CardbackOption } from "@/helpers/cardbackLibrary";
import type { CardOption } from "../../../../shared/types";

// Mock dependencies
const mockDbUpdate = vi.fn().mockResolvedValue(undefined);
vi.mock("@/db", () => ({
    db: {
        cardbacks: {
            update: (...args: unknown[]) => mockDbUpdate(...args),
        },
    },
}));

const mockGetAllCardbacks = vi.fn().mockResolvedValue([]);
vi.mock("@/helpers/cardbackLibrary", () => ({
    getAllCardbacks: () => mockGetAllCardbacks(),
    isCardbackId: vi.fn().mockReturnValue(false),
}));

// Mock child components to simplify testing
vi.mock("./CardbackTile", () => ({
    CardbackTile: ({
        id,
        name,
        isDefault,
        isSelected,
        isEditing,
        editingName,
        onSelect,
        onSetAsDefault,
        onDelete,
        onStartEdit,
        onEditNameChange,
        onSaveEdit,
        onCancelEdit,
    }: {
        id: string;
        name: string;
        imageUrl: string;
        source: string;
        isDefault: boolean;
        isSelected: boolean;
        isDeleting: boolean;
        isEditing: boolean;
        editingName: string;
        onSelect: () => void;
        onSetAsDefault: () => void;
        onDelete: () => void;
        onStartEdit: () => void;
        onEditNameChange: (name: string) => void;
        onSaveEdit: () => void;
        onCancelEdit: () => void;
    }) => (
        <div data-testid={`cardback-tile-${id}`}>
            <span data-testid="cardback-name">{name}</span>
            {isDefault && <span data-testid="default-indicator">★</span>}
            {isSelected && <span data-testid="selected-indicator">✓</span>}
            <button onClick={onSelect} data-testid={`select-${id}`}>Select</button>
            <button onClick={onSetAsDefault} data-testid={`set-default-${id}`}>Set Default</button>
            <button onClick={onDelete} data-testid={`delete-${id}`}>Delete</button>
            <button onClick={onStartEdit} data-testid={`edit-${id}`}>Edit</button>
            {isEditing && (
                <div>
                    <input
                        data-testid={`edit-input-${id}`}
                        value={editingName}
                        onChange={(e) => onEditNameChange(e.target.value)}
                    />
                    <button onClick={onSaveEdit} data-testid={`save-${id}`}>Save</button>
                    <button onClick={onCancelEdit} data-testid={`cancel-${id}`}>Cancel</button>
                </div>
            )}
        </div>
    ),
}));

vi.mock("./DefaultCardbackCheckbox", () => ({
    DefaultCardbackCheckbox: () => (
        <div data-testid="default-cardback-checkbox">Checkbox</div>
    ),
}));

describe("CardbackLibrary", () => {
    const mockCardbackOptions: CardbackOption[] = [
        {
            id: "cb-1",
            name: "Default Back",
            imageUrl: "blob:test-url-1",
            source: "builtin",
        },
        {
            id: "cb-2",
            name: "Custom Back",
            imageUrl: "blob:test-url-2",
            source: "uploaded",
        },
    ];

    const mockCard = {
        uuid: "card-123",
        name: "Test Card",
        order: 1,
        isUserUpload: false,
    } as CardOption;

    const defaultProps = {
        cardbackOptions: mockCardbackOptions,
        setCardbackOptions: vi.fn(),
        linkedBackCard: undefined as CardOption | undefined,
        modalCard: mockCard,
        defaultCardbackId: "cb-1",
        onSelectCardback: vi.fn(),
        onSetAsDefaultCardback: vi.fn(),
        onClose: vi.fn(),
        onRequestDelete: vi.fn(),
        onExecuteDelete: vi.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    describe("rendering", () => {
        it("should render all cardback tiles", () => {
            render(<CardbackLibrary {...defaultProps} />);

            expect(screen.getByTestId("cardback-tile-cb-1")).toBeTruthy();
            expect(screen.getByTestId("cardback-tile-cb-2")).toBeTruthy();
        });

        it("should not render DefaultCardbackCheckbox when linkedBackCard is undefined", () => {
            render(<CardbackLibrary {...defaultProps} linkedBackCard={undefined} />);

            expect(screen.queryByTestId("default-cardback-checkbox")).toBeNull();
        });

        it("should render DefaultCardbackCheckbox when linkedBackCard is provided", () => {
            const linkedBackCard = {
                uuid: "back-123",
                name: "Back Card",
                order: 2,
                isUserUpload: false,
                imageId: "cb-1",
            } as CardOption;

            render(<CardbackLibrary {...defaultProps} linkedBackCard={linkedBackCard} />);

            expect(screen.getByTestId("default-cardback-checkbox")).toBeTruthy();
        });

        it("should render with empty cardback options", () => {
            render(<CardbackLibrary {...defaultProps} cardbackOptions={[]} />);

            expect(screen.queryByTestId("cardback-tile-cb-1")).toBeNull();
        });
    });

    describe("localStorage preference loading", () => {
        it("should load skipConfirmation from localStorage as true", () => {
            localStorage.setItem("cardback-delete-confirm-disabled", "true");

            render(<CardbackLibrary {...defaultProps} />);

            // When skipConfirmation is true, clicking delete should call onExecuteDelete directly
            fireEvent.click(screen.getByTestId("delete-cb-1"));

            expect(defaultProps.onExecuteDelete).toHaveBeenCalledWith("cb-1");
            expect(defaultProps.onRequestDelete).not.toHaveBeenCalled();
        });

        it("should not skip confirmation when localStorage is not set", () => {
            render(<CardbackLibrary {...defaultProps} />);

            fireEvent.click(screen.getByTestId("delete-cb-1"));

            expect(defaultProps.onRequestDelete).toHaveBeenCalledWith("cb-1", "Default Back");
            expect(defaultProps.onExecuteDelete).not.toHaveBeenCalled();
        });
    });

    describe("handleDelete", () => {
        it("should call onRequestDelete with cardback name when confirmation required", () => {
            render(<CardbackLibrary {...defaultProps} />);

            fireEvent.click(screen.getByTestId("delete-cb-2"));

            expect(defaultProps.onRequestDelete).toHaveBeenCalledWith("cb-2", "Custom Back");
        });

        it("should call onExecuteDelete when skipConfirmation is true", async () => {
            localStorage.setItem("cardback-delete-confirm-disabled", "true");

            render(<CardbackLibrary {...defaultProps} />);

            fireEvent.click(screen.getByTestId("delete-cb-2"));

            await waitFor(() => {
                expect(defaultProps.onExecuteDelete).toHaveBeenCalledWith("cb-2");
            });
        });
    });

    describe("handleStartEdit", () => {
        it("should show edit input when edit button is clicked", () => {
            render(<CardbackLibrary {...defaultProps} />);

            expect(screen.queryByTestId("edit-input-cb-1")).toBeNull();

            fireEvent.click(screen.getByTestId("edit-cb-1"));

            expect(screen.getByTestId("edit-input-cb-1")).toBeTruthy();
        });
    });

    describe("handleSaveEdit", () => {
        it("should call db.cardbacks.update and refresh when saving", async () => {
            mockGetAllCardbacks.mockResolvedValue(mockCardbackOptions);

            render(<CardbackLibrary {...defaultProps} />);

            // Start editing
            fireEvent.click(screen.getByTestId("edit-cb-1"));

            // Change the name
            const input = screen.getByTestId("edit-input-cb-1");
            fireEvent.change(input, { target: { value: "New Name" } });

            // Save
            fireEvent.click(screen.getByTestId("save-cb-1"));

            await waitFor(() => {
                expect(mockDbUpdate).toHaveBeenCalledWith("cb-1", { displayName: "New Name" });
            });

            await waitFor(() => {
                expect(mockGetAllCardbacks).toHaveBeenCalled();
            });
        });

        it("should not save if name is empty", async () => {
            render(<CardbackLibrary {...defaultProps} />);

            // Start editing
            fireEvent.click(screen.getByTestId("edit-cb-1"));

            // Clear the name
            const input = screen.getByTestId("edit-input-cb-1");
            fireEvent.change(input, { target: { value: "   " } });

            // Try to save
            fireEvent.click(screen.getByTestId("save-cb-1"));

            // Should close edit mode but not update db
            expect(mockDbUpdate).not.toHaveBeenCalled();
        });
    });

    describe("handleCancelEdit", () => {
        it("should close edit mode when cancel is clicked", () => {
            render(<CardbackLibrary {...defaultProps} />);

            // Start editing
            fireEvent.click(screen.getByTestId("edit-cb-1"));
            expect(screen.getByTestId("edit-input-cb-1")).toBeTruthy();

            // Cancel
            fireEvent.click(screen.getByTestId("cancel-cb-1"));

            expect(screen.queryByTestId("edit-input-cb-1")).toBeNull();
        });
    });

    describe("onSelectCardback", () => {
        it("should call onSelectCardback with correct arguments", () => {
            render(<CardbackLibrary {...defaultProps} />);

            fireEvent.click(screen.getByTestId("select-cb-2"));

            expect(defaultProps.onSelectCardback).toHaveBeenCalledWith("cb-2", "Custom Back");
        });
    });

    describe("onSetAsDefaultCardback", () => {
        it("should call onSetAsDefaultCardback with correct arguments", () => {
            render(<CardbackLibrary {...defaultProps} />);

            fireEvent.click(screen.getByTestId("set-default-cb-2"));

            expect(defaultProps.onSetAsDefaultCardback).toHaveBeenCalledWith("cb-2", "Custom Back");
        });
    });
});
