import type { CardOverrides } from '../../../shared/types';

/**
 * Fast hash for overrides comparison (djb2 algorithm).
 * Used to precompute a hash for memo comparison instead of JSON.stringify on every render.
 */
export function hashOverrides(overrides: CardOverrides | undefined): string {
    if (!overrides) return '';
    const str = JSON.stringify(overrides);
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
}
