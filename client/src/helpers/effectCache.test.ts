import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RenderParams } from '../components/CardCanvas/types';

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



    it("should implement Singleton pattern", () => {
        const processor1 = getEffectProcessor();
        const processor2 = getEffectProcessor();
        expect(processor1).toBe(processor2);
    });

    describe('EffectProcessor Logic', () => {
        // Type for mock worker constructor
        type MockWorkerClass = new () => {
            postMessage: ReturnType<typeof vi.fn>;
            terminate: ReturnType<typeof vi.fn>;
            onmessage: ((e: MessageEvent) => void) | null;
            onerror: ((e: ErrorEvent) => void) | null;
        };
        let MockWorker: MockWorkerClass;

        beforeEach(() => {
            vi.useFakeTimers();

            // Mock Worker implementation
            MockWorker = class {
                postMessage = vi.fn((data) => {
                    // Simulate async processing
                    Promise.resolve().then(() => {
                        if (this.onmessage) {
                            this.onmessage({ data: { taskId: data.taskId, blob: new Blob(['']), error: null } } as MessageEvent);
                        }
                    });
                });
                terminate = vi.fn();
                onmessage: ((e: MessageEvent) => void) | null = null;
                onerror: ((e: ErrorEvent) => void) | null = null;
                constructor() { }
            };
            global.Worker = MockWorker as unknown as typeof Worker;

            // Mock Browser APIs
            global.createImageBitmap = vi.fn().mockResolvedValue({
                width: 100,
                height: 100,
                close: vi.fn(),
            });

            global.OffscreenCanvas = class {
                constructor() { }
                getContext() {
                    return {
                        drawImage: vi.fn(),
                        getImageData: vi.fn(() => ({
                            data: new Uint8ClampedArray(4),
                            width: 1,
                            height: 1,
                        })),
                    };
                }
            } as unknown as typeof OffscreenCanvas;

            // Access private instance to reset it - using type assertion
            const processor = getEffectProcessor();
            if ('instance' in processor.constructor) {
                processor.destroy();
            }
        });

        afterEach(() => {
            vi.useRealTimers();
            // Clean up
            getEffectProcessor().destroy();
        });

        it("should terminate idle workers after timeout", async () => {
            const processor = getEffectProcessor();

            // Prevent immediate resolution in mock to control flow manually if needed, 
            // but here we just rely on fake timers.

            // Start a task
            const p = processor.process(new Blob(['']), {} as RenderParams);

            // Fast forward processing time
            vi.advanceTimersByTime(100);
            await expect(p).resolves.toBeInstanceOf(Blob);

            // Now worker should be idle and timeout set
            // @ts-expect-error: Accessing private member
            expect(processor.idleWorkers.length).toBe(1);

            // Fast forward idle timeout (e.g. 30s)
            // We need to know the constant value, assuming standard 30s or use constant if imported
            // But constant is from imported module which is not mocked? 
            // Actually I imported real EffectProcessor which imports constants.
            vi.advanceTimersByTime(60000); // 60 seconds should be safe

            // Worker should be terminated
            // @ts-expect-error: Accessing private member
            expect(processor.idleWorkers.length).toBe(0);
        });

        it("should reject pending task on worker error", async () => {
            const processor = getEffectProcessor();

            // Mock console.error to silence expected worker error
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            // Custom mock worker that errors
            global.Worker = class extends (MockWorker as unknown as { new(): Worker }) {
                postMessage = vi.fn((_data: unknown) => {
                    Promise.resolve().then(() => {
                        if (this.onerror) {
                            this.onerror(new ErrorEvent('error', { message: 'Crash!' }));
                        }
                    });
                });
            } as unknown as typeof Worker;

            const p = processor.process(new Blob(['']), {} as RenderParams);

            vi.advanceTimersByTime(100);
            await expect(p).rejects.toThrow("Worker crashed: Crash!");

            consoleSpy.mockRestore();
        });
    });
});
