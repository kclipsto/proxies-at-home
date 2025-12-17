import { test, expect } from '@playwright/test';

test.describe('Advanced Search & Artwork Modal', () => {
    test.beforeEach(async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');
        await page.goto('/');
    });

    test('should duplicate slides for looping when few results are found', async ({ page }) => {
        // Open Advanced Search (using the main "Add Card" button if available, or via Artwork Modal)
        // Let's use the main "Advanced Search" button
        await page.getByRole('button', { name: 'Advanced Search' }).click();

        // Search for a term that returns few results (e.g. "Time Wa" -> "Time Walk", "Time Warp")
        await page.getByPlaceholder('Search card name...').fill('Time Wa');

        // Wait for results (images in carousel)
        // Note: Swiper duplicates slides, so we look for any visible one
        await expect(page.locator('img[alt="Time Walk"] >> visible=true').first()).toBeVisible({ timeout: 10000 });

        // Check number of slides. 
        // Even if there are only ~2-3 results, we expect >= 12 slides due to duplication
        const slideCount = await page.locator('.swiper-slide').count();
        expect(slideCount).toBeGreaterThanOrEqual(12);

        // Select a card (click the + button)
        // We need to ensure the correct slide is active.
        // Since we just searched, the first result should be active.
        // But Swiper loop might have centered it.
        // Let's assume the first result is active.
        // Let's assume the first result is active.
        // The button has <Plus /> icon. It doesn't have text.
        // But it has `color="indigo"`.
        // Let's use a locator for the button.
        // It's the button next to the input.
        await page.locator('.flex.gap-2.h-12 button.aspect-square').click();

        // Modal should stay open (keepOpenOnAdd is true for DecklistUploader's AdvancedSearch)
        await expect(page.locator('.fixed.inset-0.z-\\[100\\]')).toBeVisible();

        // Success toast should appear with the card name
        await expect(page.getByText(/Added Time/)).toBeVisible({ timeout: 2000 });

        // Search input should still have the query (not cleared)
        await expect(page.getByPlaceholder('Search card name...')).toHaveValue('Time Wa');

        // Close modal manually
        await page.locator('.fixed.inset-0.z-\\[100\\]').first().click({ position: { x: 10, y: 10 } });

        // Re-open Advanced Search to verify it was properly closed
        await page.getByRole('button', { name: 'Advanced Search' }).click();

        // Check if input is empty (fresh modal open)
        await expect(page.getByPlaceholder('Search card name...')).toBeEmpty();
    });

    test('should show "Get All Prints" button in sticky footer', async ({ page }) => {
        // Add a card first
        const deckInput = page.getByPlaceholder('1x Sol Ring');
        await deckInput.fill('1x Forest');
        await page.getByRole('button', { name: 'Fetch Cards' }).click();
        await expect(page.getByTitle('Drag')).toHaveCount(1, { timeout: 60000 });

        // Open Artwork Modal
        const cardImage = page.locator('.proxy-page img').first();
        await expect(cardImage).toHaveAttribute('src', /^blob:/, { timeout: 20000 });
        await cardImage.click();
        await expect(page.getByText('Select Artwork for Forest')).toBeVisible();

        // Click "Get All Prints" to load more
        await page.getByRole('button', { name: 'Get All Prints' }).click();

        // Wait for more images to load
        await expect(page.locator('div.grid > img')).not.toHaveCount(1);

        // Verify "Get All Prints" is still visible (sticky footer)
        // We can check if it's in the viewport or check its container styling
        const button = page.getByRole('button', { name: 'Get All Prints' });
        await expect(button).toBeVisible();

        // Verify it's inside the sticky footer container
        // The container has classes: flex-none p-6 pt-4 bg-white ... border-t ... z-10
        // Verify it's inside the sticky footer container
        // The container has classes: flex-none p-6 pt-4 bg-white ... border-t ... z-10
        const footer = button.locator('..');
        await expect(footer).toHaveClass(/flex-none/);
        await expect(footer).toHaveClass(/border-t/);
        await expect(footer).toContainText('Get All Prints');
    });
});
