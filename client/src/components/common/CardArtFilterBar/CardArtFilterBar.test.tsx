
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CardArtFilterBar } from './CardArtFilterBar';
import type { UploadLibraryItem } from '@/helpers/uploadLibrary';
import type { CardArtFilterBarProps, ScryfallFilterProps } from './CardArtFilterBar';
import type { MpcAutofillCard } from '@/helpers/mpcAutofillApi';
import type { ScryfallSet } from '../../../../../shared/types';
import { useUserPreferencesStore } from '@/store';
import { fetchScryfallSets } from '@/helpers/scryfallApi';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/store', () => ({
    useSettingsStore: vi.fn(() => false), // mpcFuzzySearch default
    useUserPreferencesStore: vi.fn(),
}));

vi.mock('@/helpers/scryfallApi', () => ({
    fetchScryfallSets: vi.fn(() => Promise.resolve([])),
}));

// Mock SelectDropdown to simplify testing and avoid portal/listener issues
vi.mock('./SelectDropdown', () => ({
    SelectDropdown: ({ label, buttonText, onToggle, isOpen, children }: { label?: string; buttonText: string; onToggle: () => void; isOpen: boolean; children: React.ReactNode }) => (
        <div>
            <button onClick={onToggle}>
                {label && <span>{label}</span>}
                <span>{buttonText}</span>
            </button>
            {isOpen && <div data-testid="dropdown-content">{children}</div>}
        </div>
    ),
    // Export MultiSelectDropdown as the same mock if it's just an alias
    MultiSelectDropdown: ({ label, buttonText, onToggle, isOpen, children }: { label?: string; buttonText: string; onToggle: () => void; isOpen: boolean; children: React.ReactNode }) => (
        <div>
            <button onClick={onToggle}>
                {label && <span>{label}</span>}
                <span>{buttonText}</span>
            </button>
            {isOpen && <div data-testid="dropdown-content">{children}</div>}
        </div>
    ),
}));

