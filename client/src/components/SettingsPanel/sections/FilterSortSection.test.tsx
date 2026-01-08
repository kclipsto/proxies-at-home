import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock hoisted values
const mockState = vi.hoisted(() => ({
    sortBy: 'manual' as 'manual' | 'name' | 'type' | 'cmc' | 'color',
    sortOrder: 'asc' as 'asc' | 'desc',
    filterManaCost: [] as number[],
    filterColors: [] as string[],
    filterTypes: [] as string[],
    filterCategories: [] as string[],
    filterMatchType: 'partial' as 'partial' | 'exact',
    filterSectionCollapsed: {} as Record<string, boolean>,
}));

const mockSetters = vi.hoisted(() => ({
    setSortBy: vi.fn(),
    setSortOrder: vi.fn(),
    setFilterManaCost: vi.fn(),
    setFilterColors: vi.fn(),
    setFilterTypes: vi.fn(),
    setFilterCategories: vi.fn(),
    setFilterMatchType: vi.fn(),
    setFilterSectionCollapsed: vi.fn(),
}));

vi.mock('@/store/settings', () => ({
    useSettingsStore: vi.fn((selector) => {
        const state = { ...mockState, ...mockSetters };
        return selector(state);
    }),
}));

vi.mock('flowbite-react', () => ({
    Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
    Select: ({ value, onChange, children, className }: { value: string; onChange: (e: { target: { value: string } }) => void; children: React.ReactNode; className?: string }) => (
        <select data-testid="sort-select" value={value} onChange={onChange} className={className}>{children}</select>
    ),
    Button: ({ children, onClick, color, size, className, title }: { children: React.ReactNode; onClick?: () => void; color?: string; size?: string; className?: string; title?: string }) => (
        <button onClick={onClick} data-color={color} data-size={size} className={className} title={title}>{children}</button>
    ),
}));

vi.mock('lucide-react', () => ({
    ArrowDown: () => <span data-testid="arrow-down">↓</span>,
    ArrowUp: () => <span data-testid="arrow-up">↑</span>,
    X: () => <span data-testid="x-icon">×</span>,
    ChevronDown: ({ className }: { className?: string }) => <span data-testid="chevron-down" className={className}>▼</span>,
}));

vi.mock('@/components/common', () => ({
    ManaIcon: ({ symbol, size }: { symbol: string; size: number }) => (
        <span data-testid={`mana-icon-${symbol}`} data-size={size}>{symbol}</span>
    ),
}));

vi.mock('dexie-react-hooks', () => ({
    useLiveQuery: vi.fn(() => [
        { uuid: '1', type_line: 'Creature — Human', category: 'Mainboard' },
        { uuid: '2', type_line: 'Instant', category: 'Commander' },
        { uuid: '3', type_line: 'Artifact', category: null },
        { uuid: '4', type_line: 'Land', linkedFrontId: 'some-id' }, // DFC
    ]),
}));

vi.mock('@/db', () => ({
    db: {
        cards: { toArray: vi.fn() },
    },
}));

vi.mock('@/hooks/useFilteredAndSortedCards', () => ({
    getCardTypes: (typeLine: string | undefined): string[] => {
        if (!typeLine) return [];
        if (typeLine.includes('Creature')) return ['Creature'];
        if (typeLine.includes('Instant')) return ['Instant'];
        if (typeLine.includes('Artifact')) return ['Artifact'];
        if (typeLine.includes('Land')) return ['Land'];
        return [];
    },
}));

import { FilterSortSection } from './FilterSortSection';

