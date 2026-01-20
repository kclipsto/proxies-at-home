import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ImageProcessor, Priority } from "./imageProcessor";

describe("ImageProcessor", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // Reset the singleton instance before each test
        // We need to access the private static instance to reset it
        // @ts-expect-error: Accessing private member for testing
        ImageProcessor.instance = undefined;
        // @ts-expect-error: Accessing private member for testing
        ImageProcessor.instances = new Set();

        // Mock Worker
        global.Worker = class MockWorker {
            postMessage = vi.fn();
            terminate = vi.fn();
            onmessage = null;
            onerror = null;
            constructor() { }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;

        // Mock navigator.hardwareConcurrency
        Object.defineProperty(navigator, 'hardwareConcurrency', {
            value: 16,
            configurable: true,
        });

        // Mock URL
        global.URL = class MockURL {
            constructor() { }
            toString() { return "mock-url"; }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
    });

    afterEach(() => {
        ImageProcessor.destroyAll();
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("should implement Singleton pattern", () => {
        const instance1 = ImageProcessor.getInstance();
        const instance2 = ImageProcessor.getInstance();
        expect(instance1).toBe(instance2);
    });

    it("should cap maxWorkers at 8", () => {
        // Mock high concurrency
        Object.defineProperty(navigator, 'hardwareConcurrency', {
            value: 32,
            configurable: true,
        });

        const instance = ImageProcessor.getInstance();
        // Access private maxWorkers
        // @ts-expect-error: Accessing private member for testing
        expect(instance.baseMaxWorkers).toBe(8);
    });

    it("should process one task", async () => {
        const instance = ImageProcessor.getInstance();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = instance.process({} as unknown as any);

        // Check if worker was created
        // @ts-expect-error: Accessing private member
        expect(instance.allWorkers.size).toBe(1);

        // Prevent unhandled rejection by catching the promise
        p.catch(() => { });
    });

    it("should cancel queued tasks and terminate workers", async () => {
        const instance = ImageProcessor.getInstance();

        // Create 8 tasks to fill the pool
        const activePromises = [];
        for (let i = 0; i < 8; i++) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            activePromises.push(instance.process({} as unknown as any));
        }

        // Create 9th task (should be queued)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const queuedPromise = instance.process({} as unknown as any);

        // Cancel
        instance.cancelAll();

        // Expect queued promise to reject
        await expect(queuedPromise).rejects.toThrow("Cancelled");

        // active promises should also be rejected or handled, but we focus on state here

        // Expect workers to be cleared
        // @ts-expect-error: Accessing private member
        expect(instance.allWorkers.size).toBe(0);
    });

    it("should use hardwareConcurrency - 1 if less than cap", () => {
        Object.defineProperty(navigator, 'hardwareConcurrency', {
            value: 8,
            configurable: true,
        });

        const instance = ImageProcessor.getInstance();
        // @ts-expect-error: Accessing private member for testing
        expect(instance.baseMaxWorkers).toBe(7);
    });

    it("should have at least 1 worker", () => {
        Object.defineProperty(navigator, 'hardwareConcurrency', {
            value: 1,
            configurable: true,
        });

        const instance = ImageProcessor.getInstance();
        // @ts-expect-error: Accessing private member for testing
        expect(instance.baseMaxWorkers).toBe(1);
    });
    it("should prioritize HIGH priority tasks", async () => {
        const instance = ImageProcessor.getInstance();

        // Fill the pool (8 workers)
        for (let i = 0; i < 8; i++) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            instance.process({ uuid: `fill-${i}` } as any);
        }

        // Queue a LOW priority task
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lowP = instance.process({ uuid: "low" } as any, Priority.LOW);
        lowP.catch(() => { });

        // Queue a HIGH priority task
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const highP = instance.process({ uuid: "high" } as any, Priority.HIGH);
        highP.catch(() => { });

        // Verify queue state
        // @ts-expect-error: Accessing private member
        expect(instance.lowPriorityQueue.length).toBe(1);
        // @ts-expect-error: Accessing private member
        expect(instance.highPriorityQueue.length).toBe(1);
        // @ts-expect-error: Accessing private member
        expect(instance.highPriorityQueue[0].message.uuid).toBe("high");
        // @ts-expect-error: Accessing private member
        expect(instance.lowPriorityQueue[0].message.uuid).toBe("low");
    });

    it("should promote LOW priority task to HIGH if requested again", async () => {
        const instance = ImageProcessor.getInstance();

        // Fill the pool
        for (let i = 0; i < 8; i++) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            instance.process({ uuid: `fill-${i}` } as any);
        }

        // Queue a LOW priority task
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p1 = instance.process({ uuid: "promote-me" } as any, Priority.LOW);
        p1.catch(() => { });

        // Verify it's in low queue
        // @ts-expect-error: Accessing private member
        expect(instance.lowPriorityQueue.length).toBe(1);
        // @ts-expect-error: Accessing private member
        expect(instance.highPriorityQueue.length).toBe(0);

        // Request same task with HIGH priority
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p2 = instance.process({ uuid: "promote-me" } as any, Priority.HIGH);
        p2.catch(() => { });

        // Verify it moved to high queue
        // @ts-expect-error: Accessing private member
        expect(instance.lowPriorityQueue.length).toBe(0);
        // @ts-expect-error: Accessing private member
        expect(instance.highPriorityQueue.length).toBe(1);
        // @ts-expect-error: Accessing private member
        expect(instance.highPriorityQueue[0].message.uuid).toBe("promote-me");

        // The first promise should have been rejected with "Promoted..."
        await expect(p1).rejects.toThrow("Promoted to high priority");
    });

    it("should reject when queue exceeds MAX_QUEUE_SIZE", async () => {
        const instance = ImageProcessor.getInstance();


        // Fill queue to limit (need to account for active workers + queue)
        // MAX_QUEUE_SIZE is 200, active workers max 8.
        // So we need > 208 tasks to trigger rejection.
        for (let i = 0; i < 250; i++) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = instance.process({ uuid: `fill-queue-${i}` } as any);
            p.catch(() => { });
        }

        // Try to add one more
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const overflow = instance.process({ uuid: "overflow" } as any);
        await expect(overflow).rejects.toThrow("Processing queue full");
    });

    it("should call activity callback", async () => {
        const instance = ImageProcessor.getInstance();
        const callback = vi.fn();
        const unsubscribe = instance.onActivityChange(callback);

        // Start a task
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = instance.process({ uuid: "activity-test" } as any);
        p.catch(() => { });

        expect(callback).toHaveBeenCalledWith(true);

        // Finish task (mock worker message)
        // Access private worker logic via any cast if necessary or verify state change
        // Since we can't easily trigger the worker response in this mock setup without deeper hooks,
        // we'll verify the listener was registered and called on start.

        unsubscribe();
    });
});
