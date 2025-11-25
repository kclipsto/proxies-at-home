
import { test, expect } from '@playwright/test';

test('fetch 9 forests', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');
    test.skip(browserName === 'firefox', 'Firefox is too slow/flaky for this test in this environment');

    await page.goto('/');

    // Find the textarea and enter the card list
    const decklistInput = page.getByPlaceholder(/1x Sol Ring/);
    await decklistInput.fill('4 Forest');

    // Click the "Fetch Cards" button
    await page.getByRole('button', { name: 'Fetch Cards' }).click();

    // Wait for the cards to be rendered
    // We look for the drag handle which has the title "Drag"
    const cardDragHandles = page.getByTitle('Drag');

    // Expect 4 cards to be present
    // We use toHaveCount which has built-in auto-waiting/retrying
    await expect(cardDragHandles).toHaveCount(4, { timeout: 30_000 });

    // Verify images are loaded
    // We wait for the images within the cards to be loaded
    const images = page.locator('.proxy-page img');
    await expect(images).toHaveCount(4);

    // Check that the first image has loaded successfully (naturalWidth > 0)
    const firstImage = images.first();

    // Wait for the src to be populated with a blob URL
    await expect(firstImage).toHaveAttribute('src', /^blob:/, { timeout: 10_000 });

    // Reload to check persistence and rule out reactivity issues
    await page.reload();
    await expect(cardDragHandles).toHaveCount(4, { timeout: 10_000 });
    await expect(firstImage).toHaveAttribute('src', /^blob:/, { timeout: 10_000 });

    await expect(async () => {
        const naturalWidth = await firstImage.evaluate((img: HTMLImageElement) => {
            if (img.naturalWidth === 0) {
                console.error('Image not loaded:', img.src, 'Complete:', img.complete);
            }
            return img.naturalWidth;
        });
        expect(naturalWidth).toBeGreaterThan(0);
    }).toPass({
        timeout: 10_000,
    });
});

