import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock success toast
const mockShowSuccessToast = vi.fn();

vi.mock('@/store/toast', () => ({
    useToastStore: {
        getState: () => ({
            showSuccessToast: mockShowSuccessToast,
        }),
    },
}));

vi.mock('@/store/artworkModal', () => ({
    useArtworkModalStore: vi.fn((selector) => {
        const state = {
            advancedSearchZoom: 1.0,
            setAdvancedSearchZoom: vi.fn(),
        };
        return selector(state);
    }),
}));

vi.mock('@/hooks/useZoomShortcuts', () => ({
    useZoomShortcuts: vi.fn(),
}));

vi.mock('../common', () => ({
    ArtSourceToggle: ({
        value,
        onChange,
    }: {
        value: string;
        onChange: (val: string) => void;
    }) => (
        <div data-testid="art-source-toggle" data-value={value}>
            <button data-testid="toggle-mpc" onClick={() => onChange('mpc')} data-selected={value === 'mpc'}>MPC Autofill</button>
            <button data-testid="toggle-scryfall" onClick={() => onChange('scryfall')} data-selected={value === 'scryfall'}>Scryfall</button>
        </div>
    ),
    ResponsiveModal: ({
        isOpen,
        onClose,
        children,
        header,
    }: {
        isOpen: boolean;
        onClose: () => void;
        children: React.ReactNode;
        header: React.ReactNode;
    }) => (
        isOpen ? (
            <div data-testid="responsive-modal">
                <div data-testid="modal-header">{header}</div>
                <div data-testid="modal-content">{children}</div>
                <button data-testid="modal-close-backdrop" onClick={onClose}>Close Modal</button>
            </div>
        ) : null
    ),
    FloatingZoomPanel: () => <div data-testid="floating-zoom-panel" />,
    CardArtContent: ({
        artSource,
        query,
        onSelectCard,
        onSwitchSource,
        filtersCollapsed,
    }: {
        artSource: 'scryfall' | 'mpc';
        query: string;
        onSelectCard: (cardName: string, imageUrl?: string, specificPrint?: { set: string; number: string }) => void;
        onSwitchSource?: () => void;
        filtersCollapsed?: boolean;
    }) => (
        <div
            data-testid={artSource === 'mpc' ? 'mpc-art-content' : 'scryfall-art-content'}
            data-query={query}
            data-filters-collapsed={filtersCollapsed}
        >
            {artSource === 'scryfall' ? (
                <div data-testid="scryfall-grid">
                    {query && (
                        <button
                            data-testid="scryfall-card"
                            onClick={() => onSelectCard(query)}
                        >
                            {query}
                        </button>
                    )}
                    {!query && <span>Search for a card to preview.</span>}
                </div>
            ) : (
                <div data-testid="mpc-grid">
                    <button
                        data-testid="mpc-select-card"
                        onClick={() => onSelectCard('Test Card', 'https://mpc.example.com/abc123')}
                    >
                        Select MPC Card
                    </button>
                    <button data-testid="mpc-switch-to-scryfall" onClick={onSwitchSource}>
                        Switch to Scryfall
                    </button>
                </div>
            )}
        </div>
    ),
}));

vi.mock('flowbite-react', () => ({
    TextInput: ({
        value,
        onChange,
        placeholder,
    }: {
        value: string;
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
        placeholder: string;
    }) => (
        <input
            data-testid="search-input"
            value={value}
            onChange={onChange}
            placeholder={placeholder}
        />
    ),
}));

import { AdvancedSearch } from './AdvancedSearch';

