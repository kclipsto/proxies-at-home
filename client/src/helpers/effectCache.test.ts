import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/store/settings', () => ({
    useSettingsStore: {
        getState: vi.fn(() => ({
            dpi: 300,
        })),
    },
}));

vi.mock('@/db', () => ({
    db: {
        effectCache: {
            get: vi.fn().mockResolvedValue(undefined),
            put: vi.fn().mockResolvedValue(undefined),
        },
    },
}));

vi.mock('./cardCanvasWorker', () => ({
    overridesToRenderParams: vi.fn(() => ({})),
}));

// Import after mocks
import { getEffectProcessor } from './effectCache';

describe('effectCache', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getEffectProcessor', () => {
        it('should return a singleton instance', () => {
            const processor1 = getEffectProcessor();
            const processor2 = getEffectProcessor();
            expect(processor1).toBe(processor2);
        });

        it('should have activity change subscription method', () => {
            const processor = getEffectProcessor();
            expect(typeof processor.onActivityChange).toBe('function');
        });

        it('should have destroy method', () => {
            const processor = getEffectProcessor();
            expect(typeof processor.destroy).toBe('function');
        });

        it('should have process method', () => {
            const processor = getEffectProcessor();
            expect(typeof processor.process).toBe('function');
        });
    });
});