describe('CardArtFilterBar', () => {
    const mockToggleFavoriteScryfallSet = vi.fn();
    const mockToggleFavoriteMpcSource = vi.fn();
    const mockToggleFavoriteMpcTag = vi.fn();
    const mockSetFavoriteMpcDpi = vi.fn();
    const mockSetFavoriteMpcSort = vi.fn();
    const mockSetFavoriteScryfallSort = vi.fn();

    const mockStoreState = {
        preferences: {
            favoriteMpcSources: [],
            favoriteMpcTags: [],
            favoriteScryfallSets: [],
            favoriteMpcDpi: null,
            favoriteMpcSort: null,
            favoriteScryfallSort: null,
        },
        toggleFavoriteScryfallSet: mockToggleFavoriteScryfallSet,
        toggleFavoriteMpcSource: mockToggleFavoriteMpcSource,
        toggleFavoriteMpcTag: mockToggleFavoriteMpcTag,
        setFavoriteMpcDpi: mockSetFavoriteMpcDpi,
        setFavoriteMpcSort: mockSetFavoriteMpcSort,
        setFavoriteScryfallSort: mockSetFavoriteScryfallSort,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useUserPreferencesStore).mockImplementation((selector: unknown) => {
            return typeof selector === 'function' ? selector(mockStoreState) : mockStoreState;
        });
    });

    describe('Scryfall Mode', () => {
        const defaultProps: CardArtFilterBarProps = {
            mode: 'scryfall',
            availableSets: new Set(['LEA', 'LEB']),
            selectedSets: new Set(),
            onSelectSet: vi.fn(),
            sortBy: 'released',
            setSortBy: vi.fn(),
            sortDir: 'desc',
            setSortDir: vi.fn(),
            groupBySet: false,
            onToggleGroupBySet: vi.fn(),
            collapsedSets: new Set(),
            setCollapsedSets: vi.fn(),
            allSetsCollapsed: false,
            setAllSetsCollapsed: vi.fn(),
            searchMode: 'prints',
            setSearchMode: vi.fn(),
        };

        it('renders Scryfall filter controls', async () => {
            vi.mocked(fetchScryfallSets).mockResolvedValue([
                { code: 'LEA', name: 'Alpha', released_at: '1993-08-05' } as unknown as ScryfallSet,
                { code: 'LEB', name: 'Beta', released_at: '1993-10-04' } as unknown as ScryfallSet,
            ]);

            render(<CardArtFilterBar {...defaultProps} />);

            // Wait for sets to load
            await waitFor(() => {
                expect(fetchScryfallSets).toHaveBeenCalled();
            });

            // Check for Sort Dropdown label (default released)
            expect(screen.getByText('Release Date')).toBeInTheDocument();

            // Check for Set Dropdown button
            expect(screen.getByText('Set')).toBeInTheDocument();

            // Open Sort dropdown
            fireEvent.click(screen.getByText('Release Date'));
            expect(screen.getByText('Set Name')).toBeInTheDocument();
        });

        it('loads and displays sets', async () => {
            vi.mocked(fetchScryfallSets).mockResolvedValue([
                { code: 'LEA', name: 'Alpha', released_at: '1993-08-05' } as unknown as ScryfallSet,
                { code: 'LEB', name: 'Beta', released_at: '1993-10-04' } as unknown as ScryfallSet,
            ]);

            render(<CardArtFilterBar {...defaultProps} />);

            await waitFor(() => {
                expect(fetchScryfallSets).toHaveBeenCalled();
            });

            // Open Set dropdown
            const setButton = screen.getByText('Set').closest('button');
            fireEvent.click(setButton!);

            await waitFor(() => {
                expect(screen.getByText('Alpha')).toBeInTheDocument();
                expect(screen.getByText('Beta')).toBeInTheDocument();
            });
        });

        it('handles set selection', async () => {
            vi.mocked(fetchScryfallSets).mockResolvedValue([
                { code: 'LEA', name: 'Alpha', released_at: '1993-08-05' } as unknown as ScryfallSet,
            ]);

            render(<CardArtFilterBar {...defaultProps} />);

            await waitFor(() => {
                expect(fetchScryfallSets).toHaveBeenCalled();
            });

            // Open Set dropdown
            const setButton = screen.getByText('Set').closest('button');
            fireEvent.click(setButton!);

            await waitFor(() => screen.getByText('Alpha'));

            // Click Alpha checkbox
            const alphaOption = screen.getByText('Alpha');
            fireEvent.click(alphaOption); // Clicking label triggers checkbox change in our component structure usually

            expect((defaultProps as ScryfallFilterProps).onSelectSet).toHaveBeenCalledWith(new Set(['LEA']));
        });
    });

    describe('MPC Mode', () => {
        const defaultProps: CardArtFilterBarProps = {
            mode: 'mpc',
            filters: {
                minDpi: 0,
                sourceFilters: new Set(),
                tagFilters: new Set(),
                sortBy: 'dpi',
                sortDir: 'desc',
                fuzzySearch: false
            },
            cards: [
                { id: '1', identifier: '1', name: 'Card 1', sourceName: 'Source A', dpi: 800, tags: ['Tag A'] } as unknown as MpcAutofillCard,
                { id: '2', identifier: '2', name: 'Card 2', sourceName: 'Source B', dpi: 1200, tags: ['Tag B'] } as unknown as MpcAutofillCard,
            ],
            filteredCards: [],
            groupedBySource: null,
            setMinDpi: vi.fn(),
            setSortBy: vi.fn(),
            setSortDir: vi.fn(),
            toggleSource: vi.fn(),
            toggleTag: vi.fn(),
            clearFilters: vi.fn(),
            setSourceFilters: vi.fn(),
            setTagFilters: vi.fn(),
            collapsedSources: new Set(),
            setCollapsedSources: vi.fn(),
            allSourcesCollapsed: false,
            setAllSourcesCollapsed: vi.fn(),
            groupBySource: false,
            onToggleGroupBySource: vi.fn(),
        };

        it('renders MPC filter controls', async () => {
            render(<CardArtFilterBar {...defaultProps} />);
            // Even in MPC mode, some hooks might trigger. Wait for stability or just ensure it renders.
            await waitFor(() => {
                const dpiElements = screen.getAllByText('DPI');
                expect(dpiElements.length).toBeGreaterThan(0);
                expect(dpiElements[0]).toBeInTheDocument();
            });

            expect(screen.getAllByText('DPI')[0]).toBeInTheDocument();
            expect(screen.getByText('Source')).toBeInTheDocument();
            expect(screen.getByText('Tags')).toBeInTheDocument();
            expect(screen.getByText('Sort')).toBeInTheDocument();
        });

        it('shows sources in dropdown', async () => {
            render(<CardArtFilterBar {...defaultProps} />);
            await waitFor(() => {
                expect(screen.getByText('Source')).toBeInTheDocument();
            });

            // Open Source dropdown
            const sourceButton = screen.getByText('Source').closest('button');
            fireEvent.click(sourceButton!);

            expect(screen.getByText('Source A')).toBeInTheDocument();
            expect(screen.getByText('Source B')).toBeInTheDocument();
        });
    });

    describe('Upload Library Mode', () => {
        const defaultProps: CardArtFilterBarProps = {
            mode: 'upload-library',
            uploads: [
                { hash: '1', displayName: 'Custom 1', typeLine: 'Creature', isFavorite: false, createdAt: 1000, imageUrl: '' } as unknown as UploadLibraryItem,
                { hash: '2', displayName: 'Custom 2', typeLine: 'Instant', isFavorite: true, createdAt: 2000, imageUrl: '' } as unknown as UploadLibraryItem,
            ],
            filteredUploads: [],
            sortBy: 'name',
            setSortBy: vi.fn(),
            sortDir: 'asc',
            setSortDir: vi.fn(),
            typeFilter: [],
            setTypeFilter: vi.fn(),
            showFavoritesOnly: false,
            setShowFavoritesOnly: vi.fn(),
            totalCount: 2,
            filteredCount: 2,
            groupByType: false,
            onToggleGroupByType: vi.fn(),
            allTypesCollapsed: false,
            onToggleAllTypesCollapsed: vi.fn(),
        };

        it('renders Upload Library filter controls', () => {
            render(<CardArtFilterBar {...defaultProps} />);

            expect(screen.getByText('Sort')).toBeInTheDocument();
            // Type dropdown might not show if no types are derived, but we passed uploads with types.
            // Wait, we need to ensure getCardTypes is mocked or works. 
            // It's a helper, likely pure function.
            // Let's check if Type dropdown appears.
            // Actually getCardTypes defaults to splitting type line.

            // We expect "Type" button or similar.
            // The component renders MultiSelectDropdown with label "Type".
            expect(screen.getByText('Type')).toBeInTheDocument();
        });

        it('toggles favorites only', () => {
            render(<CardArtFilterBar {...defaultProps} />);
            const starButton = screen.getByTitle('Select all favorites');
            fireEvent.click(starButton);
            expect(defaultProps.setShowFavoritesOnly).toHaveBeenCalledWith(true);
        });

        it('extracts and displays non-standard custom types', async () => {
            const customProps = {
                ...defaultProps,
                uploads: [
                    { ...defaultProps.uploads[0], typeLine: 'MyCustomType' },
                    { ...defaultProps.uploads[1], typeLine: 'AnotherType - Subtype' },
                ]
            };

            render(<CardArtFilterBar {...customProps} />);

            // Should show "Type" label (which implies dropdown is rendered)
            expect(screen.getByText('Type')).toBeInTheDocument();

            // Open dropdown
            const typeButton = screen.getByText('Type').closest('button');
            fireEvent.click(typeButton!);

            // Should see custom types
            await waitFor(() => {
                expect(screen.getByText('MyCustomType')).toBeInTheDocument();
                // For "AnotherType - Subtype", it depends on extraction logic, 
                // but at least "AnotherType" should be there if we fix it.
                // Current strict logic will show NOTHING for these, so the "Type" button probably won't even render if availability is 0.
            });
        });
    });
});
