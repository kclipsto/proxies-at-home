import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('ZIP Export', () => {
    test('should download a ZIP file with correct filename', async ({ page }) => {
        await page.goto('/');

        // Upload MPC XML to populate cards
        const fileInput = page.locator('input#import-mpc-xml');
        await fileInput.setInputFiles(path.join(__dirname, '../fixtures/mpc-cards.xml'));

        // Wait for cards to appear
        await expect(page.getByTitle('Drag')).toHaveCount(2, { timeout: 10000 });

        // Setup download listener
        const downloadPromise = page.waitForEvent('download');

        // Click Export ZIP button
        // Button text is "Export Card Images (.zip)"
        await page.getByRole('button', { name: 'Export Card Images (.zip)' }).click();

        const download = await downloadPromise;

        // Verify filename
        expect(download.suggestedFilename()).toMatch(/^card_images_.*\.zip$/);
    });
});
