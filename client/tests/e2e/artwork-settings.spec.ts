import { test, expect } from './fixtures';

test('Artwork Modal Opens', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

    await page.goto('/');

    // Add a card
    await page.getByPlaceholder(/1x Sol Ring/).fill('1 Forest');
    await page.getByRole('button', { name: 'Fetch Cards' }).click();
    await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(1, { timeout: 30000 });

    // Open Artwork Modal
    await page.locator('[data-dnd-sortable-item]').first().click();
    await expect(page.getByText(/Select Artwork for/)).toBeVisible({ timeout: 5000 });
});
