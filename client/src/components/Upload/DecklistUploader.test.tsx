// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// --- Hoisted Mocks ---
const hoistedMocks = vi.hoisted(() => ({
    process: vi.fn(),
    importMissingTokens: vi.fn(),
    state: {
        globalLanguage: 'en',
        preferredArtSource: 'scryfall' as 'scryfall' | 'mpc',
        autoImportTokens: true,
        setSortBy: vi.fn(),
    },
    projectState: {
        currentProjectId: 'test-project-id',
        projects: [],
    },
    cards: {
        toArray: vi.fn(),
        clear: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        filter: vi.fn(() => ({
            first: vi.fn().mockResolvedValue(undefined),
            count: vi.fn().mockResolvedValue(0),
            toArray: vi.fn().mockResolvedValue([]),
        })),
        where: vi.fn(() => ({
            equals: vi.fn(() => ({
                filter: vi.fn(() => ({
                    toArray: vi.fn().mockResolvedValue([]),
                })),
                toArray: vi.fn().mockResolvedValue([]),
            })),
        })),
    },
    transaction: vi.fn((_mode, _table, cb) => cb()),
}));

// --- Mocks ---

vi.mock('@/helpers/decklistHelper', () => ({
    parseDecklistText: vi.fn(() => []),
}));

vi.mock('dexie-react-hooks', () => ({
    useLiveQuery: (_querier: () => unknown) => {
        return false;
    }
}));

vi.mock('@/helpers/importParsers', () => ({
    parseDeckList: vi.fn(),
    parseDeckBuilderUrl: vi.fn(),
}));

vi.mock('@/helpers/dbUtils', () => ({
    // Return a dummy ID for MPC image adds
    addRemoteImage: vi.fn().mockResolvedValue('mpc-id-123'),
}));

vi.mock('@/helpers/ImportOrchestrator', () => ({
    ImportOrchestrator: {
        process: hoistedMocks.process,
        importMissingTokens: hoistedMocks.importMissingTokens,
    },
}));

vi.mock('@/store', () => ({
    useCardsStore: vi.fn(() => ({
        clearAllCards: vi.fn(),
    })),
    useSettingsStore: Object.assign(
        vi.fn((selector) => {
            return typeof selector === 'function' ? selector(hoistedMocks.state) : hoistedMocks.state;
        }),
        {
            getState: vi.fn(() => hoistedMocks.state),
            setState: vi.fn((newState) => {
                Object.assign(hoistedMocks.state, newState);
            }),
        }
    ),
    useProjectStore: Object.assign(
        vi.fn((selector) => {
            return typeof selector === 'function' ? selector(hoistedMocks.projectState) : hoistedMocks.projectState.currentProjectId;
        }),
        {
            getState: vi.fn(() => hoistedMocks.projectState),
        }
    ),
}));

vi.mock('@/store/settings', () => ({
    useSettingsStore: Object.assign(
        vi.fn((selector) => {
            return typeof selector === 'function' ? selector(hoistedMocks.state) : hoistedMocks.state;
        }),
        {
            getState: vi.fn(() => hoistedMocks.state),
            setState: vi.fn((newState) => {
                Object.assign(hoistedMocks.state, newState);
            }),
        }
    ),
}));

vi.mock('@/store/loading', () => ({
    useLoadingStore: vi.fn(() => ({
        setLoading: vi.fn(),
        setProgress: vi.fn(),
        clearLoading: vi.fn(),
    })),
}));

vi.mock('../../db', () => ({
    db: {
        cards: hoistedMocks.cards,
        transaction: hoistedMocks.transaction,
    },
}));

vi.mock('@/store/projectStore', () => ({
    useProjectStore: Object.assign(
        vi.fn((selector) => {
            return typeof selector === 'function' ? selector(hoistedMocks.projectState) : hoistedMocks.projectState.currentProjectId;
        }),
        {
            getState: vi.fn(() => hoistedMocks.projectState),
        }
    ),
}));

