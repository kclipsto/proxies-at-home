import { test, expect } from './fixtures';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('ZIP Export Custom', () => {
    test('should download a non-empty ZIP file for custom uploads', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky with downloads in this environment');
        await page.goto('/');

        // Upload a custom image via unified input
        const fileInput = page.locator('input#upload-images-unified');
        await fileInput.setInputFiles(path.join(__dirname, '../fixtures/irenicus.png'));

        // Wait for card to appear
        await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(1, { timeout: 30000 });

        // Setup download listener
        const downloadPromise = page.waitForEvent('download');

        // Click Export Card Images button (it's a split button with label "Export Card Images")
        const exportButton = page.locator('button:has-text("Export Card Images")').first();
        await expect(exportButton).toBeVisible({ timeout: 5000 });
        await exportButton.click();

        const download = await downloadPromise;
        const downloadPath = await download.path();

        // Verify filename
        expect(download.suggestedFilename()).toMatch(/^card_images_.*\.zip$/);

        // Verify file size is significantly larger than an empty zip
        const stats = fs.statSync(downloadPath);
        expect(stats.size).toBeGreaterThan(1000);
    });
});
