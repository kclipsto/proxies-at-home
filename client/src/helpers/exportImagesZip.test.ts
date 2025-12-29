import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted for mock functions
const { mockFile, mockGenerateAsync, mockSaveAs } = vi.hoisted(() => ({
    mockFile: vi.fn(),
    mockGenerateAsync: vi.fn().mockResolvedValue(new Blob(['test'])),
    mockSaveAs: vi.fn(),
}));

// Mock dependencies before importing
vi.mock('jszip', () => {
    return {
        default: class MockJSZip {
            file = mockFile;
            generateAsync = mockGenerateAsync;
        },
    };
});

vi.mock('file-saver', () => ({
    saveAs: mockSaveAs,
}));

vi.mock('@/db', () => ({
    db: {
        effectCache: {
            put: vi.fn(),
        },
    },
}));

vi.mock('@/store/settings', () => ({
    useSettingsStore: {
        getState: vi.fn(() => ({
            dpi: 300,
            darkenMode: 'none',
        })),
    },
}));

vi.mock('./cardCanvasWorker', () => ({
    hasAdvancedOverrides: vi.fn(() => false),
    overridesToRenderParams: vi.fn(),
    renderCardWithOverridesWorker: vi.fn(),
}));

// Now import the module
import { ExportImagesZip } from './exportImagesZip';

describe('exportImagesZip', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('ExportImagesZip', () => {
        it('should create and save a zip file with no cards', async () => {
            await ExportImagesZip({
                cards: [],
                images: [],
            });

            expect(mockSaveAs).toHaveBeenCalled();
        });

        it('should use custom fileBaseName if provided', async () => {
            await ExportImagesZip({
                cards: [],
                images: [],
                fileBaseName: 'my_deck',
            });

            expect(mockSaveAs).toHaveBeenCalledWith(
                expect.any(Blob),
                expect.stringContaining('my_deck')
            );
        });
    });
});
