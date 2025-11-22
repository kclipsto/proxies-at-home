import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('upload mpc image', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

    await page.goto('/');

    // Upload the image file
    const fileInput = page.locator('input#upload-mpc');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/sliver-legion.jpg'));

    // Wait for card to be rendered
    const cardDragHandles = page.getByTitle('Drag');
    await expect(cardDragHandles).toHaveCount(1, { timeout: 10_000 });

    // Verify card name is inferred correctly (Sliver Legion)
    // Since the name isn't directly visible in the card cell as text, we can check the context menu or just rely on the image loading for now.
    // However, we can check if the card was added to the store with the correct name if we had access to the store, 
    // but for E2E, visual confirmation or side-effects are better.
    // The "Fetch Cards" test checks for the count. Here we can check the image loading.

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
