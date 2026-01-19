import { test, expect } from './fixtures';

/**
 * ArtworkModal Toggle Buttons - Core E2E Tests
 */
test.describe('ArtworkModal Toggle Buttons', () => {
    test('should open modal and show toggle buttons', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');
        await page.goto('/');

        // Add a card
        await page.getByPlaceholder('1x Sol Ring').fill('1x Forest');
        await page.getByRole('button', { name: 'Fetch Cards' }).click();
        await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(1, { timeout: 30000 });

        // Open modal
        await page.locator('[data-dnd-sortable-item]').first().click();
        await expect(page.getByText(/Select Artwork for/)).toBeVisible({ timeout: 5000 });

        // Verify toggle buttons exist
        await expect(page.locator('button:has-text("Forest")').first()).toBeVisible();
        await expect(page.locator('button').filter({ hasText: 'Scryfall' }).first()).toBeVisible();
        await expect(page.locator('button').filter({ hasText: 'MPC' }).first()).toBeVisible();
    });
});

test.describe('AdvancedSearch Toggle Buttons', () => {
    test('should display Scryfall and MPC Autofill toggle buttons', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');
        await page.goto('/');
        await page.getByRole('button', { name: 'Advanced Search' }).click();
        await expect(page.getByPlaceholder('Search card name...')).toBeVisible({ timeout: 5000 });

        await expect(page.locator('button').filter({ hasText: 'Scryfall' }).first()).toBeVisible();
        await expect(page.locator('button').filter({ hasText: 'MPC Autofill' }).first()).toBeVisible();
    });
});
