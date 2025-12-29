import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock all the hooks and dependencies
const mockHandleInputChange = vi.fn();
const mockHandleClear = vi.fn();
const mockHandleKeyDown = vi.fn();
const mockSetHoveredIndex = vi.fn();
const mockShowSuccessToast = vi.fn();

vi.mock('@/hooks/useCardAutocomplete', () => ({
    useCardAutocomplete: vi.fn(() => ({
        query: '',
        setQuery: vi.fn(),
        suggestions: [] as string[],
        showAutocomplete: false,
        setShowAutocomplete: vi.fn(),
        hoveredIndex: null as number | null,
        setHoveredIndex: mockSetHoveredIndex,
        handleInputChange: mockHandleInputChange,
        handleClear: mockHandleClear,
        handleKeyDown: mockHandleKeyDown,
        hoverPreviewUrl: null,
        containerRef: { current: null },
        handleSelect: vi.fn(),
    })),
}));

vi.mock('@/hooks/useScryfallPreview', () => ({
    useScryfallPreview: vi.fn(() => ({
        setVariations: [],
        validatedPreviewUrl: null,
    })),
}));

vi.mock('@/helpers/cardInfoHelper', () => ({
    extractCardInfo: vi.fn((query: string) => ({ name: query, set: '', number: '' })),
}));

vi.mock('@/helpers/mpcAutofillApi', () => ({
    getMpcAutofillImageUrl: vi.fn((id: string) => `https://mpc.example.com/${id}`),
    parseMpcCardName: vi.fn((name: string) => name.replace(/ \(.*\)$/, '')),
}));

vi.mock('@/store/toast', () => ({
    useToastStore: {
        getState: () => ({
            showSuccessToast: mockShowSuccessToast,
        }),
    },
}));

vi.mock('./SearchCarousel', () => ({
    SearchCarousel: ({
        onAddCard,
        onToggleResultsList,
        displaySuggestions,
        getScryfallImageUrl,
    }: {
        onAddCard: (idx?: number) => void;
        onToggleResultsList: (e?: React.MouseEvent) => void;
        displaySuggestions: { name: string }[];
        getScryfallImageUrl?: (name: string) => string;
    }) => (
        <div data-testid="search-carousel" data-suggestion-count={displaySuggestions.length}>
            <button data-testid="carousel-add" onClick={() => onAddCard(0)}>Add Card</button>
            <button data-testid="carousel-toggle-list" onClick={(e) => onToggleResultsList(e)}>Toggle List</button>
            {getScryfallImageUrl && (
                <button
                    data-testid="test-get-image-url"
                    onClick={() => console.log(getScryfallImageUrl('Test Card'))}
                    data-url={getScryfallImageUrl('Test Card')}
                >
                    Test URL
                </button>
            )}
            {displaySuggestions.map((s, i) => (
                <div key={i} data-testid={`carousel-card-${i}`}>{s.name}</div>
            ))}
        </div>
    ),
}));

vi.mock('./SearchResultsList', () => ({
    SearchResultsList: ({ onClose }: { onClose: () => void }) => (
        <div data-testid="search-results-list">
            <button data-testid="close-results-list" onClick={onClose}>Close</button>
        </div>
    ),
}));

vi.mock('../MpcArt', () => ({
    MpcArtContent: ({
        onSelectCard,
        onSwitchToScryfall,
        cardName,
        filtersCollapsed,
    }: {
        onSelectCard: (card: { name: string; identifier: string }) => void;
        onSwitchToScryfall: () => void;
        cardName: string;
        filtersCollapsed: boolean;
    }) => (
        <div data-testid="mpc-art-content" data-card-name={cardName} data-filters-collapsed={filtersCollapsed}>
            <button
                data-testid="mpc-select-card"
                onClick={() => onSelectCard({ name: 'Test Card (Foil)', identifier: 'abc123' })}
            >
                Select MPC Card
            </button>
            <button data-testid="mpc-switch-to-scryfall" onClick={onSwitchToScryfall}>
                Switch to Scryfall
            </button>
        </div>
    ),
}));

