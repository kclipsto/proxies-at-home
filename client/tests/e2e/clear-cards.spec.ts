import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Clear Cards', () => {
    test('should clear all cards after confirmation', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

        await page.goto('/');

        // 1. Populate with cards (using XML upload)
        const fileInput = page.locator('input#import-mpc-xml');
        await fileInput.setInputFiles(path.join(__dirname, '../fixtures/mpc-cards.xml'));

        // Wait for cards to appear
        await expect(page.getByTitle('Drag')).toHaveCount(2, { timeout: 10000 });

        // 2. Click "Clear Cards"
        await page.getByRole('button', { name: 'Clear Cards' }).click();

        // 3. Expect Confirmation Modal
        const modal = page.locator('text=Confirm Clear Cards');
        await expect(modal).toBeVisible();

        // 4. Click "Yes, I'm sure"
        await page.getByRole('button', { name: "Yes, I'm sure" }).click();

        // 5. Verify cards are gone
        await expect(page.getByTitle('Drag')).toHaveCount(0);

        // Verify modal is gone
        await expect(modal).not.toBeVisible();
    });

    test('should not show modal if no cards present', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

        await page.goto('/');

        // Ensure no cards initially
        await expect(page.getByTitle('Drag')).toHaveCount(0);

        // Click Clear Cards
        await page.getByRole('button', { name: 'Clear Cards' }).click();

        // Modal should NOT appear
        await expect(page.locator('text=Confirm Clear Cards')).not.toBeVisible();
    });
});
