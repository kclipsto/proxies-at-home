/**
 * Unified result types for import operations.
 * Provides consistent error handling across the import pipeline.
 */

import type { ImportIntent } from './importParsers';

export interface ImportSuccess {
    status: 'success';
    cardUuids: string[];
    count: number;
}

export interface ImportPartialSuccess {
    status: 'partial';
    cardUuids: string[];
    count: number;
    failures: ImportFailure[];
}

export interface ImportError {
    status: 'error';
    error: string;
    retryable: boolean;
}

export interface ImportFailure {
    intent: ImportIntent;
    error: string;
    retryable: boolean;
}

export type ImportResult = ImportSuccess | ImportPartialSuccess | ImportError;

/**
 * Type guard for successful imports (full or partial).
 */
export function isImportSuccessful(result: ImportResult): result is ImportSuccess | ImportPartialSuccess {
    return result.status === 'success' || result.status === 'partial';
}

/**
 * Create a success result.
 */
export function createSuccessResult(cardUuids: string[]): ImportSuccess {
    return {
        status: 'success',
        cardUuids,
        count: cardUuids.length,
    };
}

/**
 * Create a partial success result with failures.
 */
export function createPartialResult(
    cardUuids: string[],
    failures: ImportFailure[]
): ImportPartialSuccess {
    return {
        status: 'partial',
        cardUuids,
        count: cardUuids.length,
        failures,
    };
}

/**
 * Create an error result.
 */
export function createErrorResult(error: string, retryable = false): ImportError {
    return {
        status: 'error',
        error,
        retryable,
    };
}
