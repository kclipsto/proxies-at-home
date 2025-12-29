import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import { useKeyboardShortcutsStore, type KeyboardShortcutsState } from '../../store/keyboardShortcuts';

// Mock store
vi.mock('../../store/keyboardShortcuts', () => ({
    useKeyboardShortcutsStore: vi.fn(),
}));

// Mock Flowbite Modal
vi.mock('flowbite-react', () => ({
    Modal: ({ show, children, onClose }: { show: boolean, children: React.ReactNode, onClose: () => void }) => (
        show ? <div data-testid="modal-overlay">
            <button onClick={onClose} data-testid="modal-close-btn">Close</button>
            {children}
        </div> : null
    ),
    ModalHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="modal-header">{children}</div>,
    ModalBody: ({ children }: { children: React.ReactNode }) => <div data-testid="modal-body">{children}</div>,
}));

// Mock Lucide icons
vi.mock('lucide-react', () => ({
    Keyboard: () => <span data-testid="keyboard-icon">KeyboardIcon</span>,
}));

describe('KeyboardShortcutsModal', () => {
    const mockCloseModal = vi.fn();
    const mockStore = vi.mocked(useKeyboardShortcutsStore);

    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockState = (isOpen: boolean) => ({
        isOpen,
        openModal: vi.fn(),
        closeModal: mockCloseModal,
        toggleModal: vi.fn(),
    });

    it('should render nothing when closed', () => {
        mockStore.mockImplementation((selector: (state: KeyboardShortcutsState) => unknown) =>
            selector(mockState(false))
        );

        const { queryByTestId } = render(<KeyboardShortcutsModal />);
        expect(queryByTestId('modal-overlay')).toBeNull();
    });

    it('should render content when open', () => {
        mockStore.mockImplementation((selector: (state: KeyboardShortcutsState) => unknown) =>
            selector(mockState(true))
        );

        render(<KeyboardShortcutsModal />);
        expect(screen.getByTestId('modal-overlay')).toBeInTheDocument();
        expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
        expect(screen.getByText('Undo')).toBeInTheDocument();
        expect(screen.getByText('F')).toBeInTheDocument();
        expect(screen.getByText('Select Range')).toBeInTheDocument();
    });

    it('should close on Escape key', () => {
        mockStore.mockImplementation((selector: (state: KeyboardShortcutsState) => unknown) =>
            selector(mockState(true))
        );

        render(<KeyboardShortcutsModal />);

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(mockCloseModal).toHaveBeenCalled();
    });

    it('should NOT close on other keys', () => {
        mockStore.mockImplementation((selector: (state: KeyboardShortcutsState) => unknown) =>
            selector(mockState(true))
        );

        render(<KeyboardShortcutsModal />);

        fireEvent.keyDown(window, { key: 'Enter' });
        expect(mockCloseModal).not.toHaveBeenCalled();
    });

    it('should close when close button is clicked (flowbite integration)', () => {
        mockStore.mockImplementation((selector: (state: KeyboardShortcutsState) => unknown) =>
            selector(mockState(true))
        );

        render(<KeyboardShortcutsModal />);

        fireEvent.click(screen.getByTestId('modal-close-btn'));
        expect(mockCloseModal).toHaveBeenCalled();
    });

    it('should verify shortcut row rendering', () => {
        mockStore.mockImplementation((selector: (state: KeyboardShortcutsState) => unknown) =>
            selector(mockState(true))
        );

        render(<KeyboardShortcutsModal />);

        // Check for specific shortcut rendering details
        const undoKeys = screen.getAllByText('Z');
        expect(undoKeys.length).toBeGreaterThan(0);

        const ctrlKeys = screen.getAllByText('Ctrl');
        expect(ctrlKeys.length).toBeGreaterThan(0);
    });
});
