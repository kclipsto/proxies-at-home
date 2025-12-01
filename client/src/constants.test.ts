import { describe, it, expect } from 'vitest';
import { apiUrl, API_BASE } from './constants';

describe('constants', () => {
    describe('apiUrl', () => {
        it('should return path prefixed with slash if API_BASE is empty', () => {
            // Assuming API_BASE is empty in test env by default or we can mock it
            // But API_BASE is a const exported from the module, so it's hard to change after import.
            // However, apiUrl reads API_BASE.

            // If API_BASE is "", apiUrl("foo") -> "/foo"
            // If API_BASE is "http://localhost:3000", apiUrl("foo") -> "http://localhost:3000/foo"

            // Since API_BASE is determined at module load time, we might need to reset modules to test different env vars.
            // But let's first see what it does with the current env.

            const path = 'test/path';
            const result = apiUrl(path);

            if (API_BASE) {
                expect(result).toBe(`${API_BASE}/${path}`);
            } else {
                expect(result).toBe(`/${path}`);
            }
        });

        it('should handle leading slashes in path', () => {
            const result = apiUrl('/test/path');
            if (API_BASE) {
                expect(result).toBe(`${API_BASE}/test/path`);
            } else {
                expect(result).toBe('/test/path');
            }
        });

        it('should handle multiple leading slashes', () => {
            const result = apiUrl('///test/path');
            if (API_BASE) {
                expect(result).toBe(`${API_BASE}/test/path`);
            } else {
                expect(result).toBe('/test/path');
            }
        });
    });
});
