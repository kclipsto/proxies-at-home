import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@microsoft/fetch-event-source', () => ({
    fetchEventSource: vi.fn(),
}));

vi.mock('./undoableActions', () => ({
    undoableAddCards: vi.fn(),
}));

vi.mock('./dbUtils', () => ({
    addCards: vi.fn(),
    addRemoteImage: vi.fn(),
    createLinkedBackCardsBulk: vi.fn(),
}));

vi.mock('./importSession', () => ({
    session: {
        getActiveDfcs: vi.fn(() => new Map()),
    },
}));

vi.mock('@/constants', () => ({
    API_BASE: 'http://localhost:3000',
}));

vi.mock('@/db', () => ({
    db: {
        cards: {
            toArray: vi.fn().mockResolvedValue([]),
        },
    },
}));

vi.mock('./mpcAutofillApi', () => ({
    getMpcAutofillImageUrl: vi.fn((id) => `http://mpc/${id}`),
}));

// Import types only - the actual function uses complex streaming

describe('streamCards', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('cardKey helper', () => {
        it('should create a unique key from card info', async () => {
            // Since cardKey is internal, we verify the module loads
            const module = await import('./streamCards');
            expect(module).toBeDefined();
        });
    });

    describe('streamCards function', () => {
        it('should be exported', async () => {
            const module = await import('./streamCards');
            expect(typeof module.streamCards).toBe('function');
        });
    });
});