describe('FilterSortSection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.sortBy = 'manual';
        mockState.sortOrder = 'asc';
        mockState.filterManaCost = [];
        mockState.filterColors = [];
        mockState.filterTypes = [];
        mockState.filterCategories = [];
        mockState.filterMatchType = 'partial';
        mockState.filterSectionCollapsed = {};
    });

    describe('rendering', () => {
        it('should render Sort By section', () => {
            render(<FilterSortSection />);
            expect(screen.getByText('Sort By')).toBeDefined();
            expect(screen.getByTestId('sort-select')).toBeDefined();
        });

        it('should render Mana Value section', () => {
            render(<FilterSortSection />);
            // Mana Value appears in both sort options and filter section
            expect(screen.getAllByText('Mana Value').length).toBeGreaterThan(0);
        });

        it('should render Colors section', () => {
            render(<FilterSortSection />);
            expect(screen.getByText('Colors')).toBeDefined();
        });

        it('should render Match Type toggle', () => {
            render(<FilterSortSection />);
            expect(screen.getByText('Match Type')).toBeDefined();
            expect(screen.getByText('Partial')).toBeDefined();
            expect(screen.getByText('Exact')).toBeDefined();
        });

        it('should render Card Types when available', () => {
            render(<FilterSortSection />);
            expect(screen.getByText('Card Types')).toBeDefined();
        });

        it('should render Deck Categories when available', () => {
            render(<FilterSortSection />);
            expect(screen.getByText('Deck Categories')).toBeDefined();
        });

        it('should render Dual Faced in Card Types section when DFCs exist', () => {
            render(<FilterSortSection />);
            expect(screen.getByText('Card Types')).toBeDefined();
            expect(screen.getByText('Dual Faced')).toBeDefined();
        });
    });

    describe('sort controls', () => {
        it('should call setSortBy when sort option changes', () => {
            render(<FilterSortSection />);
            const select = screen.getByTestId('sort-select');
            fireEvent.change(select, { target: { value: 'name' } });
            expect(mockSetters.setSortBy).toHaveBeenCalledWith('name');
        });

        it('should toggle sort order when button clicked', () => {
            render(<FilterSortSection />);
            const button = screen.getByTitle('Ascending');
            fireEvent.click(button);
            expect(mockSetters.setSortOrder).toHaveBeenCalledWith('desc');
        });

        it('should show arrow down for ascending order', () => {
            mockState.sortOrder = 'asc';
            render(<FilterSortSection />);
            expect(screen.getByTestId('arrow-down')).toBeDefined();
        });

        it('should show arrow up for descending order', () => {
            mockState.sortOrder = 'desc';
            render(<FilterSortSection />);
            expect(screen.getByTestId('arrow-up')).toBeDefined();
        });
    });

    describe('mana cost filter', () => {
        it('should render mana cost buttons 0-7+', () => {
            render(<FilterSortSection />);
            expect(screen.getByText('0')).toBeDefined();
            expect(screen.getByText('7+')).toBeDefined();
        });

        it('should call setFilterManaCost when mana cost clicked', () => {
            render(<FilterSortSection />);
            fireEvent.click(screen.getByText('3'));
            expect(mockSetters.setFilterManaCost).toHaveBeenCalledWith([3]);
        });

        it('should remove mana cost when already selected', () => {
            mockState.filterManaCost = [3];
            render(<FilterSortSection />);
            fireEvent.click(screen.getByText('3'));
            expect(mockSetters.setFilterManaCost).toHaveBeenCalledWith([]);
        });
    });

    describe('color filter', () => {
        it('should render color mana icons', () => {
            render(<FilterSortSection />);
            expect(screen.getByTestId('mana-icon-W')).toBeDefined();
            expect(screen.getByTestId('mana-icon-U')).toBeDefined();
            expect(screen.getByTestId('mana-icon-B')).toBeDefined();
            expect(screen.getByTestId('mana-icon-R')).toBeDefined();
            expect(screen.getByTestId('mana-icon-G')).toBeDefined();
            expect(screen.getByTestId('mana-icon-C')).toBeDefined();
            expect(screen.getByTestId('mana-icon-M')).toBeDefined();
        });

        it('should call setFilterColors when color clicked', () => {
            render(<FilterSortSection />);
            fireEvent.click(screen.getByTestId('mana-icon-W'));
            expect(mockSetters.setFilterColors).toHaveBeenCalledWith(['W']);
        });
    });

    describe('type filter', () => {
        it('should render available card types', () => {
            render(<FilterSortSection />);
            expect(screen.getByText('Creature')).toBeDefined();
            expect(screen.getByText('Instant')).toBeDefined();
            expect(screen.getByText('Artifact')).toBeDefined();
        });

        it('should call setFilterTypes when type clicked', () => {
            render(<FilterSortSection />);
            fireEvent.click(screen.getByText('Creature'));
            expect(mockSetters.setFilterTypes).toHaveBeenCalledWith(['Creature']);
        });
    });

    describe('category filter', () => {
        it('should render available categories', () => {
            render(<FilterSortSection />);
            expect(screen.getByText('Commander')).toBeDefined();
            expect(screen.getByText('Mainboard')).toBeDefined();
        });

        it('should call setFilterCategories when category clicked', () => {
            render(<FilterSortSection />);
            fireEvent.click(screen.getByText('Commander'));
            expect(mockSetters.setFilterCategories).toHaveBeenCalledWith(['Commander']);
        });
    });

    describe('dual faced filter', () => {
        it('should call setFilterTypes when Dual Faced clicked', () => {
            render(<FilterSortSection />);
            fireEvent.click(screen.getByText('Dual Faced'));
            expect(mockSetters.setFilterTypes).toHaveBeenCalledWith(['Dual Faced']);
        });

        it('should remove Dual Faced type when already selected', () => {
            mockState.filterTypes = ['Dual Faced'];
            render(<FilterSortSection />);
            fireEvent.click(screen.getByText('Dual Faced'));
            expect(mockSetters.setFilterTypes).toHaveBeenCalledWith([]);
        });
    });

    describe('match type toggle', () => {
        it('should call setFilterMatchType for partial', () => {
            mockState.filterMatchType = 'exact';
            render(<FilterSortSection />);
            fireEvent.click(screen.getByText('Partial'));
            expect(mockSetters.setFilterMatchType).toHaveBeenCalledWith('partial');
        });

        it('should call setFilterMatchType for exact', () => {
            mockState.filterMatchType = 'partial';
            render(<FilterSortSection />);
            fireEvent.click(screen.getByText('Exact'));
            expect(mockSetters.setFilterMatchType).toHaveBeenCalledWith('exact');
        });
    });

    describe('clear filters', () => {
        it('should show Clear Filters button when filters active', () => {
            mockState.filterManaCost = [3];
            render(<FilterSortSection />);
            expect(screen.getByText('Clear Filters')).toBeDefined();
        });

        it('should not show Clear Filters when no filters active', () => {
            render(<FilterSortSection />);
            expect(screen.queryByText('Clear Filters')).toBeNull();
        });

        it('should clear all filters when clicked', () => {
            mockState.filterManaCost = [3];
            render(<FilterSortSection />);
            fireEvent.click(screen.getByText('Clear Filters'));
            expect(mockSetters.setFilterManaCost).toHaveBeenCalledWith([]);
            expect(mockSetters.setFilterColors).toHaveBeenCalledWith([]);
            expect(mockSetters.setFilterTypes).toHaveBeenCalledWith([]);
            expect(mockSetters.setFilterCategories).toHaveBeenCalledWith([]);
        });

        it('should clear mana value filter when section clear clicked', () => {
            mockState.filterManaCost = [3];
            render(<FilterSortSection />);
            // Find the X icons that are clear buttons
            const clearButtons = screen.getAllByTestId('x-icon');
            expect(clearButtons.length).toBeGreaterThan(0);
            // Click the first clear button (Mana Value section)
            fireEvent.click(clearButtons[0]);
            expect(mockSetters.setFilterManaCost).toHaveBeenCalledWith([]);
        });

        it('should clear colors filter when section clear clicked', () => {
            mockState.filterColors = ['W'];
            render(<FilterSortSection />);
            const clearButtons = screen.getAllByTestId('x-icon');
            expect(clearButtons.length).toBeGreaterThan(0);
            // The colors clear button is shown when colors have values
            fireEvent.click(clearButtons[0]);
            expect(mockSetters.setFilterColors).toHaveBeenCalledWith([]);
        });

        it('should clear types filter when section clear clicked', () => {
            mockState.filterTypes = ['Creature'];
            render(<FilterSortSection />);
            const clearButtons = screen.getAllByTestId('x-icon');
            // Types section clear button is first when only types has a filter
            fireEvent.click(clearButtons[0]);
            expect(mockSetters.setFilterTypes).toHaveBeenCalledWith([]);
        });

        it('should clear categories filter when section clear clicked', () => {
            mockState.filterCategories = ['Commander'];
            render(<FilterSortSection />);
            const clearButtons = screen.getAllByTestId('x-icon');
            // Categories section clear button
            fireEvent.click(clearButtons[0]);
            expect(mockSetters.setFilterCategories).toHaveBeenCalledWith([]);
        });
    });

    describe('collapsible sections', () => {
        it('should toggle section collapsed state', () => {
            render(<FilterSortSection />);
            // Use getAllByText and click the first match (the section header)
            const manaValueElements = screen.getAllByText('Mana Value');
            fireEvent.click(manaValueElements[manaValueElements.length - 1]);
            expect(mockSetters.setFilterSectionCollapsed).toHaveBeenCalled();
        });
    });
});
