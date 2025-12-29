import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock dependencies
vi.mock('@/helpers/decklistHelper', () => ({
    parseDecklistText: vi.fn(() => []),
}));

vi.mock('@/helpers/streamCards', () => ({
    streamCards: vi.fn(),
}));

vi.mock('@/store', () => ({
    useCardsStore: vi.fn(() => ({
        clearAllCards: vi.fn(),
    })),
    useSettingsStore: vi.fn(() => ({
        globalLanguage: 'en',
    })),
}));

vi.mock('@/store/loading', () => ({
    useLoadingStore: vi.fn(() => ({
        setLoading: vi.fn(),
        setProgress: vi.fn(),
        clearLoading: vi.fn(),
    })),
}));

vi.mock('@/store/settings', () => ({
    useSettingsStore: Object.assign(
        vi.fn((selector) => {
            const state = {
                globalLanguage: 'en',
                preferredArtSource: 'scryfall',
                setSortBy: vi.fn(),
            };
            return typeof selector === 'function' ? selector(state) : state;
        }),
        {
            getState: vi.fn(() => ({
                setSortBy: vi.fn(),
            })),
        }
    ),
}));

vi.mock('../../db', () => ({
    db: {
        cards: {
            toArray: vi.fn().mockResolvedValue([]),
            clear: vi.fn(),
            count: vi.fn().mockResolvedValue(0),
        },
    },
}));

vi.mock('../ArtworkModal', () => ({
    AdvancedSearch: () => null,
}));

vi.mock('../common', () => ({
    AutoTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { DecklistUploader } from './DecklistUploader';

describe('DecklistUploader', () => {
    it('should render Add Cards heading', () => {
        render(<DecklistUploader cardCount={0} />);
        expect(screen.getByText(/Add Cards/)).toBeDefined();
    });

    it('should render Fetch Cards button', () => {
        render(<DecklistUploader cardCount={0} />);
        expect(screen.getByText('Fetch Cards')).toBeDefined();
    });
});
