import { describe, it, expect, vi } from 'vitest';

// Mock all dependencies thoroughly 
vi.mock('../db', () => ({
    db: {
        cards: {
            toArray: vi.fn().mockResolvedValue([]),
            hook: vi.fn(),
        },
    },
}));

vi.mock('../constants', () => ({
    API_BASE: 'http://localhost:3000',
}));

vi.mock('../helpers/importSession', () => ({
    getCurrentSession: vi.fn(() => null),
}));

vi.mock('../helpers/cancellationService', () => ({
    getEnrichmentAbortController: vi.fn(() => ({ signal: { aborted: false } })),
}));

vi.mock('../helpers/cardbackLibrary', () => ({
    isCardbackId: vi.fn(() => false),
}));

// Import only to check it's exported
describe('useCardEnrichment', () => {
    it('should be a valid module export', async () => {
        const module = await import('./useCardEnrichment');
        expect(typeof module.useCardEnrichment).toBe('function');
    });
});
