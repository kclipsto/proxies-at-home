/**
 * Retry utilities for network operations.
 * Provides exponential backoff with jitter for resilient API calls.
 */

export interface RetryConfig {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    multiplier: number;
    jitterFactor: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    multiplier: 2,
    jitterFactor: 0.3,
};

export const API_RETRY_CONFIG: RetryConfig = {
    maxRetries: 2,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    multiplier: 2,
    jitterFactor: 0.2,
};

/**
 * Calculate delay for a retry attempt with exponential backoff and jitter.
 */
export function calculateRetryDelay(attempt: number, config = DEFAULT_RETRY_CONFIG): number {
    const delay = config.baseDelayMs * Math.pow(config.multiplier, attempt);
    const capped = Math.min(delay, config.maxDelayMs);
    const jitter = capped * config.jitterFactor * (Math.random() * 2 - 1);
    return Math.max(0, capped + jitter);
}

/**
 * Check if an error is retryable (network errors, 429s, timeouts).
 */
export function isRetryableError(error: unknown): boolean {
    if (error instanceof TypeError) return true; // Network error
    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        return msg.includes('429') || msg.includes('timeout') || msg.includes('network') || msg.includes('fetch');
    }
    return false;
}

/**
 * Execute a function with retry logic.
 * @param fn - The async function to execute
 * @param config - Retry configuration
 * @param shouldRetry - Optional predicate to determine if a specific error should be retried
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    config = DEFAULT_RETRY_CONFIG,
    shouldRetry: (error: unknown, attempt: number) => boolean = (err) => isRetryableError(err)
): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt < config.maxRetries && shouldRetry(error, attempt)) {
                const delay = calculateRetryDelay(attempt, config);
                await new Promise(r => setTimeout(r, delay));
            } else {
                break;
            }
        }
    }
    throw lastError;
}
