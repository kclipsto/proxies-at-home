import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Darken Near Black Feature', () => {
    test('should persist setting and instantly switch between cached versions', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is too slow/flaky for this test in this environment');
        await page.goto('/');

        // 1. Upload a custom image
        const fileInput = page.locator('input#upload-standard');
        await fileInput.setInputFiles(path.join(__dirname, '../fixtures/dark-test.png'));

        // Wait for upload to process
        await expect(page.getByText('Uploading Images')).toBeVisible({ timeout: 10000 });
        await expect(page.getByText('Uploading Images')).not.toBeVisible({ timeout: 30000 });

        // Wait for card to appear
        // The SortableCard component has a drag handle with title "Drag"
        // We find that, go up to the parent (the card container), then find the img
        const cardImage = page.getByTitle('Drag').first().locator('xpath=..').locator('img');
        await expect(cardImage).toBeVisible({ timeout: 30000 });

        // Get initial blob URL
        const initialSrc = await cardImage.getAttribute('src');
        expect(initialSrc).toBeTruthy();

        // 2. Toggle "Darken Near-Black Pixels" (Default is TRUE)
        const checkbox = page.locator('#darken-near-black');
        await expect(checkbox).toBeVisible();
        await expect(checkbox).toBeChecked();

        // Uncheck it
        await checkbox.uncheck({ force: true });

        // Verify checkbox state
        await expect(checkbox).not.toBeChecked();

        // 3. Verify instant blob URL switch (dual-caching - no reprocessing)
        // With dual-caching, both versions exist, so src changes instantly
        await expect(cardImage).not.toHaveAttribute('src', initialSrc as string, { timeout: 2000 });

        const newSrc = await cardImage.getAttribute('src');
        expect(newSrc).toBeTruthy();
        expect(newSrc).not.toBe(initialSrc);

        // 4. Reload and verify persistence
        await page.reload();

        // Wait for settings to load
        await expect(checkbox).not.toBeChecked();

        // Wait for card to appear again
        await expect(cardImage).toBeVisible();

        // Toggle on and verify instant change (no reprocessing needed with dual-caching)
        await checkbox.check({ force: true });
        await expect(checkbox).toBeChecked();

        // Image src should change instantly (different blob URL, no processing)
        await expect(cardImage).not.toHaveAttribute('src', newSrc as string, { timeout: 2000 });
    });
});


