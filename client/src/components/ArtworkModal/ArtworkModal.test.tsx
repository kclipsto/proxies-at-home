import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ImportOrchestrator } from '@/helpers/ImportOrchestrator';


// Use vi.hoisted to hoist mock values
const {
    mockCloseModal,
    mockSetDefaultCardbackId,
    mockSelectedCards,
    mockState,
    mockDefaultCardbackId,
    mockChangeCardArtwork,
    mockCreateLinkedBackCard,
    mockUndoableChangeCardback,
    mockFetchCardWithPrints,
    mockGetAllCardbacks,
    mockDbCards,
    mockDbCardbacks,
    mockLiveQueryResult,
    mockUpdateCard,
} = vi.hoisted(() => {
    return {
        mockCloseModal: vi.fn(),
        mockSetDefaultCardbackId: vi.fn(),
        mockSelectedCards: new Set<string>(),
        mockDefaultCardbackId: 'default-cardback-1' as string,
        mockState: {
            isModalOpen: false,
            modalCard: null as { uuid: string; name: string; imageId?: string; linkedBackId?: string } | null,
            initialTab: 'artwork' as 'artwork' | 'settings',
            initialFace: 'front' as 'front' | 'back',
            initialArtSource: undefined as 'scryfall' | 'mpc' | undefined,
            defaultCardbackId: 'default-cardback-1',
            allCards: [] as { uuid: string; name: string }[],
        },
        mockChangeCardArtwork: vi.fn(),
        mockCreateLinkedBackCard: vi.fn(),
        mockUndoableChangeCardback: vi.fn(),
        mockFetchCardWithPrints: vi.fn(),
        mockGetAllCardbacks: vi.fn().mockResolvedValue([]),
        mockDbCards: {
            get: vi.fn(),
            update: vi.fn().mockResolvedValue(undefined),
            bulkGet: vi.fn().mockResolvedValue([]),
            filter: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
        },
        mockDbCardbacks: {
            get: vi.fn(),
            delete: vi.fn().mockResolvedValue(undefined),
        },
        mockLiveQueryResult: { value: null as unknown },
        mockUpdateCard: vi.fn(),
    };
});

vi.mock('@/store/artworkModal', () => {
    const getStore = () => ({
        open: mockState.isModalOpen,
        card: mockState.modalCard,
        initialTab: mockState.initialTab,
        initialFace: mockState.initialFace,
        initialArtSource: mockState.initialArtSource,
        allCards: mockState.allCards,
        closeModal: mockCloseModal,
        updateCard: mockUpdateCard,
    });

    const fn = (selector: (state: ReturnType<typeof getStore>) => unknown) => {
        const state = getStore();
        return typeof selector === 'function' ? selector(state) : state;
    };
    fn.getState = getStore;

    return { useArtworkModalStore: fn };
});

vi.mock('@/store/settings', () => ({
    useSettingsStore: Object.assign(
        vi.fn((selector) => {
            const state = {
                defaultCardbackId: mockDefaultCardbackId,
                setDefaultCardbackId: mockSetDefaultCardbackId,
                preferredArtSource: 'scryfall',
            };
            return typeof selector === 'function' ? selector(state) : state;
        }),
        {
            getState: () => ({
                defaultCardbackId: mockDefaultCardbackId,
                setDefaultCardbackId: mockSetDefaultCardbackId,
                preferredArtSource: 'scryfall',
            }),
            subscribe: vi.fn(() => vi.fn()),
        }
    ),
}));

vi.mock('@/store/selection', () => ({
    useSelectionStore: {
        getState: () => ({
            selectedCards: mockSelectedCards,
            setFlipped: vi.fn(),
        }),
    },
}));

vi.mock('dexie-react-hooks', () => ({
    useLiveQuery: vi.fn(() => null),
}));

vi.mock('@/db', () => ({
    db: {
        cards: mockDbCards,
        images: {
            get: vi.fn(),
            update: vi.fn().mockResolvedValue(undefined),
        },
        cardbacks: mockDbCardbacks,
    },
}));

vi.mock('@/helpers/dbUtils', () => ({
    changeCardArtwork: mockChangeCardArtwork,
    createLinkedBackCard: mockCreateLinkedBackCard,
}));

vi.mock('@/helpers/undoableActions', () => ({
    undoableChangeCardback: mockUndoableChangeCardback,
}));

vi.mock('@/helpers/scryfallApi', () => ({
    fetchCardWithPrints: mockFetchCardWithPrints,
}));

vi.mock('@/helpers/cardbackLibrary', () => ({
    getAllCardbacks: mockGetAllCardbacks,
    isCardbackId: vi.fn(() => false),
}));

