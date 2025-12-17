import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useToastStore } from "./toast";
import { useSettingsStore } from "./settings";

// Mock settings store
vi.mock("./settings", () => ({
    useSettingsStore: {
        getState: vi.fn(() => ({
            showProcessingToasts: true,
        })),
    },
}));

describe("useToastStore", () => {
    beforeEach(() => {
        // Reset store state before each test
        useToastStore.setState({ toasts: [] });
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe("addToast", () => {
        it("should add a toast with generated ID", () => {
            const { addToast } = useToastStore.getState();

            const id = addToast({
                type: "processing",
                message: "Test message",
                dismissible: true,
            });

            expect(id).toMatch(/^processing-\d+$/);
            expect(useToastStore.getState().toasts.length).toBe(1);
        });

        it("should add toast with correct properties", () => {
            const { addToast } = useToastStore.getState();

            addToast({
                type: "success",
                message: "Success!",
                dismissible: false,
            });

            const toast = useToastStore.getState().toasts[0];
            expect(toast.type).toBe("success");
            expect(toast.message).toBe("Success!");
            expect(toast.dismissible).toBe(false);
        });

        it("should support multiple toasts", () => {
            const { addToast } = useToastStore.getState();

            addToast({ type: "processing", message: "Processing", dismissible: true });
            addToast({ type: "metadata", message: "Metadata", dismissible: true });
            addToast({ type: "success", message: "Success", dismissible: false });

            expect(useToastStore.getState().toasts.length).toBe(3);
        });
    });

    describe("removeToast", () => {
        it("should remove toast by ID", () => {
            const { addToast, removeToast } = useToastStore.getState();
            const id = addToast({ type: "processing", message: "Test", dismissible: true });

            removeToast(id);

            expect(useToastStore.getState().toasts.length).toBe(0);
        });

        it("should only remove specified toast", () => {
            const { addToast, removeToast } = useToastStore.getState();
            const id1 = addToast({ type: "processing", message: "Test 1", dismissible: true });
            addToast({ type: "metadata", message: "Test 2", dismissible: true });

            removeToast(id1);

            const toasts = useToastStore.getState().toasts;
            expect(toasts.length).toBe(1);
            expect(toasts[0].message).toBe("Test 2");
        });

        it("should handle removing non-existent toast", () => {
            const { addToast, removeToast } = useToastStore.getState();
            addToast({ type: "processing", message: "Test", dismissible: true });

            removeToast("non-existent-id");

            expect(useToastStore.getState().toasts.length).toBe(1);
        });
    });

    describe("clearToasts", () => {
        it("should remove all toasts", () => {
            const { addToast, clearToasts } = useToastStore.getState();
            addToast({ type: "processing", message: "Test 1", dismissible: true });
            addToast({ type: "metadata", message: "Test 2", dismissible: true });

            clearToasts();

            expect(useToastStore.getState().toasts.length).toBe(0);
        });
    });

    describe("showProcessingToast", () => {
        it("should add processing toast when enabled", () => {
            const { showProcessingToast } = useToastStore.getState();

            showProcessingToast();

            const toasts = useToastStore.getState().toasts;
            expect(toasts.length).toBe(1);
            expect(toasts[0].type).toBe("processing");
            expect(toasts[0].message).toBe("Processing images...");
        });

        it("should not add duplicate processing toast", () => {
            const { showProcessingToast } = useToastStore.getState();

            showProcessingToast();
            showProcessingToast();

            expect(useToastStore.getState().toasts.length).toBe(1);
        });

        it("should not add toast when disabled in settings", () => {
            vi.mocked(useSettingsStore.getState).mockReturnValue({
                showProcessingToasts: false,
            } as ReturnType<typeof useSettingsStore.getState>);

            const { showProcessingToast } = useToastStore.getState();
            showProcessingToast();

            expect(useToastStore.getState().toasts.length).toBe(0);

            // Restore mock
            vi.mocked(useSettingsStore.getState).mockReturnValue({
                showProcessingToasts: true,
            } as ReturnType<typeof useSettingsStore.getState>);
        });
    });

    describe("hideProcessingToast", () => {
        it("should remove processing toasts", () => {
            const { addToast, hideProcessingToast } = useToastStore.getState();
            addToast({ type: "processing", message: "Processing...", dismissible: true });
            addToast({ type: "metadata", message: "Other toast", dismissible: true });

            hideProcessingToast();

            const toasts = useToastStore.getState().toasts;
            expect(toasts.length).toBe(1);
            expect(toasts[0].type).toBe("metadata");
        });
    });

    describe("showMetadataToast", () => {
        it("should add metadata toast when enabled", () => {
            const { showMetadataToast } = useToastStore.getState();

            showMetadataToast();

            const toasts = useToastStore.getState().toasts;
            expect(toasts.length).toBe(1);
            expect(toasts[0].type).toBe("metadata");
            expect(toasts[0].message).toBe("Fetching metadata...");
        });

        it("should not add duplicate metadata toast", () => {
            const { showMetadataToast } = useToastStore.getState();

            showMetadataToast();
            showMetadataToast();

            expect(useToastStore.getState().toasts.length).toBe(1);
        });

        it("should not add toast when disabled in settings", () => {
            vi.mocked(useSettingsStore.getState).mockReturnValue({
                showProcessingToasts: false,
            } as ReturnType<typeof useSettingsStore.getState>);

            const { showMetadataToast } = useToastStore.getState();
            showMetadataToast();

            expect(useToastStore.getState().toasts.length).toBe(0);

            // Restore mock
            vi.mocked(useSettingsStore.getState).mockReturnValue({
                showProcessingToasts: true,
            } as ReturnType<typeof useSettingsStore.getState>);
        });
    });

    describe("hideMetadataToast", () => {
        it("should remove metadata toasts", () => {
            const { addToast, hideMetadataToast } = useToastStore.getState();
            addToast({ type: "metadata", message: "Metadata...", dismissible: true });
            addToast({ type: "processing", message: "Other toast", dismissible: true });

            hideMetadataToast();

            const toasts = useToastStore.getState().toasts;
            expect(toasts.length).toBe(1);
            expect(toasts[0].type).toBe("processing");
        });
    });

    describe("showSuccessToast", () => {
        it("should add success toast with card name", () => {
            const { showSuccessToast } = useToastStore.getState();

            showSuccessToast("Lightning Bolt");

            const toasts = useToastStore.getState().toasts;
            expect(toasts.length).toBe(1);
            expect(toasts[0].type).toBe("success");
            expect(toasts[0].message).toBe("Added Lightning Bolt");
            expect(toasts[0].dismissible).toBe(false);
        });

        it("should auto-dismiss after 2 seconds", () => {
            const { showSuccessToast } = useToastStore.getState();

            showSuccessToast("Lightning Bolt");
            expect(useToastStore.getState().toasts.length).toBe(1);

            vi.advanceTimersByTime(2000);

            expect(useToastStore.getState().toasts.length).toBe(0);
        });

        it("should remove existing success toasts before adding new one", () => {
            const { showSuccessToast } = useToastStore.getState();

            showSuccessToast("Lightning Bolt");
            showSuccessToast("Dark Ritual");

            const toasts = useToastStore.getState().toasts;
            expect(toasts.length).toBe(1);
            expect(toasts[0].message).toBe("Added Dark Ritual");
        });
    });
});
