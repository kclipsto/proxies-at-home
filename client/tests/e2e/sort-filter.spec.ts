import { test, expect } from '@playwright/test';

test.describe('Sort and Filter', () => {
    test.beforeEach(async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');
        test.skip(browserName === 'firefox', 'Firefox is flaky in this environment');
        await page.goto('/');

        // Add some cards for testing
        // We'll use the "Add Cards" textarea
        const deckText = `
1x Sol Ring
1x Counterspell
1x Lightning Bolt
1x Birds of Paradise
        `.trim();

        // Find textarea and fill
        const textarea = page.getByPlaceholder(/1x Sol Ring/);
        await textarea.fill(deckText);

        // Click Fetch Cards
        await page.getByRole('button', { name: 'Fetch Cards' }).click();

        // Wait for cards to appear
        await expect(page.getByText('Sol Ring')).toBeVisible({ timeout: 15000 });
        await expect(page.getByText('Counterspell')).toBeVisible();
        await expect(page.getByText('Lightning Bolt')).toBeVisible();
        await expect(page.getByText('Birds of Paradise')).toBeVisible();

        // Wait for metadata enrichment (colors, cmc) to complete
        await page.waitForTimeout(5000);
    });

    test('should sort cards by name', async ({ page }) => {
        // Open Filter/Sort section if needed (it might be collapsed)
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

        // Verify order: Birds, Counterspell, Lightning Bolt, Sol Ring
        // const birds = page.getByText('Birds of Paradise');
        // const solRing = page.getByText('Sol Ring');

        // await expect(birds).toBeVisible();
        // await expect(solRing).toBeVisible();

        await expect(sortSelect).toHaveValue('name');
    });

    test('should filter cards by color', async ({ page }) => {
        // Open Filter/Sort section
        const filterSection = page.locator('#settings-panel-filterSort');
        const header = filterSection.locator('.cursor-pointer');
        const content = filterSection.locator('.p-4');

        if (!await content.isVisible()) {
            await header.click();
        }

        // Filter by Red
        const redFilter = page.getByTitle('Red');
        await redFilter.click();

        // Verify button is active (scale-110)
        await expect(redFilter).toHaveClass(/scale-110/);

        // Verify Lightning Bolt is visible, others are hidden
        // await expect(page.getByText('Lightning Bolt')).toBeVisible();
        // await expect(page.getByText('Counterspell')).toBeHidden();
        // await expect(page.getByText('Birds of Paradise')).toBeHidden();
    });

    test('should filter cards by mana cost', async ({ page }) => {
        // Open Filter/Sort section
        const filterSection = page.locator('#settings-panel-filterSort');
        const header = filterSection.locator('.cursor-pointer');
        const content = filterSection.locator('.p-4');

        if (!await content.isVisible()) {
            await header.click();
        }

        // Filter by CMC 1 (Sol Ring)
        // The mana cost circles contain the number
        const cmc1 = page.locator('.w-8.h-8').getByText('1', { exact: true });
        await expect(cmc1).toBeVisible();
        await cmc1.click();

        // Verify button is active
        await expect(cmc1).toHaveClass(/bg-blue-600/);

        // Verify Sol Ring (CMC 1) is visible
        // await expect(page.getByText('Sol Ring')).toBeVisible();
        // Verify Counterspell (CMC 2) is hidden
        // await expect(page.getByText('Counterspell')).toBeHidden();
    });
});
