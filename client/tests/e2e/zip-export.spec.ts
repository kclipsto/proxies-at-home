import { test, expect } from './fixtures';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('ZIP Export', () => {
    test('should download a ZIP file with correct filename', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky with downloads');
        await page.goto('/');

        // Upload MPC XML to populate cards
        const fileInput = page.locator('input#import-mpc-xml');
        await fileInput.setInputFiles(path.join(__dirname, '../fixtures/mpc-cards.xml'));

        // Wait for cards to appear
        await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(2, { timeout: 30000 });

        // Setup download listener
        const downloadPromise = page.waitForEvent('download');

        // Click Export Card Images button
        const exportButton = page.locator('button:has-text("Export Card Images")').first();
        await expect(exportButton).toBeVisible({ timeout: 5000 });
        await exportButton.click();

        const download = await downloadPromise;

        // Verify filename
        expect(download.suggestedFilename()).toMatch(/^card_images_.*\.zip$/);
    });
});
