import { test as base, expect } from '@playwright/test';

/**
 * Extended test fixture for E2E tests.
 * 
 * Note: Test isolation is handled by Playwright's storage isolation (storageState: undefined).
 * Each test gets its own browser context with fresh storage.
 */

export const test = base.extend({
    // Extend page fixture for any test-specific setup if needed
    page: async ({ page }, use) => {
        // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright's `use` is not a React hook
        await use(page);
    },
});

export { expect };
