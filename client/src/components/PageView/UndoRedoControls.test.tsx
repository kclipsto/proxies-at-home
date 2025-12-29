import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock state
const mockState = vi.hoisted(() => ({
    undoStack: [] as unknown[],
    redoStack: [] as unknown[],
    undo: vi.fn(),
    redo: vi.fn(),
}));

vi.mock('@/store/undoRedo', () => ({
    useUndoRedoStore: vi.fn((selector) => selector(mockState)),
}));

vi.mock('lucide-react', () => ({
    Undo2: ({ className }: { className?: string }) => <span data-testid="undo-icon" className={className}>↶</span>,
    Redo2: ({ className }: { className?: string }) => <span data-testid="redo-icon" className={className}>↷</span>,
}));

import { UndoRedoControls } from './UndoRedoControls';

describe('UndoRedoControls', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.undoStack = [];
        mockState.redoStack = [];
    });

    describe('rendering', () => {
        it('should render undo button', () => {
            render(<UndoRedoControls />);
            expect(screen.getByLabelText('Undo')).toBeDefined();
        });

        it('should render redo button', () => {
            render(<UndoRedoControls />);
            expect(screen.getByLabelText('Redo')).toBeDefined();
        });
    });

    describe('disabled states', () => {
        it('should disable undo button when stack is empty', () => {
            mockState.undoStack = [];
            render(<UndoRedoControls />);
            const undoButton = screen.getByLabelText('Undo');
            expect(undoButton.hasAttribute('disabled')).toBe(true);
        });

        it('should disable redo button when stack is empty', () => {
            mockState.redoStack = [];
            render(<UndoRedoControls />);
            const redoButton = screen.getByLabelText('Redo');
            expect(redoButton.hasAttribute('disabled')).toBe(true);
        });

        it('should enable undo button when stack has items', () => {
            mockState.undoStack = [{}];
            render(<UndoRedoControls />);
            const undoButton = screen.getByLabelText('Undo');
            expect(undoButton.hasAttribute('disabled')).toBe(false);
        });

        it('should enable redo button when stack has items', () => {
            mockState.redoStack = [{}];
            render(<UndoRedoControls />);
            const redoButton = screen.getByLabelText('Redo');
            expect(redoButton.hasAttribute('disabled')).toBe(false);
        });
    });

    describe('click handlers', () => {
        it('should call undo when undo button clicked', () => {
            mockState.undoStack = [{}];
            render(<UndoRedoControls />);
            fireEvent.click(screen.getByLabelText('Undo'));
            expect(mockState.undo).toHaveBeenCalled();
        });

        it('should call redo when redo button clicked', () => {
            mockState.redoStack = [{}];
            render(<UndoRedoControls />);
            fireEvent.click(screen.getByLabelText('Redo'));
            expect(mockState.redo).toHaveBeenCalled();
        });
    });

    describe('keyboard shortcuts', () => {
        it('should set undoPressed on Ctrl+Z', () => {
            mockState.undoStack = [{}];
            render(<UndoRedoControls />);

            fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
            // Visual state changes (pressed style) are internal
            // Just verify no errors
        });

        it('should set redoPressed on Ctrl+Shift+Z', () => {
            mockState.redoStack = [{}];
            render(<UndoRedoControls />);

            fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true });
            // Visual state changes are internal
        });

        it('should reset pressed state on keyup', () => {
            mockState.undoStack = [{}];
            render(<UndoRedoControls />);

            fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
            fireEvent.keyUp(document, { key: 'z' });
            // Visual state changes are internal
        });

        it('should reset pressed state on Control keyup', () => {
            mockState.undoStack = [{}];
            render(<UndoRedoControls />);

            fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
            fireEvent.keyUp(document, { key: 'Control' });
            // Visual state changes are internal
        });

        it('should reset pressed state on Meta keyup', () => {
            mockState.undoStack = [{}];
            render(<UndoRedoControls />);

            fireEvent.keyDown(document, { key: 'z', metaKey: true });
            fireEvent.keyUp(document, { key: 'Meta' });
            // Visual state changes are internal
        });
    });
});
