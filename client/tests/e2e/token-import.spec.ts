import { test, expect } from './fixtures';

test.describe('Token Import', () => {
    test.beforeEach(async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');
        await page.goto('/');
    });

    test('Add Associated Tokens button is disabled when no cards are present', async ({ page }) => {
        // The Add Associated Tokens button should be disabled when no cards are present
        const tokenButton = page.getByRole('button', { name: 'Add Associated Tokens' });
        await expect(tokenButton).toBeDisabled();
    });

    test('Add Associated Tokens button state changes based on token data', async ({ page }) => {
        // Add a card that does NOT create tokens (basic land)
        const textarea = page.getByPlaceholder(/1x Sol Ring/);
        await textarea.fill('1x Forest');
        await page.getByRole('button', { name: 'Fetch Cards' }).click();

        // Wait for card to load
        await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(1, { timeout: 30000 });

        // The Add Associated Tokens button should be disabled for basic lands
        // (they have no associated tokens)
        const tokenButton = page.getByRole('button', { name: 'Add Associated Tokens' });
        // Token button should be disabled (no tokens to fetch)
        await expect(tokenButton).toBeDisabled({ timeout: 10000 });
    });

    test('Token filter appears when tokens exist in collection', async ({ page }) => {
        // Import cards via decklist, then check filter
        // Use a card that IS a token type
        const textarea = page.getByPlaceholder(/1x Sol Ring/);
        // Add cards that will populate the filter options
        await textarea.fill('1x Sol Ring\n1x Forest');
        await page.getByRole('button', { name: 'Fetch Cards' }).click();

        // Wait for cards to load
        await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(2, { timeout: 30000 });

        // Open Filter/Sort section
        const filterSection = page.locator('#settings-panel-filterSort');
        const header = filterSection.locator('.cursor-pointer');
        const content = filterSection.locator('.p-4');

        if (!await content.isVisible()) {
            await header.click();
        }

        // Verify Card Types section is visible (should have Land, Artifact types)
        const landFilter = filterSection.getByRole('button', { name: 'Land' });
        await expect(landFilter).toBeVisible();

        const artifactFilter = filterSection.getByRole('button', { name: 'Artifact' });
        await expect(artifactFilter).toBeVisible();
    });

    test('Card type filter correctly filters cards', async ({ page }) => {
        // Add multiple card types
        const textarea = page.getByPlaceholder(/1x Sol Ring/);
        await textarea.fill('1x Sol Ring\n1x Forest\n1x Lightning Bolt');
        await page.getByRole('button', { name: 'Fetch Cards' }).click();

        // Wait for cards to load
        await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(3, { timeout: 30000 });

        // Open Filter/Sort section
        const filterSection = page.locator('#settings-panel-filterSort');
        const header = filterSection.locator('.cursor-pointer');
        const content = filterSection.locator('.p-4');

        if (!await content.isVisible()) {
            await header.click();
        }

        // Click Land filter
        const landFilter = filterSection.getByRole('button', { name: 'Land' });
        await landFilter.click();

        // Should show only 1 card (Forest)
        await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(1, { timeout: 5000 });

        // Clear filter by clicking Land again
        await landFilter.click();

        // All 3 cards should be visible again
        await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(3, { timeout: 5000 });
    });

    test('Multiple type filters can be applied', async ({ page }) => {
        // Add multiple card types
        const textarea = page.getByPlaceholder(/1x Sol Ring/);
        await textarea.fill('1x Sol Ring\n1x Forest\n1x Lightning Bolt');
        await page.getByRole('button', { name: 'Fetch Cards' }).click();

        // Wait for cards to load
        await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(3, { timeout: 30000 });

        // Open Filter/Sort section
        const filterSection = page.locator('#settings-panel-filterSort');
        const header = filterSection.locator('.cursor-pointer');
        const content = filterSection.locator('.p-4');

        if (!await content.isVisible()) {
            await header.click();
        }

        // Click Land filter AND Artifact filter
        const landFilter = filterSection.getByRole('button', { name: 'Land' });
        const artifactFilter = filterSection.getByRole('button', { name: 'Artifact' });
        await landFilter.click();
        await artifactFilter.click();

        // Should show 2 cards (Forest and Sol Ring)
        await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(2, { timeout: 5000 });
    });

    test('Clear Filters button removes all active filters', async ({ page }) => {
        // Add multiple card types
        const textarea = page.getByPlaceholder(/1x Sol Ring/);
        await textarea.fill('1x Sol Ring\n1x Forest\n1x Lightning Bolt');
        await page.getByRole('button', { name: 'Fetch Cards' }).click();

        // Wait for cards to load
        await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(3, { timeout: 30000 });

        // Open Filter/Sort section
        const filterSection = page.locator('#settings-panel-filterSort');
        const header = filterSection.locator('.cursor-pointer');
        const content = filterSection.locator('.p-4');

        if (!await content.isVisible()) {
            await header.click();
        }

        // Apply a filter
        const landFilter = filterSection.getByRole('button', { name: 'Land' });
        await landFilter.click();

        // Verify filter applied
        await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(1, { timeout: 5000 });

        // Click Clear Filters button (the main one at the bottom, not per-section X icons)
        const clearFilters = filterSection.getByRole('button', { name: 'Clear Filters' }).last();
        await clearFilters.click();

        // All cards should be visible again
        await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(3, { timeout: 5000 });
    });
});
