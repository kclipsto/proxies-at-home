import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('upload both mpc and standard images', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');
    test.slow(); // Mark as slow - triples timeout for resource-intensive parallel execution

    await page.goto('/');

    const fixturePath = path.join(__dirname, '../fixtures/sliver-legion.jpg');

    // Upload to MPC input
    await page.locator('input#upload-mpc').setInputFiles(fixturePath);

    // Upload to Standard input
    await page.locator('input#upload-standard').setInputFiles(fixturePath);

    // Wait for cards to be rendered (should be 2)
    const cardDragHandles = page.getByTitle('Drag');
    await expect(cardDragHandles).toHaveCount(2, { timeout: 30_000 });

    // Check that ALL images have loaded successfully
    const images = page.locator('.proxy-page img');
    await expect(images).toHaveCount(2, { timeout: 30_000 });
    const count = await images.count();

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
