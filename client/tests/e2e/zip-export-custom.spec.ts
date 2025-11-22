import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('ZIP Export Custom', () => {
    test('should download a non-empty ZIP file for custom uploads', async ({ page }) => {
        await page.goto('/');

        page.on('console', msg => console.log(`Browser Console: ${msg.text()}`));

        // Wait for the upload section to be visible
        await expect(page.getByText('Upload Other Images')).toBeVisible();

        // Upload a custom image
        const fileInput = page.locator('input#upload-standard');
        await fileInput.setInputFiles(path.join(__dirname, '../fixtures/irenicus.png'));

        // Wait for card to appear
        await expect(page.getByTitle('Drag')).toHaveCount(1, { timeout: 30000 });

        // Setup download listener
        const downloadPromise = page.waitForEvent('download');

        // Click Export ZIP button
        await page.getByRole('button', { name: 'Export Card Images (.zip)' }).click();

        const download = await downloadPromise;
        const downloadPath = await download.path();

        // Verify filename
        expect(download.suggestedFilename()).toMatch(/^card_images_.*\.zip$/);

        // Verify file size is significantly larger than an empty zip (22 bytes)
        const stats = fs.statSync(downloadPath);
        console.log(`Downloaded ZIP size: ${stats.size} bytes`);
        expect(stats.size).toBeGreaterThan(1000); // Arbitrary threshold, but image is ~1.2MB
    });
});
