import { ImportOrchestrator } from "./ImportOrchestrator";
import { useSettingsStore } from "@/store/settings";

export interface AutoTokenOptions {
    signal?: AbortSignal;
    onComplete?: () => void;
    onNoTokens?: () => void;
    silent?: boolean;
}

/**
 * Triggers import of missing tokens for cards that need them.
 * Checks autoImportTokens setting and returns early if disabled.
 */
export async function handleAutoImportTokens(options: AutoTokenOptions = {}) {
    const { silent = false } = options;

    // Check global setting - return early if disabled
    if (!useSettingsStore.getState().autoImportTokens) {
        return;
    }

    try {
        await ImportOrchestrator.importMissingTokens({
            skipExisting: silent,
            signal: options.signal,
            onComplete: options.onComplete,
            onNoTokens: options.onNoTokens,
        });
    } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
            // Ignore aborts
            return;
        }
        console.error("Failed to auto-import tokens:", err);
        if (!silent) {
            // Re-throw or alert if not silent? 
            // The original code in DecklistUploader alert()ed non-aborts.
            // MpcImportSection just console.error'd.
            // We'll let the caller decide or just throw non-aborts.
            throw err;
        }
    }
}
