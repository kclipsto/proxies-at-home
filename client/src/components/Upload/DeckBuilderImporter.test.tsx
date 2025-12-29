import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { extractArchidektDeckId, fetchArchidektDeck, extractCardsFromDeck as extractArchidektCards } from '@/helpers/archidektApi';
import { extractMoxfieldDeckId } from '@/helpers/moxfieldApi';

// Mock hoisted values
const mockSetLoadingTask = vi.hoisted(() => vi.fn());
const mockSetLoadingMessage = vi.hoisted(() => vi.fn());
const mockStreamCards = vi.hoisted(() => vi.fn());

vi.mock('flowbite-react', () => ({
    TextInput: ({ value, onChange, placeholder, disabled, color, className }: { value: string; onChange: (e: { target: { value: string } }) => void; placeholder?: string; disabled?: boolean; color?: string; className?: string }) => (
        <input
            data-testid="deck-url-input"
            type="text"
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
            data-color={color}
            className={className}
        />
    ),
}));

vi.mock('@/store', () => ({
    useSettingsStore: vi.fn((selector) => {
        const state = { globalLanguage: 'en' };
        return selector(state);
    }),
}));

vi.mock('@/store/loading', () => ({
    useLoadingStore: vi.fn((selector) => {
        const state = { setLoadingTask: mockSetLoadingTask, setLoadingMessage: mockSetLoadingMessage };
        return selector(state);
    }),
}));

vi.mock('@/helpers/streamCards', () => ({
    streamCards: mockStreamCards,
}));

vi.mock('@/helpers/archidektApi', () => ({
    isArchidektUrl: (url: string) => url.includes('archidekt'),
    extractArchidektDeckId: vi.fn((url: string) => url.includes('archidekt') ? '12345' : null),
    fetchArchidektDeck: vi.fn(() => Promise.resolve({ id: 1, name: 'Test Deck' })),
    extractCardsFromDeck: vi.fn(() => [{ name: 'Sol Ring', set: 'c21', number: '289', quantity: 1, category: 'ramp' }]),
    getDeckSummary: vi.fn(() => ({ name: 'Test Deck', cardCount: 1 })),
}));

vi.mock('@/helpers/moxfieldApi', () => ({
    isMoxfieldUrl: (url: string) => url.includes('moxfield'),
    extractMoxfieldDeckId: vi.fn((url: string) => url.includes('moxfield') ? 'abc123' : null),
    fetchMoxfieldDeck: vi.fn(() => Promise.resolve({ publicId: 'abc', name: 'Moxfield Deck' })),
    extractCardsFromDeck: vi.fn(() => [{ name: 'Lightning Bolt', set: 'leb', number: '163', quantity: 4, category: 'removal' }]),
    getDeckSummary: vi.fn(() => ({ name: 'Moxfield Deck', cardCount: 4 })),
}));

vi.mock('../common', () => ({
    AutoTooltip: ({ mobile, tooltipClassName }: { content: React.ReactNode; mobile?: boolean; tooltipClassName?: string }) => (
        <span data-testid="tooltip" data-mobile={mobile} className={tooltipClassName}>?</span>
    ),
}));

import { DeckBuilderImporter } from './DeckBuilderImporter';

describe('DeckBuilderImporter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockStreamCards.mockResolvedValue(undefined);
    });

    describe('rendering', () => {
        it('should render Import Deck header', () => {
            render(<DeckBuilderImporter />);
            // Header and button both have 'Import Deck' text
            expect(screen.getAllByText('Import Deck').length).toBe(2);
        });

        it('should render URL input', () => {
            render(<DeckBuilderImporter />);
            expect(screen.getByTestId('deck-url-input')).toBeDefined();
            expect(screen.getByPlaceholderText('Paste Archidekt or Moxfield deck URL...')).toBeDefined();
        });

        it('should render Import Deck button', () => {
            render(<DeckBuilderImporter />);
            expect(screen.getByRole('button', { name: /Import Deck/ })).toBeDefined();
        });

        it('should render with mobile styling when mobile prop is true', () => {
            render(<DeckBuilderImporter mobile />);
            // Should still render the heading (may be hidden on landscape)
            expect(screen.getAllByText(/Import/i).length).toBeGreaterThan(0);
        });
    });

    describe('URL validation', () => {
        it('should disable button when URL is empty', () => {
            render(<DeckBuilderImporter />);
            const button = screen.getByRole('button', { name: /Import Deck/ });
            expect(button.hasAttribute('disabled')).toBe(true);
        });

        it('should disable button when URL is not a valid deck URL', () => {
            render(<DeckBuilderImporter />);
            const input = screen.getByTestId('deck-url-input');
            fireEvent.change(input, { target: { value: 'https://google.com' } });
            const button = screen.getByRole('button', { name: /Import Deck/ });
            expect(button.hasAttribute('disabled')).toBe(true);
        });

        it('should enable button for valid Archidekt URL', () => {
            render(<DeckBuilderImporter />);
            const input = screen.getByTestId('deck-url-input');
            fireEvent.change(input, { target: { value: 'https://archidekt.com/decks/12345' } });
            const button = screen.getByRole('button', { name: /Import Deck/ });
            expect(button.hasAttribute('disabled')).toBe(false);
        });

        it('should enable button for valid Moxfield URL', () => {
            render(<DeckBuilderImporter />);
            const input = screen.getByTestId('deck-url-input');
            fireEvent.change(input, { target: { value: 'https://moxfield.com/decks/abc123' } });
            const button = screen.getByRole('button', { name: /Import Deck/ });
            expect(button.hasAttribute('disabled')).toBe(false);
        });
    });

    describe('import flow', () => {
        it('should show Importing... when loading', async () => {
            render(<DeckBuilderImporter />);
            const input = screen.getByTestId('deck-url-input');
            fireEvent.change(input, { target: { value: 'https://archidekt.com/decks/12345' } });
            const button = screen.getByRole('button', { name: /Import Deck/ });

            // Mock a slow response
            mockStreamCards.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

            fireEvent.click(button);

            await waitFor(() => {
                expect(screen.getByText('Importing...')).toBeDefined();
            });
        });

        it('should call setLoadingTask on import', async () => {
            render(<DeckBuilderImporter />);
            const input = screen.getByTestId('deck-url-input');
            fireEvent.change(input, { target: { value: 'https://archidekt.com/decks/12345' } });
            const button = screen.getByRole('button', { name: /Import Deck/ });

            fireEvent.click(button);

            await waitFor(() => {
                expect(mockSetLoadingTask).toHaveBeenCalledWith('Fetching cards');
            });
        });

        it('should call onUploadComplete after successful import', async () => {
            const onUploadComplete = vi.fn();
            render(<DeckBuilderImporter onUploadComplete={onUploadComplete} />);
            const input = screen.getByTestId('deck-url-input');
            fireEvent.change(input, { target: { value: 'https://archidekt.com/decks/12345' } });
            const button = screen.getByRole('button', { name: /Import Deck/ });

            fireEvent.click(button);

            await waitFor(() => {
                expect(onUploadComplete).toHaveBeenCalled();
            });
        });

        it('should clear URL after successful import', async () => {
            render(<DeckBuilderImporter />);
            const input = screen.getByTestId('deck-url-input') as HTMLInputElement;
            fireEvent.change(input, { target: { value: 'https://archidekt.com/decks/12345' } });
            const button = screen.getByRole('button', { name: /Import Deck/ });

            fireEvent.click(button);

            await waitFor(() => {
                expect(input.value).toBe('');
            });
        });
    });

});

