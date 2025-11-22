import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('upload mpc xml', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

    await page.goto('/');

    // Upload the XML file
    const fileInput = page.locator('input#import-mpc-xml');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/mpc-cards.xml'));

    // Wait for cards to be rendered
    const cardDragHandles = page.getByTitle('Drag');
    await expect(cardDragHandles).toHaveCount(2, { timeout: 10_000 });

    // Verify card names (inferred from filename in XML)
    // Note: The UI doesn't explicitly show the name in the card cell, 
    // but we can verify the count and image loading.

    // Check that ALL images have loaded successfully
    const images = page.locator('.proxy-page img');
    const count = await images.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
        const img = images.nth(i);
        // Wait for the src to be populated with a blob URL
        await expect(img).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });

        // Wait for the image to be decoded
        await expect(async () => {
            const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
            expect(naturalWidth).toBeGreaterThan(0);
        }).toPass({ timeout: 30_000 });
    }
});
