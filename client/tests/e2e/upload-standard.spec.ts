import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('upload standard image', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

    await page.goto('/');

    // Upload the image file to the "Other" input
    const fileInput = page.locator('input#upload-standard');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/irenicus.png'));

    // Wait for card to be rendered
    const cardDragHandles = page.getByTitle('Drag');
    await expect(cardDragHandles).toHaveCount(1, { timeout: 10_000 });

    // Check that the image has loaded successfully
    const images = page.locator('.proxy-page img');
    const firstImage = images.first();

    // Wait for the src to be populated with a blob URL
    await expect(firstImage).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });

    // Wait for the image to be decoded
    await expect(async () => {
        const naturalWidth = await firstImage.evaluate((el: HTMLImageElement) => el.naturalWidth);
        expect(naturalWidth).toBeGreaterThan(0);
    }).toPass({ timeout: 30_000 });
});
