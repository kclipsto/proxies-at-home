import { ImageProcessor } from "./imageProcessor";
import { useToastStore } from "../store/toast";

// Shared abort controller for metadata enrichment
let enrichmentAbortController = new AbortController();

/**
 * Get the current abort controller for metadata enrichment
 */
export function getEnrichmentAbortController(): AbortController {
    return enrichmentAbortController;
}

/**
 * Reset the abort controller (call after cancellation to allow new enrichments)
 */
function resetEnrichmentAbortController(): void {
    enrichmentAbortController = new AbortController();
}

/**
 * Cancel all processing operations:
 * - Image processing workers
 * - Metadata enrichment
 * - Toast notifications
 */
export function cancelAllProcessing(): void {
    // Cancel image processing
    ImageProcessor.getInstance().cancelAll();

    // Cancel metadata enrichment
    enrichmentAbortController.abort();
    resetEnrichmentAbortController(); // Create fresh controller for next run

    // Clear all toasts
    useToastStore.getState().clearToasts();
}
