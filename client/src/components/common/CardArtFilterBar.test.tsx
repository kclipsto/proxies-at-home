
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CardArtFilterBar } from './CardArtFilterBar';
import type { CardArtFilterBarProps, ScryfallFilterProps } from './CardArtFilterBar';
import type { MpcAutofillCard } from '@/helpers/mpcAutofillApi';
import type { ScryfallSet } from '../../../../shared/types';
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
});
