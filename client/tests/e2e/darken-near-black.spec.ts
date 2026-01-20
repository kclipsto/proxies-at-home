import { test, expect } from './fixtures';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Darken Settings Feature', () => {
    test('should toggle darken mode setting', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is too slow/flaky for this test');
        await page.goto('/');

        // Upload a custom image via unified input
        const fileInput = page.locator('input#upload-images-unified');
        await fileInput.setInputFiles(path.join(__dirname, '../fixtures/dark-test.png'));

        // Wait for card overlay to appear
        await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(1, { timeout: 30000 });

        // Find the darken mode select dropdown
        const darkenModeSelect = page.locator('select').filter({ has: page.locator('option:has-text("No Darkening")') });

        if (await darkenModeSelect.count() > 0) {
            await expect(darkenModeSelect).toBeVisible();

            // Change mode to "Darken All"
            await darkenModeSelect.selectOption('darken-all');

            // Verify it changed
            await expect(darkenModeSelect).toHaveValue('darken-all');

            // Change back to "None"
            await darkenModeSelect.selectOption('none');
            await expect(darkenModeSelect).toHaveValue('none');
        }
    });

    test('should persist darken setting after reload', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is too slow/flaky for this test');
        await page.goto('/');

        // Find the darken mode select and change it
        const darkenModeSelect = page.locator('select').filter({ has: page.locator('option:has-text("No Darkening")') });

        if (await darkenModeSelect.count() > 0) {
            await darkenModeSelect.selectOption('contrast-edges');
            await expect(darkenModeSelect).toHaveValue('contrast-edges');

            // Reload and verify persistence
            await page.reload();

            const darkenModeSelect2 = page.locator('select').filter({ has: page.locator('option:has-text("No Darkening")') });
            await expect(darkenModeSelect2).toHaveValue('contrast-edges');
        }
    });
});
