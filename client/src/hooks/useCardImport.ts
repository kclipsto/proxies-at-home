import { useRef, useCallback } from "react";
import { ImportOrchestrator } from "@/helpers/ImportOrchestrator";
import type { ImportIntent } from "@/helpers/importParsers";
import { useToastStore } from "@/store/toast";
import { handleAutoImportTokens } from "@/helpers/tokenImportHelper";

interface UseCardImportOptions {
    /**
     * Called when the import process completes successfully.
     */
    onComplete?: () => void;
}

export interface UseCardImportReturn {
    /**
     * Process an array of import intents.
     * Handles AbortController management, error handling, and auto-token import.
     */
    processCards: (intents: ImportIntent[]) => Promise<void>;
    /**
     * Cancel any active import operation.
     */
    cancel: () => void;
}

/**
 * Shared hook for processing card import intents.
 * Extracts common logic from DecklistUploader and DeckBuilderImporter.
 *
 * Features:
 * - AbortController management for cancellation
 * - Generation tracking for stale request handling
 * - Consistent error handling with toast notifications
 * - Auto-import tokens when enabled
 */
export function useCardImport(options: UseCardImportOptions = {}): UseCardImportReturn {
    const fetchController = useRef<AbortController | null>(null);
    const fetchGenerationRef = useRef(0);
    // Use ref for onComplete to avoid stale closure issues
    const onCompleteRef = useRef(options.onComplete);
    onCompleteRef.current = options.onComplete;

    const processCards = useCallback(async (intents: ImportIntent[]) => {
        const currentGeneration = ++fetchGenerationRef.current;

        // Cancel any existing operation
        if (fetchController.current) {
            fetchController.current.abort();
        }
        fetchController.current = new AbortController();

        if (intents.length === 0) {
            useToastStore.getState().showErrorToast("No valid cards found to import. Please check your input.");
            return;
        }

        try {
            await ImportOrchestrator.process(intents, {
                signal: fetchController.current.signal,
                onComplete: () => {
                    // Use ref to get latest callback
                    onCompleteRef.current?.();

                    // Auto-import tokens (helper checks setting internally)
                    void handleAutoImportTokens({ silent: true });
                }
            });
        } catch (err: unknown) {
            // Ignore errors from stale fetches
            if (currentGeneration !== fetchGenerationRef.current) return;

            if (err instanceof Error && err.name !== "AbortError") {
                useToastStore.getState().showErrorToast(err.message || "Something went wrong while fetching cards.");
            } else if (!(err instanceof Error)) {
                useToastStore.getState().showErrorToast("An unknown error occurred while fetching cards.");
            }
        } finally {
            // Only clear if this is still the active generation
            if (currentGeneration === fetchGenerationRef.current) {
                fetchController.current = null;
            }
        }
    }, []); // No dependencies - uses refs for callbacks

    const cancel = useCallback(() => {
        fetchController.current?.abort();
        fetchController.current = null;
    }, []);

    return { processCards, cancel };
}
