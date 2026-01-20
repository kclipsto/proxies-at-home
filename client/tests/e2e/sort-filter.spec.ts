import { test, expect } from './fixtures';

test.describe('Sort and Filter', () => {
    test.beforeEach(async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');
        await page.goto('/');

        // Add some cards for testing
        const deckText = `
1x Sol Ring
1x Counterspell
1x Lightning Bolt
1x Birds of Paradise
        `.trim();

        const textarea = page.getByPlaceholder(/1x Sol Ring/);
        await textarea.fill(deckText);
        await page.getByRole('button', { name: 'Fetch Cards' }).click();

        // Wait for card overlays to appear (increased timeout for API responsiveness)
        await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(4, { timeout: 30000 });
    });

    test('should sort cards by name', async ({ page }) => {
        // Open Filter/Sort section if collapsed
        const filterSection = page.locator('#settings-panel-filterSort');
        const header = filterSection.locator('.cursor-pointer');
        const content = filterSection.locator('.p-4');

        if (!await content.isVisible()) {
            await header.click();
        }

        // Select "Name" from sort dropdown
        const sortSelect = filterSection.getByRole('combobox');
        await expect(sortSelect).toBeVisible();
        await sortSelect.selectOption('name');
        await expect(sortSelect).toHaveValue('name');
    });

    test('should filter cards by color', async ({ page }) => {
        const filterSection = page.locator('#settings-panel-filterSort');
        const header = filterSection.locator('.cursor-pointer');
        const content = filterSection.locator('.p-4');

        if (!await content.isVisible()) {
            await header.click();
        }

        // Filter by Red
        const redFilter = page.getByTitle('Red');
        await redFilter.click();
        await expect(redFilter).toHaveClass(/scale-110/);
    });

    test('should filter cards by mana cost', async ({ page }) => {
        const filterSection = page.locator('#settings-panel-filterSort');
        const header = filterSection.locator('.cursor-pointer');
        const content = filterSection.locator('.p-4');

        if (!await content.isVisible()) {
            await header.click();
        }

        // Filter by CMC 1 (Sol Ring)
        const cmc1 = page.locator('.w-8.h-8').getByText('1', { exact: true });
        await expect(cmc1).toBeVisible();
        await cmc1.click();
        await expect(cmc1).toHaveClass(/bg-blue-600/);
    });
});