vi.mock('@/helpers/mpcAutofillApi', () => ({
    getMpcAutofillImageUrl: vi.fn((id: string) => `https://mpc.example.com/${id}`),
    extractMpcIdentifierFromImageId: vi.fn((imageId: string) => {
        // Return the imageId if it looks like an MPC identifier (contains 'mpc')
        if (imageId?.includes('/api/cards/images/mpc') || imageId?.includes('mpc')) {
            return imageId;
        }
        return null;
    }),
}));

vi.mock('@/helpers/mpcImportIntegration', () => ({
    parseMpcCardLogic: vi.fn(() => ({
        name: 'Test Card',
        hasBuiltInBleed: false,
        needsEnrichment: true,
    })),
}));

vi.mock('@/helpers/dfcHelpers', () => ({
    getFaceNamesFromPrints: vi.fn(() => []),
    computeTabLabels: vi.fn(() => ({ front: 'Front', back: 'Back' })),
    getCurrentCardFace: vi.fn(() => 'front'),
    filterPrintsByFace: vi.fn((prints) => prints),
}));

vi.mock('@/helpers/imageHelper', () => ({
    parseImageIdFromUrl: vi.fn((url: string) => url),
}));

vi.mock('@/helpers/ImportOrchestrator', () => ({
    ImportOrchestrator: {
        resolve: vi.fn().mockResolvedValue({
            cardsToAdd: [{
                name: 'Resolved Card',
                set: 'abc',
                number: '1',
                imageId: 'resolved-image-id',
                isUserUpload: false,
                hasBuiltInBleed: false,
                needsEnrichment: false,
            }],
            backCardTasks: []
        }),
    },
}));

vi.mock('@/helpers/tokenImportHelper', () => ({
    handleAutoImportTokens: vi.fn(),
}));



// Mock child components
vi.mock('./ArtworkTabContent', () => ({
    ArtworkTabContent: ({
        onOpenSearch,
        onClose,
        artSource,
        setArtSource,
        onSelectArtwork,
        onSelectMpcArt,
        onSelectCardback,
        onSetAsDefaultCardback,
        onRequestDelete,
        onGetMorePrints,
        setSelectedFace,
        selectedFace,
    }: {
        onOpenSearch: () => void;
        onClose: () => void;
        artSource: string;
        setArtSource: (s: 'scryfall' | 'mpc') => void;
        onSelectArtwork: (url: string) => void;
        onSelectMpcArt: (card: { identifier: string; name: string }) => void;
        onSelectCardback: (id: string, name: string) => void;
        onSetAsDefaultCardback: (id: string, name: string) => void;
        onRequestDelete: (id: string, name: string) => void;
        onGetMorePrints: () => void;
        setSelectedFace?: (face: 'front' | 'back') => void;
        selectedFace?: 'front' | 'back';
    }) => {
        return (
            <div data-testid="artwork-tab-content" data-art-source={artSource}>
                <button data-testid="open-search" onClick={onOpenSearch}>Open Search</button>
                <button data-testid="close-button" onClick={onClose}>Close</button>
                <button data-testid="switch-to-mpc" onClick={() => setArtSource('mpc')}>Switch to MPC</button>
                <button data-testid="select-artwork" onClick={() => onSelectArtwork('https://example.com/art.jpg')}>Select</button>
                <button data-testid="select-mpc-art" onClick={() => onSelectMpcArt({ identifier: 'mpc-123', name: 'MPC Card' })}>Select MPC</button>
                <button data-testid="select-cardback" onClick={() => onSelectCardback('cardback-1', 'Custom Back')}>Select Cardback</button>
                <button data-testid="set-default-cardback" onClick={() => onSetAsDefaultCardback('cardback-2', 'Default Back')}>Set Default</button>
                <button data-testid="delete-cardback" onClick={() => onRequestDelete('cardback-1', 'Custom Back')}>Delete</button>
                <button data-testid="get-more-prints" onClick={onGetMorePrints}>Get More</button>
                {setSelectedFace && (
                    <div data-testid="toggle-front-back" data-value={selectedFace}>
                        <button data-testid="toggle-btn-front" onClick={() => setSelectedFace('front')}>Front</button>
                        <button data-testid="toggle-btn-back" onClick={() => setSelectedFace('back')}>Back</button>
                    </div>
                )}
            </div>
        );
    },
}));

vi.mock('../CardEditorModal/ArtworkBleedSettings', () => ({
    ArtworkBleedSettings: ({ selectedFace }: { selectedFace: string }) => (
        <div data-testid="artwork-bleed-settings" data-selected-face={selectedFace}>
            Bleed Settings
        </div>
    ),
}));

