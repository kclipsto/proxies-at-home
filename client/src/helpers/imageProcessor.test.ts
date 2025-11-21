import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ImageProcessor } from "./imageProcessor";

describe("ImageProcessor", () => {
    beforeEach(() => {
        // Reset the singleton instance before each test
        // We need to access the private static instance to reset it
        // @ts-expect-error: Accessing private member for testing
        ImageProcessor.instance = undefined;
        // @ts-expect-error: Accessing private member for testing
        ImageProcessor.instances = new Set();

        // Mock Worker
        global.Worker = vi.fn().mockImplementation(() => ({
            postMessage: vi.fn(),
            terminate: vi.fn(),
            onmessage: null,
            onerror: null,
        }));

        // Mock navigator.hardwareConcurrency
        Object.defineProperty(navigator, 'hardwareConcurrency', {
            value: 4,
            configurable: true,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should implement Singleton pattern", () => {
        const instance1 = ImageProcessor.getInstance();
        const instance2 = ImageProcessor.getInstance();
        expect(instance1).toBe(instance2);
    });

    it("should cap maxWorkers at 18", () => {
        // Mock high concurrency
        Object.defineProperty(navigator, 'hardwareConcurrency', {
            value: 32,
            configurable: true,
        });

        const instance = ImageProcessor.getInstance();
        // Access private maxWorkers
        // @ts-expect-error: Accessing private member for testing
        expect(instance.maxWorkers).toBe(18);
    });

    it("should use hardwareConcurrency - 1 if less than cap", () => {
        Object.defineProperty(navigator, 'hardwareConcurrency', {
            value: 8,
            configurable: true,
        });

        const instance = ImageProcessor.getInstance();
        // @ts-expect-error: Accessing private member for testing
        expect(instance.maxWorkers).toBe(7);
    });

    it("should have at least 1 worker", () => {
        Object.defineProperty(navigator, 'hardwareConcurrency', {
            value: 1,
            configurable: true,
        });

        const instance = ImageProcessor.getInstance();
        // @ts-expect-error: Accessing private member for testing
        expect(instance.maxWorkers).toBe(1);
    });
});
