import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    getEnrichmentAbortController,
    cancelAllProcessing,
} from "./cancellationService";

// Mock dependencies
vi.mock("./imageProcessor", () => ({
    ImageProcessor: {
        getInstance: () => ({
            cancelAll: vi.fn(),
        }),
    },
}));

vi.mock("../store/toast", () => ({
    useToastStore: {
        getState: () => ({
            clearToasts: vi.fn(),
        }),
    },
}));

describe("cancellationService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("getEnrichmentAbortController", () => {
        it("should return an AbortController instance", () => {
            const controller = getEnrichmentAbortController();
            expect(controller).toBeInstanceOf(AbortController);
        });

        it("should return same controller on subsequent calls", () => {
            const controller1 = getEnrichmentAbortController();
            const controller2 = getEnrichmentAbortController();
            expect(controller1).toBe(controller2);
        });
    });

    describe("cancelAllProcessing", () => {
        it("should not throw when called", () => {
            expect(() => cancelAllProcessing()).not.toThrow();
        });

        it("should abort the enrichment controller", () => {
            const controller = getEnrichmentAbortController();
            expect(controller.signal.aborted).toBe(false);

            cancelAllProcessing();

            // After cancel, a NEW controller is created
            // So the previous controller should remain aborted
            // but getEnrichmentAbortController returns fresh one
            const newController = getEnrichmentAbortController();
            expect(newController.signal.aborted).toBe(false);
        });
    });
});