vi.mock('../ArtworkModal', () => ({
    AdvancedSearch: ({ onSelectCard }: { onSelectCard: (name: string, img?: string, print?: unknown) => void }) => (
        <button
            data-testid="mock-advanced-search-select"
            onClick={() => {
                if (hoistedMocks.state.preferredArtSource === 'mpc') {
                    onSelectCard('Prosperous Innkeeper', 'https://example.com/mpc-image.jpg', undefined);
                } else {
                    onSelectCard('Prosperous Innkeeper', undefined, { set: 'afr', number: '200' });
                }
            }}
        >
            Select Card
        </button>
    ),
}));

vi.mock('../common', () => ({
    AutoTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { DecklistUploader } from './DecklistUploader';

// --- Tests ---

describe('DecklistUploader', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        hoistedMocks.state.autoImportTokens = true;
        hoistedMocks.state.preferredArtSource = 'scryfall';
        hoistedMocks.cards.toArray.mockResolvedValue([]);
        hoistedMocks.cards.count.mockResolvedValue(0);

        // Ensure process calls onComplete to trigger the chain
        hoistedMocks.process.mockImplementation(async (_intents, options) => {
            if (options && options.onComplete) {
                options.onComplete();
            }
        });
    });

    it('should render Add Cards heading', () => {
        render(<DecklistUploader cardCount={0} />);
        expect(screen.getByText(/Add Cards/)).toBeDefined();
    });

    it('should trigger token import when autoImportTokens is true (Scryfall Source)', async () => {
        // Setup
        hoistedMocks.state.preferredArtSource = 'scryfall';

        // Mock importMissingTokens to resolve successfully
        hoistedMocks.importMissingTokens.mockResolvedValue([
            { name: 'Treasure', quantity: 1, isToken: true }
        ]);

        render(<DecklistUploader cardCount={0} />);

        // Action: Select card from Advanced Search
        const openSearchBtn = screen.getByText('Advanced Search');
        fireEvent.click(openSearchBtn);

        const selectBtn = await screen.findByTestId('mock-advanced-search-select');
        fireEvent.click(selectBtn);

        // Assert 1: Main card added via Orchestrator.process()
        await waitFor(() => {
            expect(hoistedMocks.process).toHaveBeenCalledWith(expect.arrayContaining([
                expect.objectContaining({ name: 'Prosperous Innkeeper' })
            ]), expect.anything());
        });

        // Assert 2: Token import triggered via Orchestrator.importMissingTokens()
        await waitFor(() => {
            expect(hoistedMocks.importMissingTokens).toHaveBeenCalledWith(expect.objectContaining({
                skipExisting: true, // Auto-import uses skipExisting: true (silent mode)
            }));
        });
    });

    it('should trigger token import when autoImportTokens is true (MPC Source)', async () => {
        // Setup
        hoistedMocks.state.preferredArtSource = 'mpc';

        // Mock importMissingTokens to resolve successfully
        hoistedMocks.importMissingTokens.mockResolvedValue([
            { name: 'Treasure', quantity: 1, isToken: true }
        ]);

        render(<DecklistUploader cardCount={0} />);

        // Action: Select card
        const openSearchBtn = screen.getByText('Advanced Search');
        fireEvent.click(openSearchBtn);

        const selectBtn = await screen.findByTestId('mock-advanced-search-select');
        fireEvent.click(selectBtn);

        // Assert 1: Main card added via Orchestrator (Manual MPC intent)
        await waitFor(() => {
            const calls = hoistedMocks.process.mock.calls;
            const manualCall = calls.find(call =>
                Array.isArray(call[0]) &&
                call[0][0].name === 'Prosperous Innkeeper' &&
                call[0][0].sourcePreference === 'manual'
            );
            expect(manualCall).toBeDefined();
        });

        // Assert 2: Token import triggered via Orchestrator.importMissingTokens()
        await waitFor(() => {
            expect(hoistedMocks.importMissingTokens).toHaveBeenCalledWith(expect.objectContaining({
                skipExisting: true, // Auto-import uses skipExisting: true (silent mode)
            }));
        });
    });
});