describe('advanced scenarios', () => {
    it('should handle invalid Archidekt deck ID', async () => {
        vi.mocked(extractArchidektDeckId).mockReturnValueOnce(null);

        render(<DeckBuilderImporter />);
        const input = screen.getByTestId('deck-url-input');
        fireEvent.change(input, { target: { value: 'https://archidekt.com/decks/bad-url' } });
        const button = screen.getByRole('button', { name: /Import Deck/ });

        fireEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText('Invalid Archidekt URL. Please paste a valid deck link.')).toBeDefined();
        });
    });

    it('should handle invalid Moxfield deck ID', async () => {
        vi.mocked(extractMoxfieldDeckId).mockReturnValueOnce(null);

        render(<DeckBuilderImporter />);
        const input = screen.getByTestId('deck-url-input');
        fireEvent.change(input, { target: { value: 'https://moxfield.com/decks/bad-url' } });
        const button = screen.getByRole('button', { name: /Import Deck/ });

        fireEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText('Invalid Moxfield URL. Please paste a valid deck link.')).toBeDefined();
        });
    });

    it('should handle empty deck result', async () => {
        vi.mocked(extractArchidektCards).mockReturnValueOnce([]);

        render(<DeckBuilderImporter />);
        const input = screen.getByTestId('deck-url-input');
        fireEvent.change(input, { target: { value: 'https://archidekt.com/decks/12345' } });
        const button = screen.getByRole('button', { name: /Import Deck/ });

        fireEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText('No cards found in deck. The deck may be empty.')).toBeDefined();
        });
    });

    it('should handle fetch errors', async () => {
        vi.mocked(fetchArchidektDeck).mockRejectedValueOnce(new Error('Network error'));

        render(<DeckBuilderImporter />);
        const input = screen.getByTestId('deck-url-input');
        fireEvent.change(input, { target: { value: 'https://archidekt.com/decks/12345' } });
        const button = screen.getByRole('button', { name: /Import Deck/ });

        fireEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText('Network error')).toBeDefined();
        });
    });

    it('should handle streamCards errors', async () => {
        mockStreamCards.mockRejectedValueOnce(new Error('Stream failed'));

        render(<DeckBuilderImporter />);
        const input = screen.getByTestId('deck-url-input');
        fireEvent.change(input, { target: { value: 'https://archidekt.com/decks/12345' } });
        const button = screen.getByRole('button', { name: /Import Deck/ });

        fireEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText('Stream failed')).toBeDefined();
        });
    });

    it('should abort previous request if import clicked again quickly', async () => {
        mockStreamCards.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

        render(<DeckBuilderImporter />);
        const input = screen.getByTestId('deck-url-input');
        fireEvent.change(input, { target: { value: 'https://archidekt.com/decks/12345' } });
        const button = screen.getByRole('button', { name: /Import Deck/ });

        fireEvent.click(button);
        fireEvent.click(button); // Click again immediately

        // Verify no crash, and eventually finishes
        await waitFor(() => {
            expect(screen.queryByText(/Importing/)).toBeNull();
        });
    });

    it('should handle unknown errors', async () => {
        vi.mocked(fetchArchidektDeck).mockRejectedValueOnce("Unknown string error");

        render(<DeckBuilderImporter />);
        const input = screen.getByTestId('deck-url-input');
        fireEvent.change(input, { target: { value: 'https://archidekt.com/decks/12345' } });
        const button = screen.getByRole('button', { name: /Import Deck/ });

        fireEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText('Failed to fetch deck')).toBeDefined();
        });
    });
});