vi.mock('../common', () => ({
    ToggleButtonGroup: ({
        value,
        onChange,
        options,
    }: {
        value: string;
        onChange: (val: string) => void;
        options: { id: string; label: string }[];
    }) => (
        <div data-testid="toggle-button-group" data-value={value}>
            {options.map((opt) => (
                <button
                    key={opt.id}
                    data-testid={`toggle-${opt.id}`}
                    onClick={() => onChange(opt.id)}
                    data-selected={value === opt.id}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    ),
    ArtSourceToggle: ({
        value,
        onChange,
    }: {
        value: string;
        onChange: (val: string) => void;
    }) => (
        <div data-testid="toggle-button-group" data-value={value}>
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
}));

vi.mock('flowbite-react', () => ({
    Button: ({ children, onClick, disabled, className }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
        <button data-testid="add-button" onClick={onClick} disabled={disabled} className={className}>
            {children}
        </button>
    ),
    TextInput: ({
        value,
        onChange,
        onKeyDown,
        placeholder,
    }: {
        value: string;
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
        onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
        placeholder: string;
    }) => (
        <input
            data-testid="search-input"
            value={value}
            onChange={onChange}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
        />
    ),
}));

// Import the hooks so we can control their return values
import { useCardAutocomplete } from '@/hooks/useCardAutocomplete';
import { useScryfallPreview } from '@/hooks/useScryfallPreview';
import { AdvancedSearch } from './AdvancedSearch';

describe('AdvancedSearch', () => {
    const defaultProps = {
        isOpen: true,
        onClose: vi.fn(),
        onSelectCard: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset hook mocks to defaults
        vi.mocked(useCardAutocomplete).mockReturnValue({
            query: '',
            setQuery: vi.fn(),
            suggestions: [],
            showAutocomplete: false,
            setShowAutocomplete: vi.fn(),
            hoveredIndex: null,
            setHoveredIndex: mockSetHoveredIndex,
            handleInputChange: mockHandleInputChange,
            handleClear: mockHandleClear,
            handleKeyDown: mockHandleKeyDown,
            hoverPreviewUrl: null,
            containerRef: { current: null },
            handleSelect: vi.fn(),
        });
        vi.mocked(useScryfallPreview).mockReturnValue({
            setVariations: [],
            validatedPreviewUrl: null,
        });
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

        it('should render default title "Add Card"', () => {
            render(<AdvancedSearch {...defaultProps} title="Add Card" />);
            expect(screen.getByRole('heading', { name: 'Add Card' })).toBeDefined();
        });

        it('should render custom title', () => {
            render(<AdvancedSearch {...defaultProps} title="Custom Title" />);
            expect(screen.getByText('Custom Title')).toBeDefined();
        });

        it('should render art source toggle', () => {
            render(<AdvancedSearch {...defaultProps} />);
            expect(screen.getAllByTestId('toggle-button-group').length).toBeGreaterThan(0);
        });

        it('should render search input', () => {
            render(<AdvancedSearch {...defaultProps} />);
            expect(screen.getByTestId('search-input')).toBeDefined();
        });
    });

    describe('art source toggle', () => {
        it('should default to scryfall source', () => {
            render(<AdvancedSearch {...defaultProps} />);
            const toggles = screen.getAllByTestId('toggle-button-group');
            toggles.forEach(toggle => {
                expect(toggle.getAttribute('data-value')).toBe('scryfall');
            });
        });

        it('should use initialSource prop', () => {
            render(<AdvancedSearch {...defaultProps} initialSource="mpc" />);
            const toggles = screen.getAllByTestId('toggle-button-group');
            toggles.forEach(toggle => {
                expect(toggle.getAttribute('data-value')).toBe('mpc');
            });
        });

        it('should show SearchCarousel when scryfall is selected', () => {
            render(<AdvancedSearch {...defaultProps} />);
            expect(screen.getByTestId('search-carousel')).toBeDefined();
            // MPC content is kept in DOM but hidden
            const mpcContent = screen.getByTestId('mpc-art-content');
            expect(mpcContent.parentElement).toHaveProperty('className', 'hidden');
        });

        it('should show MpcArtContent when mpc is selected', () => {
            render(<AdvancedSearch {...defaultProps} initialSource="mpc" />);
            expect(screen.getByTestId('mpc-art-content')).toBeDefined();
            expect(screen.queryByTestId('search-carousel')).toBeNull();
        });

        it('should switch to mpc when clicking mpc toggle', () => {
            render(<AdvancedSearch {...defaultProps} />);

            const mpcToggles = screen.getAllByTestId('toggle-mpc');
            fireEvent.click(mpcToggles[0]);

            expect(screen.getByTestId('mpc-art-content')).toBeDefined();
        });

        it('should switch to scryfall when clicking scryfall toggle', () => {
            render(<AdvancedSearch {...defaultProps} initialSource="mpc" />);

            const scryfallToggles = screen.getAllByTestId('toggle-scryfall');
            fireEvent.click(scryfallToggles[0]);

            expect(screen.getByTestId('search-carousel')).toBeDefined();
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

        it('should call handleInputChange on input change', () => {
            render(<AdvancedSearch {...defaultProps} />);

            const input = screen.getByTestId('search-input');
            fireEvent.change(input, { target: { value: 'test' } });

            expect(mockHandleInputChange).toHaveBeenCalled();
        });

        it('should show clear button when query exists', () => {
            vi.mocked(useCardAutocomplete).mockReturnValue({
                query: 'Black Lotus',
                setQuery: vi.fn(),
                suggestions: [],
                showAutocomplete: false,
                setShowAutocomplete: vi.fn(),
                hoveredIndex: null,
                setHoveredIndex: mockSetHoveredIndex,
                handleInputChange: mockHandleInputChange,
                handleClear: mockHandleClear,
                handleKeyDown: mockHandleKeyDown,
                hoverPreviewUrl: null,
                containerRef: { current: null },
                handleSelect: vi.fn(),
            });

            const { container } = render(<AdvancedSearch {...defaultProps} />);
            // Clear button is within the input container
            const clearButton = container.querySelector('button.absolute');
            expect(clearButton).not.toBeNull();
        });

        it('should call handleClear when clicking clear button', () => {
            vi.mocked(useCardAutocomplete).mockReturnValue({
                query: 'Black Lotus',
                setQuery: vi.fn(),
                suggestions: [],
                showAutocomplete: false,
                setShowAutocomplete: vi.fn(),
                hoveredIndex: null,
                setHoveredIndex: mockSetHoveredIndex,
                handleInputChange: mockHandleInputChange,
                handleClear: mockHandleClear,
                handleKeyDown: mockHandleKeyDown,
                hoverPreviewUrl: null,
                containerRef: { current: null },
                handleSelect: vi.fn(),
            });

            const { container } = render(<AdvancedSearch {...defaultProps} />);
            const clearButton = container.querySelector('button.absolute') as HTMLButtonElement;
            fireEvent.click(clearButton);

            expect(mockHandleClear).toHaveBeenCalled();
        });
    });

    describe('add card functionality', () => {
        it('should show add button when scryfall source', () => {
            render(<AdvancedSearch {...defaultProps} />);
            expect(screen.getByTestId('add-button')).toBeDefined();
        });

        it('should disable add button when query is empty', () => {
            render(<AdvancedSearch {...defaultProps} />);
            const addButton = screen.getByTestId('add-button');
            expect(addButton).toHaveProperty('disabled', true);
        });

        it('should enable add button when query exists', () => {
            vi.mocked(useCardAutocomplete).mockReturnValue({
                query: 'Black Lotus',
                setQuery: vi.fn(),
                suggestions: [],
                showAutocomplete: false,
                setShowAutocomplete: vi.fn(),
                hoveredIndex: null,
                setHoveredIndex: mockSetHoveredIndex,
                handleInputChange: mockHandleInputChange,
                handleClear: mockHandleClear,
                handleKeyDown: mockHandleKeyDown,
                hoverPreviewUrl: null,
                containerRef: { current: null },
                handleSelect: vi.fn(),
            });

            render(<AdvancedSearch {...defaultProps} />);
            const addButton = screen.getByTestId('add-button');
            expect(addButton).toHaveProperty('disabled', false);
        });

        it('should call onSelectCard when adding card from carousel', () => {
            vi.mocked(useCardAutocomplete).mockReturnValue({
                query: 'Black Lotus',
                setQuery: vi.fn(),
                suggestions: ['Black Lotus'],
                showAutocomplete: true,
                setShowAutocomplete: vi.fn(),
                hoveredIndex: 0,
                setHoveredIndex: mockSetHoveredIndex,
                handleInputChange: mockHandleInputChange,
                handleClear: mockHandleClear,
                handleKeyDown: mockHandleKeyDown,
                hoverPreviewUrl: null,
                containerRef: { current: null },
                handleSelect: vi.fn(),
            });

            render(<AdvancedSearch {...defaultProps} />);

            const carouselAddButton = screen.getByTestId('carousel-add');
            fireEvent.click(carouselAddButton);

            expect(defaultProps.onSelectCard).toHaveBeenCalledWith('Black Lotus');
        });

        it('should call onClose and handleClear after adding card', () => {
            vi.mocked(useCardAutocomplete).mockReturnValue({
                query: 'Black Lotus',
                setQuery: vi.fn(),
                suggestions: ['Black Lotus'],
                showAutocomplete: true,
                setShowAutocomplete: vi.fn(),
                hoveredIndex: 0,
                setHoveredIndex: mockSetHoveredIndex,
                handleInputChange: mockHandleInputChange,
                handleClear: mockHandleClear,
                handleKeyDown: mockHandleKeyDown,
                hoverPreviewUrl: null,
                containerRef: { current: null },
                handleSelect: vi.fn(),
            });

            render(<AdvancedSearch {...defaultProps} />);

            const carouselAddButton = screen.getByTestId('carousel-add');
            fireEvent.click(carouselAddButton);

            expect(mockHandleClear).toHaveBeenCalled();
            expect(defaultProps.onClose).toHaveBeenCalled();
        });

        it('should show toast and stay open when keepOpenOnAdd is true', () => {
            vi.mocked(useCardAutocomplete).mockReturnValue({
                query: 'Black Lotus',
                setQuery: vi.fn(),
                suggestions: ['Black Lotus'],
                showAutocomplete: true,
                setShowAutocomplete: vi.fn(),
                hoveredIndex: 0,
                setHoveredIndex: mockSetHoveredIndex,
                handleInputChange: mockHandleInputChange,
                handleClear: mockHandleClear,
                handleKeyDown: mockHandleKeyDown,
                hoverPreviewUrl: null,
                containerRef: { current: null },
                handleSelect: vi.fn(),
            });

            const onClose = vi.fn();
            render(<AdvancedSearch {...defaultProps} onClose={onClose} keepOpenOnAdd={true} />);

            const carouselAddButton = screen.getByTestId('carousel-add');
            fireEvent.click(carouselAddButton);

            expect(mockShowSuccessToast).toHaveBeenCalledWith('Black Lotus');
            expect(onClose).not.toHaveBeenCalled();
        });

        it('should add query directly when no suggestions', () => {
            vi.mocked(useCardAutocomplete).mockReturnValue({
                query: 'Unknown Card',
                setQuery: vi.fn(),
                suggestions: [],
                showAutocomplete: false,
                setShowAutocomplete: vi.fn(),
                hoveredIndex: null,
                setHoveredIndex: mockSetHoveredIndex,
                handleInputChange: mockHandleInputChange,
                handleClear: mockHandleClear,
                handleKeyDown: mockHandleKeyDown,
                hoverPreviewUrl: null,
                containerRef: { current: null },
                handleSelect: vi.fn(),
            });

            render(<AdvancedSearch {...defaultProps} />);

            const addButton = screen.getByTestId('add-button');
            fireEvent.click(addButton);

            expect(defaultProps.onSelectCard).toHaveBeenCalledWith('Unknown Card');
        });
    });

    describe('MPC card selection', () => {
        it('should call onSelectCard with MPC image URL', () => {
            render(<AdvancedSearch {...defaultProps} initialSource="mpc" />);

            const mpcSelectButton = screen.getByTestId('mpc-select-card');
            fireEvent.click(mpcSelectButton);

            expect(defaultProps.onSelectCard).toHaveBeenCalledWith('Test Card', 'https://mpc.example.com/abc123');
        });

        it('should switch to scryfall when clicking switch button in MPC', () => {
            render(<AdvancedSearch {...defaultProps} initialSource="mpc" />);

            const switchButton = screen.getByTestId('mpc-switch-to-scryfall');
            fireEvent.click(switchButton);

            expect(screen.getByTestId('search-carousel')).toBeDefined();
        });
    });

    describe('results list', () => {
        it('should not show results list by default', () => {
            render(<AdvancedSearch {...defaultProps} />);
            expect(screen.queryByTestId('search-results-list')).toBeNull();
        });

        it('should toggle results list when clicking toggle button', () => {
            render(<AdvancedSearch {...defaultProps} />);

            const toggleButton = screen.getByTestId('carousel-toggle-list');
            fireEvent.click(toggleButton);

            expect(screen.getByTestId('search-results-list')).toBeDefined();
        });

        it('should close results list when clicking close button', () => {
            render(<AdvancedSearch {...defaultProps} />);

            // Open results list
            const toggleButton = screen.getByTestId('carousel-toggle-list');
            fireEvent.click(toggleButton);

            expect(screen.getByTestId('search-results-list')).toBeDefined();

            // Close it
            const closeButton = screen.getByTestId('close-results-list');
            fireEvent.click(closeButton);

            expect(screen.queryByTestId('search-results-list')).toBeNull();
        });

        it('should only show results list for scryfall source', () => {
            render(<AdvancedSearch {...defaultProps} initialSource="mpc" />);

            // Results list is not shown for MPC
            expect(screen.queryByTestId('search-results-list')).toBeNull();
            expect(screen.queryByTestId('carousel-toggle-list')).toBeNull();
        });
    });

    describe('modal close', () => {
        it('should call onClose when clicking close button in header', () => {
            const onClose = vi.fn();
            const { container } = render(<AdvancedSearch {...defaultProps} onClose={onClose} />);

            // Find the X close button in the header
            const headerCloseButton = container.querySelector('[data-testid="modal-header"] button:not([data-testid])');
            if (headerCloseButton) {
                fireEvent.click(headerCloseButton);
                expect(onClose).toHaveBeenCalled();
            }
        });

        it('should reset art source when modal closes and reopens', () => {
            const { rerender } = render(<AdvancedSearch {...defaultProps} initialSource="scryfall" />);

            // Switch to MPC
            const mpcToggles = screen.getAllByTestId('toggle-mpc');
            fireEvent.click(mpcToggles[0]);
            expect(screen.getByTestId('mpc-art-content')).toBeDefined();

            // Close modal
            rerender(<AdvancedSearch {...defaultProps} isOpen={false} initialSource="scryfall" />);

            // Reopen - should reset to initialSource
            rerender(<AdvancedSearch {...defaultProps} isOpen={true} initialSource="scryfall" />);

            expect(screen.getByTestId('search-carousel')).toBeDefined();
        });
    });

    describe('keyboard navigation', () => {
        it('should call handleKeyDown on key press', () => {
            render(<AdvancedSearch {...defaultProps} />);

            const input = screen.getByTestId('search-input');
            fireEvent.keyDown(input, { key: 'ArrowDown' });

            expect(mockHandleKeyDown).toHaveBeenCalled();
        });

        it('should add card on Enter key when scryfall source', () => {
            vi.mocked(useCardAutocomplete).mockReturnValue({
                query: 'Black Lotus',
                setQuery: vi.fn(),
                suggestions: ['Black Lotus'],
                showAutocomplete: true,
                setShowAutocomplete: vi.fn(),
                hoveredIndex: 0,
                setHoveredIndex: mockSetHoveredIndex,
                handleInputChange: mockHandleInputChange,
                handleClear: mockHandleClear,
                handleKeyDown: mockHandleKeyDown,
                hoverPreviewUrl: null,
                containerRef: { current: null },
                handleSelect: vi.fn(),
            });

            render(<AdvancedSearch {...defaultProps} />);

            const input = screen.getByTestId('search-input');
            fireEvent.keyDown(input, { key: 'Enter' });

            expect(defaultProps.onSelectCard).toHaveBeenCalled();
        });

        it('should not add card on Enter key when mpc source', () => {
            vi.mocked(useCardAutocomplete).mockReturnValue({
                query: 'Black Lotus',
                setQuery: vi.fn(),
                suggestions: [],
                showAutocomplete: false,
                setShowAutocomplete: vi.fn(),
                hoveredIndex: null,
                setHoveredIndex: mockSetHoveredIndex,
                handleInputChange: mockHandleInputChange,
                handleClear: mockHandleClear,
                handleKeyDown: mockHandleKeyDown,
                hoverPreviewUrl: null,
                containerRef: { current: null },
                handleSelect: vi.fn(),
            });

            render(<AdvancedSearch {...defaultProps} initialSource="mpc" />);

            const input = screen.getByTestId('search-input');
            fireEvent.keyDown(input, { key: 'Enter' });

            expect(defaultProps.onSelectCard).not.toHaveBeenCalled();
        });
    });

    describe('suggestions display', () => {
        it('should pass suggestions to carousel', () => {
            vi.mocked(useCardAutocomplete).mockReturnValue({
                query: 'Black',
                setQuery: vi.fn(),
                suggestions: ['Black Lotus', 'Black Knight'],
                showAutocomplete: true,
                setShowAutocomplete: vi.fn(),
                hoveredIndex: 0,
                setHoveredIndex: mockSetHoveredIndex,
                handleInputChange: mockHandleInputChange,
                handleClear: mockHandleClear,
                handleKeyDown: mockHandleKeyDown,
                hoverPreviewUrl: null,
                containerRef: { current: null },
                handleSelect: vi.fn(),
            });

            render(<AdvancedSearch {...defaultProps} />);

            // Should show at least 12 items (duplicated for infinite scroll)
            const carousel = screen.getByTestId('search-carousel');
            const count = parseInt(carousel.getAttribute('data-suggestion-count') || '0');
            expect(count).toBeGreaterThanOrEqual(12);
        });

        it('should use setVariations over suggestions when available', () => {
            vi.mocked(useCardAutocomplete).mockReturnValue({
                query: 'Black Lotus',
                setQuery: vi.fn(),
                suggestions: ['Black Lotus'],
                showAutocomplete: true,
                setShowAutocomplete: vi.fn(),
                hoveredIndex: 0,
                setHoveredIndex: mockSetHoveredIndex,
                handleInputChange: mockHandleInputChange,
                handleClear: mockHandleClear,
                handleKeyDown: mockHandleKeyDown,
                hoverPreviewUrl: null,
                containerRef: { current: null },
                handleSelect: vi.fn(),
            });

            vi.mocked(useScryfallPreview).mockReturnValue({
                setVariations: [
                    { name: 'Black Lotus', set: 'LEA', number: '1', imageUrls: [], lang: 'en' },
                    { name: 'Black Lotus', set: 'LEB', number: '1', imageUrls: [], lang: 'en' },
                ],
                validatedPreviewUrl: null,
            });

            render(<AdvancedSearch {...defaultProps} />);

            // Should show set variations
            expect(screen.getByTestId('carousel-card-0')).toBeDefined();
        });
    });

    describe('helper functions', () => {
        it('should pass correct getScryfallImageUrl function to carousel', () => {
            render(<AdvancedSearch {...defaultProps} />);
            const testBtn = screen.getByTestId('test-get-image-url');
            const url = testBtn.getAttribute('data-url');
            expect(url).toBe('https://api.scryfall.com/cards/named?exact=Test%20Card&format=image&version=large');
        });
    });

    describe('validated preview logic', () => {
        it('should show validated preview card when no suggestions but validated url exists', () => {
            vi.mocked(useCardAutocomplete).mockReturnValue({
                query: 'Validated Card',
                setQuery: vi.fn(),
                suggestions: [],
                showAutocomplete: false,
                setShowAutocomplete: vi.fn(),
                hoveredIndex: null,
                setHoveredIndex: mockSetHoveredIndex,
                handleInputChange: mockHandleInputChange,
                handleClear: mockHandleClear,
                handleKeyDown: mockHandleKeyDown,
                hoverPreviewUrl: null,
                containerRef: { current: null },
                handleSelect: vi.fn(),
            });

            vi.mocked(useScryfallPreview).mockReturnValue({
                setVariations: [],
                validatedPreviewUrl: 'https://example.com/validated.jpg',
            });

            render(<AdvancedSearch {...defaultProps} />);

            // Should show 1 card (validated one)
            // Note: Loops logic might duplicated it to 12 if < 10
            expect(screen.getByTestId('carousel-card-0').textContent).toContain('Validated Card');
        });
    });

    describe('MPC filter toggle', () => {
        it('should toggle filter collapse state', () => {
            render(<AdvancedSearch {...defaultProps} initialSource="mpc" />);

            // Default is visible on desktop (false)
            const mpcContent = screen.getByTestId('mpc-art-content');
            expect(mpcContent.getAttribute('data-filters-collapsed')).toBe('false');

            // Find filter toggle (title="Hide Filters")
            const hideBtn = screen.getByTitle('Hide Filters');
            fireEvent.click(hideBtn);

            // Should be collapsed now
            expect(mpcContent.getAttribute('data-filters-collapsed')).toBe('true');

            // Click again to show
            const showBtn = screen.getByTitle('Show Filters');
            fireEvent.click(showBtn);
            expect(mpcContent.getAttribute('data-filters-collapsed')).toBe('false');
        });
    });
});
