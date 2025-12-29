import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock settings store
vi.mock('@/store', () => ({
    useSettingsStore: vi.fn((selector) => {
        const state = { preferredArtSource: 'scryfall' };
        return selector(state);
    }),
}));

vi.mock('flowbite-react', () => ({
    Button: ({ children, onClick, color, className, size, disabled, title }: { children: React.ReactNode; onClick?: () => void; color?: string; className?: string; size?: string; disabled?: boolean; title?: string }) => (
        <button onClick={onClick} data-color={color} className={className} data-size={size} disabled={disabled} title={title}>{children}</button>
    ),
    Checkbox: ({ checked, onChange, className }: { checked: boolean; onChange: (e: { target: { checked: boolean } }) => void; className?: string }) => (
        <input type="checkbox" checked={checked} onChange={onChange} className={className} data-testid="apply-to-all-checkbox" />
    ),
}));

vi.mock('lucide-react', () => ({
    Search: ({ className }: { className?: string }) => <span data-testid="search-icon" className={className}>🔍</span>,
    Filter: ({ className }: { className?: string }) => <span data-testid="filter-icon" className={className}>Funnel</span>,
    Image: ({ className }: { className?: string }) => <span data-testid="image-icon" className={className}>🖼️</span>,
    Settings: ({ className }: { className?: string }) => <span data-testid="settings-icon" className={className}>⚙️</span>,
}));

vi.mock('./CardbackLibrary', () => ({
    CardbackLibrary: () => <div data-testid="cardback-library">CardbackLibrary</div>,
}));

vi.mock('./ScryfallArtContent', () => ({
    ScryfallArtContent: ({ onSelectArtwork }: { onSelectArtwork: (url: string) => void }) => (
        <div data-testid="scryfall-art-content" onClick={() => onSelectArtwork('test-url')}>ScryfallArtContent</div>
    ),
}));

vi.mock('../MpcArt', () => ({
    MpcArtContent: () => <div data-testid="mpc-art-content">MpcArtContent</div>,
}));

vi.mock('@/helpers/cardbackLibrary', () => ({
    isCardbackId: (id: string) => id?.startsWith('cardback-'),
}));

import { ArtworkTabContent, type ArtworkTabContentProps } from './ArtworkTabContent';