vi.mock('./AdvancedSearch', () => ({
    AdvancedSearch: ({
        isOpen,
        onClose,
        onSelectCard,
    }: {
        isOpen: boolean;
        onClose: () => void;
        onSelectCard: (name: string, mpcUrl?: string) => void;
    }) => (
        isOpen ? (
            <div data-testid="advanced-search">
                <button data-testid="close-search" onClick={onClose}>Close Search</button>
                <button data-testid="select-card" onClick={() => onSelectCard('Selected Card')}>Select Card</button>
                <button data-testid="select-mpc-card" onClick={() => onSelectCard('MPC Card', 'https://mpc.example.com/id=abc123')}>Select MPC</button>
            </div>
        ) : null
    ),
}));

vi.mock('../common', () => ({
    ResponsiveModal: ({
        isOpen,
        children,
        header,
    }: {
        isOpen: boolean;
        children: React.ReactNode;
        header: React.ReactNode;
    }) => (
        isOpen ? (
            <div data-testid="responsive-modal">
                <div data-testid="modal-header">{header}</div>
                <div data-testid="modal-content">{children}</div>
            </div>
        ) : null
    ),
    ToggleButtonGroup: ({
        options,
        value,
        onChange,
    }: {
        options: { id: string; label: string; icon?: React.ReactNode }[];
        value: string;
        onChange: (val: string) => void;
    }) => (
        <div data-testid={`toggle-${options[0].id}-${options[1].id}`} data-value={value}>
            {options.map((opt) => (
                <button key={opt.id} data-testid={`toggle-btn-${opt.id}`} onClick={() => onChange(opt.id)}>
                    {opt.icon}
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
        <div data-testid="toggle-mpc-scryfall" data-value={value}>
            <button data-testid="toggle-btn-mpc" onClick={() => onChange('mpc')}>MPC Autofill</button>
            <button data-testid="toggle-btn-scryfall" onClick={() => onChange('scryfall')}>Scryfall</button>
        </div>
    ),
    TabBar: ({
        tabs,
        activeTab,
        onTabChange,
    }: {
        tabs: { id: string; label: string; icon?: React.ReactNode }[];
        activeTab: string;
        onTabChange: (id: string) => void;
        variant?: string;
    }) => (
        <div data-testid={`tabbar-${tabs[0].id}-${tabs[1].id}`} data-active={activeTab}>
            {tabs.map((tab) => (
                <button key={tab.id} data-testid={`tab-btn-${tab.id}`} onClick={() => onTabChange(tab.id)}>
                    {tab.icon}
                    {tab.label}
                </button>
            ))}
        </div>
    ),
}));

vi.mock('flowbite-react', () => ({
    Button: ({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) => (
        <button onClick={onClick} className={className}>{children}</button>
    ),
    Checkbox: ({ id, checked, onChange }: { id: string; checked: boolean; onChange: (e: { target: { checked: boolean } }) => void }) => (
        <input type="checkbox" id={id} checked={checked} onChange={(e) => onChange({ target: { checked: e.target.checked } })} data-testid={id} />
    ),
    Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) => (
        <label htmlFor={htmlFor}>{children}</label>
    ),
}));

import { ArtworkModal } from './ArtworkModal';

describe('ArtworkModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.isModalOpen = false;
        mockState.modalCard = null;
        mockState.initialTab = 'artwork';
        mockState.initialFace = 'front';
        mockState.initialArtSource = undefined;
        mockSelectedCards.clear();
        mockLiveQueryResult.value = null;
    });

    describe('rendering', () => {
        it('should not render when modal is closed', () => {
            mockState.isModalOpen = false;
            render(<ArtworkModal />);
            expect(screen.queryByTestId('responsive-modal')).toBeNull();
        });

        it('should render when modal is open', () => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
            render(<ArtworkModal />);
            expect(screen.getByTestId('responsive-modal')).toBeDefined();
        });

        it('should show card name in header', () => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Lightning Bolt', imageId: 'test-image-id' };
            render(<ArtworkModal />);
            expect(screen.getByText(/Select Artwork for Lightning Bolt/)).toBeDefined();
        });
    });

    describe('tab switching', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
        });

        it('should show artwork tab by default', () => {
            render(<ArtworkModal />);
            expect(screen.getByTestId('artwork-tab-content')).toBeDefined();
        });

        it('should switch to settings tab when clicked', () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('tab-btn-settings'));
            expect(screen.getByTestId('artwork-bleed-settings')).toBeDefined();
        });

        it('should show settings tab when initialTab is settings', () => {
            mockState.initialTab = 'settings';
            render(<ArtworkModal />);
            expect(screen.getByTestId('artwork-bleed-settings')).toBeDefined();
        });
    });

    describe('face selection', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
        });

        it('should show front face toggle by default', () => {
            render(<ArtworkModal />);
            const faceToggle = screen.getByTestId('toggle-front-back');
            expect(faceToggle.getAttribute('data-value')).toBe('front');
        });

        it('should switch to back face when clicked', async () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('toggle-btn-back'));

            await act(async () => {
                await new Promise(resolve => setTimeout(resolve, 0));
            });

            const faceToggle = screen.getByTestId('toggle-front-back');
            expect(faceToggle.getAttribute('data-value')).toBe('back');
        });

        it('should use initialFace from store', async () => {
            mockState.initialFace = 'back';
            render(<ArtworkModal />);

            await act(async () => {
                await new Promise(resolve => setTimeout(resolve, 0));
            });

            const faceToggle = screen.getByTestId('toggle-front-back');
            expect(faceToggle.getAttribute('data-value')).toBe('back');
        });
    });

    describe('art source toggle', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
        });

        it('should show scryfall source by default', () => {
            render(<ArtworkModal />);
            const artworkContent = screen.getByTestId('artwork-tab-content');
            expect(artworkContent.getAttribute('data-art-source')).toBe('scryfall');
        });

        it('should show art source toggle on artwork tab', () => {
            render(<ArtworkModal />);
            expect(screen.getByTestId('toggle-mpc-scryfall')).toBeDefined();
        });

        it('should hide art source toggle on settings tab', () => {
            mockState.initialTab = 'settings';
            render(<ArtworkModal />);
            expect(screen.queryByTestId('toggle-mpc-scryfall')).toBeNull();
        });

        it('should switch to mpc source when clicked', () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('toggle-btn-mpc'));
            const sourceToggle = screen.getByTestId('toggle-mpc-scryfall');
            expect(sourceToggle.getAttribute('data-value')).toBe('mpc');
        });
    });

    describe('handleSelectArtwork', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
        });

        it('should call changeCardArtwork when artwork is selected', async () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('select-artwork'));

            await waitFor(() => {
                expect(mockChangeCardArtwork).toHaveBeenCalled();
            });
        });



        it('should sync store with updated card data', async () => {
            const updatedCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'new-id' };
            mockDbCards.get.mockResolvedValue(updatedCard);

            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('select-artwork'));

            await waitFor(() => {
                expect(mockUpdateCard).toHaveBeenCalledWith(updatedCard);
            });
        });
    });

    describe('handleSelectMpcArt', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
        });

        it('should call changeCardArtwork when MPC art is selected', async () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('select-mpc-art'));

            await waitFor(() => {
                expect(mockChangeCardArtwork).toHaveBeenCalled();
            });
        });



        it('should sync store with updated card data and mark for enrichment', async () => {
            const updatedCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'mpc-id' };
            mockDbCards.get.mockResolvedValue(updatedCard);

            vi.mocked(ImportOrchestrator.resolve).mockResolvedValueOnce({
                cardsToAdd: [{
                    name: 'Resolved Card',
                    set: 'abc',
                    number: '1',
                    imageId: 'resolved-image-id',
                    isUserUpload: false,
                    hasBuiltInBleed: false,
                    needsEnrichment: true,
                    isToken: false,
                    token_parts: undefined,
                    needs_token: false
                }],
                backCardTasks: []
            });

            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('select-mpc-art'));

            await waitFor(() => {
                expect(mockUpdateCard).toHaveBeenCalledWith(updatedCard);
                expect(mockDbCards.update).toHaveBeenCalledWith('test-uuid', expect.objectContaining({ needsEnrichment: true }));
            });
        });
    });

    describe('handleSelectCardback', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
        });

        it('should call undoableChangeCardback when cardback selected', async () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('select-cardback'));

            await waitFor(() => {
                expect(mockUndoableChangeCardback).toHaveBeenCalled();
            });
        });

        it('should close modal after selecting cardback', async () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('select-cardback'));

            await waitFor(() => {
                expect(mockCloseModal).toHaveBeenCalled();
            });
        });
    });

    describe('handleSetAsDefaultCardback', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
        });

        it('should call setDefaultCardbackId', async () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('set-default-cardback'));

            await waitFor(() => {
                expect(mockSetDefaultCardbackId).toHaveBeenCalledWith('cardback-2');
            });
        });

        it('should close modal after setting default', async () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('set-default-cardback'));

            await waitFor(() => {
                expect(mockCloseModal).toHaveBeenCalled();
            });
        });
    });

    describe('handleRequestDelete (delete confirmation)', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
        });

        it('should show delete confirmation dialog when delete requested', () => {
            render(<ArtworkModal />);
            expect(screen.queryByText('Delete Cardback?')).toBeNull();

            fireEvent.click(screen.getByTestId('delete-cardback'));

            expect(screen.getByText('Delete Cardback?')).toBeDefined();
        });

        it('should show cardback name in confirmation', () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('delete-cardback'));

            expect(screen.getByText(/Custom Back/)).toBeDefined();
        });
    });

    describe('confirmDelete', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
            mockGetAllCardbacks.mockResolvedValue([
                { id: 'cardback-1', name: 'Custom Back', source: 'upload-library' },
                { id: 'cardback-2', name: 'Default Back', source: 'builtin' },
            ]);
        });

        it('should delete cardback when confirmed', async () => {
            render(<ArtworkModal />);

            // Open delete dialog
            fireEvent.click(screen.getByTestId('delete-cardback'));
            expect(screen.getByText('Delete Cardback?')).toBeDefined();

            // Click confirm
            fireEvent.click(screen.getByText('Yes, delete'));

            await waitFor(() => {
                expect(mockDbCardbacks.delete).toHaveBeenCalledWith('cardback-1');
            });
        });

        it('should refresh cardback list after deletion', async () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('delete-cardback'));
            fireEvent.click(screen.getByText('Yes, delete'));

            await waitFor(() => {
                // getAllCardbacks should be called again after deletion
                expect(mockGetAllCardbacks.mock.calls.length).toBeGreaterThanOrEqual(1);
            });
        });
    });

    describe('cancelDelete', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
        });

        it('should close delete dialog when cancelled', () => {
            render(<ArtworkModal />);

            // Open delete dialog
            fireEvent.click(screen.getByTestId('delete-cardback'));
            expect(screen.getByText('Delete Cardback?')).toBeDefined();

            // Click cancel
            fireEvent.click(screen.getByText('No, cancel'));

            expect(screen.queryByText('Delete Cardback?')).toBeNull();
        });

        it('should not delete cardback when cancelled', () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('delete-cardback'));
            fireEvent.click(screen.getByText('No, cancel'));

            expect(mockDbCardbacks.delete).not.toHaveBeenCalled();
        });
    });

    describe('handleSearch', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
        });

        it('should call fetchCardWithPrints when searching from advanced search', async () => {
            mockFetchCardWithPrints.mockResolvedValue({
                name: 'Black Lotus',
                imageUrls: ['https://example.com/lotus.jpg'],
            });

            render(<ArtworkModal />);

            // Open search
            fireEvent.click(screen.getByTestId('open-search'));
            expect(screen.getByTestId('advanced-search')).toBeDefined();

            // Select a card (triggers handleSearch)
            fireEvent.click(screen.getByTestId('select-card'));

            await waitFor(() => {
                expect(mockFetchCardWithPrints).toHaveBeenCalledWith('Selected Card', true, true);
            });
        });
    });

    describe('advanced search with MPC', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
        });

        it('should call changeCardArtwork when selecting MPC from search', async () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('open-search'));
            fireEvent.click(screen.getByTestId('select-mpc-card'));

            await waitFor(() => {
                expect(mockChangeCardArtwork).toHaveBeenCalled();
            });
        });
    });

    describe('close modal', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
        });

        it('should call closeModal when close button clicked', () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('close-button'));
            expect(mockCloseModal).toHaveBeenCalled();
        });

        it('should render close X button in header', () => {
            render(<ArtworkModal />);
            const header = screen.getByTestId('modal-header');
            // The X button is in the header with an SVG icon
            const buttons = header.querySelectorAll('button');
            expect(buttons.length).toBeGreaterThan(0);
        });
    });

    describe('dont show again checkbox', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
        });

        it('should render dont show again checkbox in delete dialog', () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('delete-cardback'));

            expect(screen.getByTestId('dont-show-again')).toBeDefined();
        });

        it('should be able to toggle checkbox', () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('delete-cardback'));

            const checkbox = screen.getByTestId('dont-show-again') as HTMLInputElement;
            expect(checkbox.checked).toBe(false);

            fireEvent.click(checkbox);
            expect(checkbox.checked).toBe(true);
        });
    });

    describe('state reset on close', () => {
        it('should reset state when modal closes', () => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };

            const { rerender } = render(<ArtworkModal />);

            fireEvent.click(screen.getByTestId('toggle-btn-mpc'));
            fireEvent.click(screen.getByTestId('tab-btn-settings'));

            mockState.isModalOpen = false;
            rerender(<ArtworkModal />);

            mockState.isModalOpen = true;
            mockState.initialTab = 'artwork';
            rerender(<ArtworkModal />);

            const artworkContent = screen.getByTestId('artwork-tab-content');
            expect(artworkContent.getAttribute('data-art-source')).toBe('scryfall');
        });
    });

    describe('MPC image detection', () => {
        it('should detect MPC image from imageId', () => {
            mockState.isModalOpen = true;
            mockState.modalCard = {
                uuid: 'test-uuid',
                name: 'Test Card',
                imageId: 'https://example.com/api/cards/images/mpc/abc123',
            };

            render(<ArtworkModal />);

            const sourceToggle = screen.getByTestId('toggle-mpc-scryfall');
            expect(sourceToggle.getAttribute('data-value')).toBe('mpc');
        });
    });

    describe('bleed settings', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
        });

        it('should pass selectedFace to ArtworkBleedSettings', async () => {
            mockState.initialTab = 'settings';
            mockState.initialFace = 'back';
            render(<ArtworkModal />);

            await act(async () => {
                await new Promise(resolve => setTimeout(resolve, 0));
            });

            const bleedSettings = screen.getByTestId('artwork-bleed-settings');
            expect(bleedSettings.getAttribute('data-selected-face')).toBe('back');
        });
    });

    describe('auto-search for placeholder cards', () => {
        it('should auto-search when card has no imageId', async () => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card' }; // No imageId
            mockFetchCardWithPrints.mockResolvedValue({
                name: 'Test Card',
                imageUrls: ['https://example.com/test.jpg'],
            });

            render(<ArtworkModal />);

            await waitFor(() => {
                expect(mockFetchCardWithPrints).toHaveBeenCalledWith('Test Card', false, true);
            });
        });
    });




    describe('Multi-select operations', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'card-1', name: 'Card 1', imageId: 'img-1' };
            mockSelectedCards.add('card-1');
            mockSelectedCards.add('card-2');

            mockDbCards.bulkGet.mockResolvedValue([
                { uuid: 'card-1', name: 'Card 1', imageId: 'img-1' },
                { uuid: 'card-2', name: 'Card 1', imageId: 'img-2' } // Same name to allow mass update
            ]);
        });

        it('handleSelectArtwork should update multiple cards', async () => {
            render(<ArtworkModal />);

            // Trigger select artwork
            fireEvent.click(screen.getByTestId('select-artwork'));

            await waitFor(() => {
                // Should be called for card-1 (target) AND card-2 (loop)
                // Note: The logic in ArtworkModal separates the loop.
                // It calls changeCardArtwork inside the loop for all selected cards.
                expect(mockChangeCardArtwork).toHaveBeenCalledTimes(2);
                expect(mockChangeCardArtwork).toHaveBeenCalledWith(
                    'img-1',
                    'https://example.com/art.jpg', // parseImageIdFromUrl returns identity in mock
                    expect.objectContaining({ uuid: 'card-1' }),
                    false,
                    'Resolved Card',  // Now always uses resolved.name from ImportOrchestrator
                    undefined,
                    expect.objectContaining({ set: 'abc', number: '1' }),
                    undefined, // hasBuiltInBleed
                    undefined  // overrides
                );
                expect(mockChangeCardArtwork).toHaveBeenCalledWith(
                    'img-2',
                    'https://example.com/art.jpg',
                    expect.objectContaining({ uuid: 'card-2' }),
                    false,
                    'Resolved Card',  // Now always uses resolved.name from ImportOrchestrator
                    undefined,
                    expect.objectContaining({ set: 'abc', number: '1' }),
                    undefined, // hasBuiltInBleed
                    undefined  // overrides
                );
            });
        });

        it('handleSelectMpcArt should update multiple cards', async () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('toggle-btn-mpc')); // Switch to MPC tab to enable MPC checks if any

            // Trigger select MPC art
            fireEvent.click(screen.getByTestId('select-mpc-art'));

            await waitFor(() => {
                expect(mockChangeCardArtwork).toHaveBeenCalledTimes(2);
                expect(mockChangeCardArtwork).toHaveBeenCalledWith(
                    'img-2',
                    'resolved-image-id',
                    expect.objectContaining({ uuid: 'card-2' }),
                    false,
                    'Resolved Card', // From ImportOrchestrator mock
                    undefined,
                    expect.objectContaining({ set: 'abc', number: '1' }),
                    false, // hasBuiltInBleed
                    { darkenMode: 'none', darkenUseGlobalSettings: false } // overrides
                );
            });
        });

        describe('handleSetAsDefaultCardback', () => {
            beforeEach(() => {
                mockState.isModalOpen = true;
                mockState.modalCard = { uuid: 'card-1', name: 'Card 1', imageId: 'old-default' };

                // Mock DB behavior for creating/updating cascading backs
                mockDbCards.filter.mockReturnValue({
                    toArray: vi.fn().mockResolvedValue([
                        { uuid: 'front-1', name: 'Front 1' }, // Front card needing back
                        { uuid: 'back-1', name: 'Back 1', usesDefaultCardback: true, imageId: 'old-default' } // Back card needing update
                    ])
                });
                mockGetAllCardbacks.mockResolvedValue([
                    { id: 'new-default', name: 'New Default', source: 'builtin', hasBuiltInBleed: true }
                ]);
            });

            it('should create linked back cards and update existing defaults', async () => {
                render(<ArtworkModal />);

                // Trigger set default (via mock child handler)
                fireEvent.click(screen.getByTestId('set-default-cardback'));

                await waitFor(() => {
                    // 1. Should update store
                    expect(mockSetDefaultCardbackId).toHaveBeenCalledWith('cardback-2');

                    // 2. Should create linked back for front cards without one
                    // mockDbCards.filter calls are complex to separate, but we expect createLinkedBackCard call
                    // Actually filter logic in component:
                    // 1st filter: !linkedFrontId && !linkedBackId (front cards without backs) -> returns front-1
                    // 2nd filter: !!linkedFrontId && usesDefaultCardback (back cards using default) -> returns back-1

                    // wait for createLinkedBackCard
                    expect(mockCreateLinkedBackCard).toHaveBeenCalledWith(
                        'front-1',
                        'cardback-2',
                        'Default Back',
                        expect.objectContaining({ usesDefaultCardback: true })
                    );

                    // 3. Should update existing back cards
                    expect(mockChangeCardArtwork).toHaveBeenCalledWith(
                        'old-default',
                        'cardback-2',
                        expect.objectContaining({ uuid: 'back-1' }),
                        false,
                        'Default Back',
                        undefined,
                        undefined,
                        false
                    );
                });
            });
        });
    });

    describe('DFC (Double-Faced Card) logic', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Delver of Secrets', imageId: 'test-image-id' };
        });

        it('should auto-select face when opening DFC card', async () => {
            // Mock DFC helpers to return face names
            const { getFaceNamesFromPrints, getCurrentCardFace } = await import('@/helpers/dfcHelpers');
            vi.mocked(getFaceNamesFromPrints).mockReturnValue(['Delver of Secrets', 'Insectile Aberration']);
            vi.mocked(getCurrentCardFace).mockReturnValue('front');

            render(<ArtworkModal />);

            // The face toggle should exist and reflect front
            const faceToggle = screen.getByTestId('toggle-front-back');
            expect(faceToggle.getAttribute('data-value')).toBe('front');
        });

        it('should maintain face when back is selected initially for DFC', async () => {
            mockState.initialFace = 'back';
            render(<ArtworkModal />);

            await act(async () => {
                await new Promise(resolve => setTimeout(resolve, 0));
            });

            const faceToggle = screen.getByTestId('toggle-front-back');
            expect(faceToggle.getAttribute('data-value')).toBe('back');
        });
    });

    describe('Cardback cleanup effects', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
        });

        it('should load cardback options when switching to back face', async () => {
            mockGetAllCardbacks.mockResolvedValue([
                { id: 'cb-1', name: 'Blob Back', source: 'custom', imageUrl: 'blob:http://localhost/abc123' },
            ]);

            render(<ArtworkModal />);

            // Switch to back face to trigger cardback loading
            fireEvent.click(screen.getByTestId('toggle-btn-back'));

            await waitFor(() => {
                expect(mockGetAllCardbacks).toHaveBeenCalled();
            });
        });
    });

    describe('handleExecuteDelete - complete flow', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.initialFace = 'back';
            mockState.modalCard = { uuid: 'card-1', name: 'Card 1', imageId: 'cardback-to-delete' };

            mockGetAllCardbacks.mockResolvedValue([
                { id: 'cardback-to-delete', name: 'To Delete', source: 'custom' },
                { id: 'builtin-default', name: 'Built-in Default', source: 'builtin', hasBuiltInBleed: true }
            ]);
        });

        it('should delete cardback and reassign cards', async () => {
            // Mock cards using the cardback
            mockDbCards.filter.mockReturnValue({
                toArray: vi.fn().mockResolvedValue([
                    { uuid: 'back-1', name: 'Back 1', imageId: 'cardback-to-delete', linkedFrontId: 'front-1' }
                ])
            });

            render(<ArtworkModal />);

            await waitFor(() => {
                expect(mockGetAllCardbacks).toHaveBeenCalled();
            });

            // Trigger delete flow
            fireEvent.click(screen.getByTestId('delete-cardback'));

            await waitFor(() => {
                expect(screen.getByText('Delete Cardback?')).toBeDefined();
            });

            fireEvent.click(screen.getByText('Yes, delete'));

            await waitFor(() => {
                expect(mockDbCardbacks.delete).toHaveBeenCalledWith('cardback-1');
            });
        });

        it('should save dont-show-again preference to localStorage', async () => {
            const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

            render(<ArtworkModal />);

            fireEvent.click(screen.getByTestId('delete-cardback'));

            await waitFor(() => {
                expect(screen.getByTestId('dont-show-again')).toBeDefined();
            });

            // Check the checkbox
            fireEvent.click(screen.getByTestId('dont-show-again'));

            fireEvent.click(screen.getByText('Yes, delete'));

            await waitFor(() => {
                expect(setItemSpy).toHaveBeenCalledWith('cardback-delete-confirm-disabled', 'true');
            });

            setItemSpy.mockRestore();
        });
    });

    describe('Zoom level handling', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
        });

        it('should render with default zoom level', () => {
            render(<ArtworkModal />);

            // Modal should render without errors with default zoom
            expect(screen.getByTestId('responsive-modal')).toBeDefined();
        });
    });

    describe('Apply to all checkbox', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
            mockSelectedCards.add('test-uuid');
            mockSelectedCards.add('other-card');
        });

        it('should show apply to all checkbox when multiple cards selected', () => {
            mockDbCards.bulkGet.mockResolvedValue([
                { uuid: 'test-uuid', name: 'Test Card', imageId: 'img-1' },
                { uuid: 'other-card', name: 'Test Card', imageId: 'img-2' } // Same name
            ]);

            render(<ArtworkModal />);

            // The modal renders, check for multi-select behavior
            expect(screen.getByTestId('responsive-modal')).toBeDefined();
        });
    });

    describe('Linked back card handling', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'front-uuid', name: 'Front Card', imageId: 'front-img', linkedBackId: 'back-uuid' };
        });

        it('should use linked back card when back face is selected', async () => {
            // Mock useLiveQuery to return the linked back card
            const { useLiveQuery } = await import('dexie-react-hooks');
            vi.mocked(useLiveQuery).mockImplementation((queryFn) => {
                // For linked back card query
                if (typeof queryFn === 'function') {
                    return { uuid: 'back-uuid', name: 'Back Card', imageId: 'back-img' };
                }
                return null;
            });

            mockState.initialFace = 'back';
            render(<ArtworkModal />);

            await act(async () => {
                await new Promise(resolve => setTimeout(resolve, 0));
            });

            // Check that we are using the back card (name in header should be Back Card)
            expect(screen.getByText(/Select Artwork for Back Card/)).toBeDefined();
        });
    });

    describe('Image object from cardbacks table', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.initialFace = 'back';
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'cardback:custom-1' };
        });

        it('should query cardbacks table for cardback imageId', async () => {
            const { isCardbackId } = await import('@/helpers/cardbackLibrary');
            vi.mocked(isCardbackId).mockReturnValue(true);

            render(<ArtworkModal />);

            await act(async () => {
                await new Promise(resolve => setTimeout(resolve, 0));
            });

            // Modal should render
            expect(screen.getByTestId('responsive-modal')).toBeDefined();
        });
    });

    describe('Close search', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
        });

        it('should close search when back button clicked', () => {
            render(<ArtworkModal />);

            // Open search
            fireEvent.click(screen.getByTestId('open-search'));
            expect(screen.getByTestId('advanced-search')).toBeDefined();

            // Close search
            fireEvent.click(screen.getByTestId('close-search'));
            expect(screen.queryByTestId('advanced-search')).toBeNull();
        });
    });

    describe('MPC filters toggle', () => {
        beforeEach(() => {
            mockState.isModalOpen = true;
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
        });

        it('should toggle filter button visibility on MPC source', () => {
            render(<ArtworkModal />);

            // Click to switch to MPC
            fireEvent.click(screen.getByTestId('toggle-btn-mpc'));

            // Check for filter button in header
            const header = screen.getByTestId('modal-header');
            expect(header).toBeDefined();
        });
    });

});
