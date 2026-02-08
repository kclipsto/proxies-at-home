
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
    fetchScryfallSets: vi.fn(),
}));

// Mock SelectDropdown and MultiSelectDropdown to simplify testing (avoid complex portal/state logic in unit test)
// But integration testing them is also good. For now, let's keep them real or shallow mock if too complex.
// Let's use real components but mock the icon imports if needed? No, vitest handles svgs usually.
// Actually, SelectDropdown uses portals which can be tricky in some test envs, but normally fine with adequate setup.
// Let's rely on real implementation if possible.

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

        it('renders MPC filter controls', () => {
            render(<CardArtFilterBar {...defaultProps} />);

            expect(screen.getByText('DPI')).toBeInTheDocument();
            expect(screen.getByText('Source')).toBeInTheDocument();
            expect(screen.getByText('Tags')).toBeInTheDocument();
            expect(screen.getByText('Sort')).toBeInTheDocument();
        });

        it('shows sources in dropdown', () => {
            render(<CardArtFilterBar {...defaultProps} />);

            // Open Source dropdown
            const sourceButton = screen.getByText('Source').closest('button');
            fireEvent.click(sourceButton!);

            expect(screen.getByText('Source A')).toBeInTheDocument();
            expect(screen.getByText('Source B')).toBeInTheDocument();
        });
    });
});