describe('AdvancedSearch', () => {
    const defaultProps = {
        isOpen: true,
        onClose: vi.fn(),
        onSelectCard: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('rendering', () => {
        it('should render modal when isOpen is true', () => {
            render(<AdvancedSearch {...defaultProps} />);
            expect(screen.getByTestId('responsive-modal')).toBeDefined();
        });

        it('should not render when isOpen is false', () => {
            render(<AdvancedSearch {...defaultProps} isOpen={false} />);
            expect(screen.queryByTestId('responsive-modal')).toBeNull();
        });

        it('should render custom title', () => {
            render(<AdvancedSearch {...defaultProps} title="Custom Title" />);
            expect(screen.getByText('Custom Title')).toBeDefined();
        });

        it('should render art source toggle', () => {
            render(<AdvancedSearch {...defaultProps} />);
            expect(screen.getAllByTestId('art-source-toggle').length).toBeGreaterThan(0);
        });

        it('should render search input', () => {
            render(<AdvancedSearch {...defaultProps} />);
            expect(screen.getByTestId('search-input')).toBeDefined();
        });
    });

    describe('art source toggle', () => {
        it('should default to scryfall source', () => {
            render(<AdvancedSearch {...defaultProps} />);
            expect(screen.getByTestId('scryfall-art-content')).toBeDefined();
        });

        it('should use initialSource prop', () => {
            render(<AdvancedSearch {...defaultProps} initialSource="mpc" />);
            expect(screen.getByTestId('mpc-art-content')).toBeDefined();
        });

        it('should switch to mpc when clicking mpc toggle', () => {
            render(<AdvancedSearch {...defaultProps} />);
            fireEvent.click(screen.getAllByTestId('toggle-mpc')[0]);
            expect(screen.getByTestId('mpc-art-content')).toBeDefined();
        });

        it('should switch to scryfall when clicking scryfall toggle', () => {
            render(<AdvancedSearch {...defaultProps} initialSource="mpc" />);
            fireEvent.click(screen.getAllByTestId('toggle-scryfall')[0]);
            expect(screen.getByTestId('scryfall-art-content')).toBeDefined();
        });
    });

    describe('search input', () => {
        it('should show Scryfall placeholder when scryfall source', () => {
            render(<AdvancedSearch {...defaultProps} />);
            expect(screen.getByPlaceholderText('Search card name...')).toBeDefined();
        });

        it('should show MPC placeholder when mpc source', () => {
            render(<AdvancedSearch {...defaultProps} initialSource="mpc" />);
            expect(screen.getByPlaceholderText('Search MPC Autofill...')).toBeDefined();
        });

        it('should update query when typing', () => {
            render(<AdvancedSearch {...defaultProps} />);
            const input = screen.getByTestId('search-input');
            fireEvent.change(input, { target: { value: 'Black Lotus' } });
            expect(input).toHaveProperty('value', 'Black Lotus');
        });

        it('should pass query to CardArtContent', () => {
            render(<AdvancedSearch {...defaultProps} />);
            const input = screen.getByTestId('search-input');
            fireEvent.change(input, { target: { value: 'Forest' } });
            expect(screen.getByTestId('scryfall-art-content').getAttribute('data-query')).toBe('Forest');
        });
    });

    describe('card selection', () => {
        it('should call onSelectCard when selecting a scryfall card', () => {
            render(<AdvancedSearch {...defaultProps} />);

            // Type a query first
            const input = screen.getByTestId('search-input');
            fireEvent.change(input, { target: { value: 'Forest' } });

            // Click the card
            fireEvent.click(screen.getByTestId('scryfall-card'));

            expect(defaultProps.onSelectCard).toHaveBeenCalledWith('Forest', undefined, undefined);
        });

        it('should call onSelectCard with MPC URL when selecting an MPC card', () => {
            render(<AdvancedSearch {...defaultProps} initialSource="mpc" />);

            fireEvent.click(screen.getByTestId('mpc-select-card'));

            expect(defaultProps.onSelectCard).toHaveBeenCalledWith('Test Card', 'https://mpc.example.com/abc123');
        });

        it('should close modal after selection by default', () => {
            const onClose = vi.fn();
            render(<AdvancedSearch {...defaultProps} onClose={onClose} />);

            const input = screen.getByTestId('search-input');
            fireEvent.change(input, { target: { value: 'Forest' } });
            fireEvent.click(screen.getByTestId('scryfall-card'));

            expect(onClose).toHaveBeenCalled();
        });

        it('should stay open and show toast when keepOpenOnAdd is true', () => {
            const onClose = vi.fn();
            render(<AdvancedSearch {...defaultProps} onClose={onClose} keepOpenOnAdd={true} />);

            const input = screen.getByTestId('search-input');
            fireEvent.change(input, { target: { value: 'Forest' } });
            fireEvent.click(screen.getByTestId('scryfall-card'));

            expect(onClose).not.toHaveBeenCalled();
            expect(mockShowSuccessToast).toHaveBeenCalledWith('Forest');
        });
    });

    describe('MPC source switching', () => {
        it('should switch to scryfall when clicking switch button in MPC content', () => {
            render(<AdvancedSearch {...defaultProps} initialSource="mpc" />);

            fireEvent.click(screen.getByTestId('mpc-switch-to-scryfall'));

            expect(screen.getByTestId('scryfall-art-content')).toBeDefined();
        });
    });

    describe('modal close', () => {
        it('should reset art source when modal closes and reopens', () => {
            const { rerender } = render(<AdvancedSearch {...defaultProps} initialSource="scryfall" />);

            // Switch to MPC
            fireEvent.click(screen.getAllByTestId('toggle-mpc')[0]);
            expect(screen.getByTestId('mpc-art-content')).toBeDefined();

            // Close modal
            rerender(<AdvancedSearch {...defaultProps} isOpen={false} initialSource="scryfall" />);

            // Reopen - should reset to initialSource
            rerender(<AdvancedSearch {...defaultProps} isOpen={true} initialSource="scryfall" />);

            expect(screen.getByTestId('scryfall-art-content')).toBeDefined();
        });

        it('should reset query when modal closes and reopens', () => {
            const { rerender } = render(<AdvancedSearch {...defaultProps} />);

            // Type something
            const input = screen.getByTestId('search-input');
            fireEvent.change(input, { target: { value: 'Forest' } });
            expect(input).toHaveProperty('value', 'Forest');

            // Close modal
            rerender(<AdvancedSearch {...defaultProps} isOpen={false} />);

            // Reopen - should reset query
            rerender(<AdvancedSearch {...defaultProps} isOpen={true} />);

            expect(screen.getByTestId('search-input')).toHaveProperty('value', '');
        });
    });

    describe('filter toggle', () => {
        it('should toggle filter collapse state for MPC', () => {
            render(<AdvancedSearch {...defaultProps} initialSource="mpc" />);

            // Default is not collapsed
            expect(screen.getByTestId('mpc-art-content').getAttribute('data-filters-collapsed')).toBe('false');

            // Find filter toggle button (title="Hide Filters")
            const hideBtn = screen.getByTitle('Hide Filters');
            fireEvent.click(hideBtn);

            // Should be collapsed now
            expect(screen.getByTestId('mpc-art-content').getAttribute('data-filters-collapsed')).toBe('true');

            // Click again to show
            const showBtn = screen.getByTitle('Show Filters');
            fireEvent.click(showBtn);
            expect(screen.getByTestId('mpc-art-content').getAttribute('data-filters-collapsed')).toBe('false');
        });
    });
});