describe('ArtworkTabContent', () => {
    const defaultProps: ArtworkTabContentProps = {
        modalCard: { uuid: '1', name: 'Test Card', order: 0, isUserUpload: false },
        linkedBackCard: undefined,
        selectedFace: 'front',
        isDFC: false,
        previewCardData: null,
        showCardbackLibrary: false,
        setShowCardbackLibrary: vi.fn(),
        applyToAll: false,
        setApplyToAll: vi.fn(),
        tabLabels: { front: 'Test Card', back: 'Back' },
        cardbackOptions: [],
        setCardbackOptions: vi.fn(),
        defaultCardbackId: 'default-cardback',
        filteredImageUrls: undefined,
        displayData: {
            name: 'Test Card',
            imageUrls: ['https://example.com/image.jpg'],
            id: 'test-id',
            processedDisplayUrl: null,
        },
        zoomLevel: 100,
        isGettingMore: false,
        onOpenSearch: vi.fn(),
        onSelectCardback: vi.fn(),
        onSetAsDefaultCardback: vi.fn(),
        onSelectArtwork: vi.fn(),
        onSelectMpcArt: vi.fn(),
        onGetMorePrints: vi.fn(),
        onClose: vi.fn(),
        onRequestDelete: vi.fn(),
        onExecuteDelete: vi.fn(),
        artSource: 'scryfall',
        setArtSource: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('rendering', () => {
        it('should return null when modalCard is null', () => {
            const { container } = render(<ArtworkTabContent {...defaultProps} modalCard={null} />);
            expect(container.innerHTML).toBe('');
        });

        it('should render search button', () => {
            render(<ArtworkTabContent {...defaultProps} />);
            expect(screen.getAllByText('Search for a different card...').length).toBeGreaterThan(0);
        });

        it('should render apply-to-all checkbox', () => {
            render(<ArtworkTabContent {...defaultProps} />);
            expect(screen.getByTestId('apply-to-all-checkbox')).toBeDefined();
        });

        it('should render card name in apply-to-all label', () => {
            render(<ArtworkTabContent {...defaultProps} />);
            expect(screen.getByText(/Apply to all cards named "Test Card"/)).toBeDefined();
        });
    });

    describe('search button', () => {
        it('should call onOpenSearch when clicked', () => {
            render(<ArtworkTabContent {...defaultProps} />);
            fireEvent.click(screen.getAllByText('Search for a different card...')[0]);
            expect(defaultProps.onOpenSearch).toHaveBeenCalled();
        });
    });

    describe('apply to all', () => {
        it('should call setApplyToAll when checkbox changes', () => {
            render(<ArtworkTabContent {...defaultProps} />);
            const checkbox = screen.getByTestId('apply-to-all-checkbox');
            fireEvent.click(checkbox);
            expect(defaultProps.setApplyToAll).toHaveBeenCalled();
        });
    });

    describe('scryfall art content', () => {
        it('should render scryfall art content when artSource is scryfall', () => {
            render(<ArtworkTabContent {...defaultProps} />);
            expect(screen.getByTestId('scryfall-art-content')).toBeDefined();
        });

        it('should render Get All Prints button for scryfall', () => {
            render(<ArtworkTabContent {...defaultProps} />);
            expect(screen.getByText('Get All Prints')).toBeDefined();
        });

        it('should call onGetMorePrints when button clicked', () => {
            render(<ArtworkTabContent {...defaultProps} />);
            fireEvent.click(screen.getByText('Get All Prints'));
            expect(defaultProps.onGetMorePrints).toHaveBeenCalled();
        });
    });

    describe('mpc art content', () => {
        it('should render mpc art content when artSource is mpc', () => {
            render(<ArtworkTabContent {...defaultProps} artSource="mpc" />);
            expect(screen.getByTestId('mpc-art-content')).toBeDefined();
        });

        it('should render Get All Art button for mpc', () => {
            render(<ArtworkTabContent {...defaultProps} artSource="mpc" />);
            expect(screen.getByText('Get All Art')).toBeDefined();
        });
    });

    describe('cardback library', () => {
        it('should show Use Cardback button for back face without DFC', () => {
            render(<ArtworkTabContent
                {...defaultProps}
                selectedFace="back"
                linkedBackCard={{ uuid: '2', name: 'Back', order: 0, isUserUpload: false }}
            />);
            expect(screen.getAllByText('Use Cardback').length).toBeGreaterThan(0);
        });

        it('should call setShowCardbackLibrary when Use Cardback clicked', () => {
            const setShowCardbackLibrary = vi.fn();
            render(<ArtworkTabContent
                {...defaultProps}
                selectedFace="back"
                linkedBackCard={{ uuid: '2', name: 'Back', order: 0, isUserUpload: false }}
                setShowCardbackLibrary={setShowCardbackLibrary}
            />);
            fireEvent.click(screen.getAllByText('Use Cardback')[0]);
            expect(setShowCardbackLibrary).toHaveBeenCalledWith(true);
        });

        it('should not show Use Cardback button for DFC cards', () => {
            render(<ArtworkTabContent
                {...defaultProps}
                selectedFace="back"
                isDFC={true}
                linkedBackCard={{ uuid: '2', name: 'Back', order: 0, isUserUpload: false }}
            />);
            expect(screen.queryByText('Use Cardback')).toBeNull();
        });
    });

    describe('loading state', () => {
        it('should show Loading... when isGettingMore is true', () => {
            render(<ArtworkTabContent {...defaultProps} isGettingMore={true} />);
            expect(screen.getByText('Loading...')).toBeDefined();
        });

        it('should disable button when isGettingMore is true', () => {
            render(<ArtworkTabContent {...defaultProps} isGettingMore={true} />);
            const button = screen.getByText('Loading...');
            expect(button.hasAttribute('disabled')).toBe(true);
        });
    });
});
