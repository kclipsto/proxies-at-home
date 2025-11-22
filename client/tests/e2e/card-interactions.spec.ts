import { test, expect } from '@playwright/test';

test.describe('Card Interactions', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');

        // Add some basic lands for testing
        const deckInput = page.getByPlaceholder('1x Sol Ring');
        await deckInput.fill('2x Forest');
        await page.getByRole('button', { name: 'Fetch Cards' }).click();

        // Wait for cards to load
        await expect(page.getByTitle('Drag')).toHaveCount(2, { timeout: 15000 });
    });

    test('should duplicate a card via context menu', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

        // Right click the first card
        const firstCard = page.locator('.proxy-page img').first();
        await firstCard.click({ button: 'right' });

        // Click Duplicate
        await page.getByRole('button', { name: 'Duplicate' }).click();

        // Verify count increased to 3
        await expect(page.getByTitle('Drag')).toHaveCount(3);
    });

    test('should delete a card via context menu', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

        // Right click the first card
        const firstCard = page.locator('.proxy-page img').first();
        await firstCard.click({ button: 'right' });

        // Click Delete
        await page.getByRole('button', { name: 'Delete' }).click();

        // Verify count decreased to 1
        await expect(page.getByTitle('Drag')).toHaveCount(1);
    });

    test('should change card artwork', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

        const firstCard = page.locator('.proxy-page img').first();

        // Ensure initial image is loaded
        await expect(firstCard).toHaveAttribute('src', /^blob:/, { timeout: 15000 });
        const initialSrc = await firstCard.getAttribute('src');
        expect(initialSrc).toBeTruthy();

        // Click to open modal
        await firstCard.click();

        // Wait for modal
        await expect(page.getByText('Select Artwork for Forest')).toBeVisible();

        // Click "Get All Prints" to ensure we have options
        await page.getByRole('button', { name: 'Get All Prints' }).click();

        // Wait for at least 2 images
        await expect(page.locator('div.grid > img')).not.toHaveCount(1, { timeout: 10000 });

        // Find an image that is NOT selected (does not have green border)
        // We use .last() to be more likely to pick a different one if the first few are similar or if the first is selected
        const unselectedImage = page.locator('div.grid > img:not(.border-green-500)').last();
        await unselectedImage.scrollIntoViewIfNeeded();
        await unselectedImage.click();

        // Modal should close
        await expect(page.getByText('Select Artwork for Forest')).not.toBeVisible();

        // Verify card image changed
        await expect(async () => {
            const newSrc = await firstCard.getAttribute('src');
            expect(newSrc).toBeTruthy();
            expect(newSrc).not.toBe(initialSrc);
        }).toPass({ timeout: 10000 });
    });

    test('should change card identity (Forest -> Mountain)', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

        const firstCard = page.locator('.proxy-page img').first();
        await expect(firstCard).toHaveAttribute('src', /^blob:/, { timeout: 15000 });
        const initialSrc = await firstCard.getAttribute('src');

        // Click to open modal
        await firstCard.click();

        // Type "Mountain" in search
        await page.getByPlaceholder('Replace with a different card...').fill('Mountain');
        await page.getByRole('button', { name: 'Search' }).click();

        // Wait for "Select Artwork for Mountain" header
        await expect(page.getByText('Select Artwork for Mountain')).toBeVisible();

        // Select the first image (it should be a Mountain now)
        await page.locator('div.grid > img').first().click();

        // Modal closes
        await expect(page.getByText('Select Artwork for Mountain')).not.toBeVisible();

        // Verify we still have 2 cards
        await expect(page.getByTitle('Drag')).toHaveCount(2);

        // Verify image changed
        await expect(async () => {
            const newSrc = await firstCard.getAttribute('src');
            expect(newSrc).not.toBe(initialSrc);
        }).toPass({ timeout: 10000 });
    });

    test('should change all card artworks', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

        const cards = page.locator('.proxy-page img');
        const firstCard = cards.nth(0);
        const secondCard = cards.nth(1);

        await expect(firstCard).toHaveAttribute('src', /^blob:/, { timeout: 15000 });
        await expect(secondCard).toHaveAttribute('src', /^blob:/, { timeout: 15000 });

        const initialSrc1 = await firstCard.getAttribute('src');
        const initialSrc2 = await secondCard.getAttribute('src');

        // Click first card
        await firstCard.click();

        // Check "Apply to all"
        await page.getByLabel('Apply to all cards named "Forest"').check();

        // Get more prints to find a different one
        await page.getByRole('button', { name: 'Get All Prints' }).click();
        await expect(page.locator('div.grid > img')).not.toHaveCount(1, { timeout: 10000 });

        // Pick an unselected image
        const unselectedImage = page.locator('div.grid > img:not(.border-green-500)').last();
        await unselectedImage.scrollIntoViewIfNeeded();
        await unselectedImage.click();

        // Verify BOTH cards changed
        await expect(async () => {
            const newSrc1 = await firstCard.getAttribute('src');
            const newSrc2 = await secondCard.getAttribute('src');
            expect(newSrc1).not.toBe(initialSrc1);
            expect(newSrc2).not.toBe(initialSrc2);
            expect(newSrc1).toBe(newSrc2);
        }).toPass({ timeout: 10000 });
    });
});
