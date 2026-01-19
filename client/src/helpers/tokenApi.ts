import { API_BASE } from "../constants";
import { withRetry, API_RETRY_CONFIG, isRetryableError } from "./retryUtils";

type TokenPart = {
    id?: string;
    name: string;
    type_line?: string;
    uri?: string;
};

type TokenResponseItem = {
    name: string;
    token_parts?: TokenPart[];
};

/**
 * Result type for token fetching - distinguishes between success, empty result, and error.
 */
export type TokenFetchResult =
    | { success: true; data: TokenResponseItem[] }
    | { success: false; error: Error };

/**
 * Fetch token_parts data for a list of cards.
 * Uses retry logic for transient failures.
 * 
 * @returns TokenFetchResult - Explicitly indicates success/failure rather than silent empty array
 */
export async function fetchTokenParts(
    cards: { name: string; set?: string; number?: string }[],
    signal?: AbortSignal
): Promise<TokenFetchResult> {
    if (cards.length === 0) {
        return { success: true, data: [] };
    }

    try {
        const data = await withRetry(
            async () => {
                const response = await fetch(`${API_BASE}/api/cards/images/tokens`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cards }),
                    signal,
                });

                if (!response.ok) {
                    throw new Error(`Token fetch failed: ${response.status}`);
                }

                return await response.json() as TokenResponseItem[];
            },
            API_RETRY_CONFIG,
            (error) => {
                // Don't retry aborts or 4xx client errors
                if (error instanceof Error && error.name === 'AbortError') return false;
                if (error instanceof Error && error.message.includes('4')) {
                    const status = parseInt(error.message.match(/\d{3}/)?.[0] || '0');
                    if (status >= 400 && status < 500 && status !== 429) return false;
                }
                return isRetryableError(error);
            }
        );

        return { success: true, data };
    } catch (e) {
        // Propagate AbortError without wrapping
        if (e instanceof Error && e.name === 'AbortError') {
            throw e;
        }
        return {
            success: false,
            error: e instanceof Error ? e : new Error(String(e))
        };
    }
}
