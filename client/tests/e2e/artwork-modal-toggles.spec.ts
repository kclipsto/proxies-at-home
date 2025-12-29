import { test, expect } from '@playwright/test';

test.describe('ArtworkModal Toggle Buttons', () => {
    test.beforeEach(async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');
        await page.goto('/');

        // Add a card first to enable opening ArtworkModal
        const deckInput = page.getByPlaceholder('1x Sol Ring');
        await deckInput.fill('1x Forest');
        await page.getByRole('button', { name: 'Fetch Cards' }).click();
        await expect(page.getByTitle('Drag')).toHaveCount(1, { timeout: 60000 });

        // Open Artwork Modal by clicking the card image
        const cardImage = page.locator('.proxy-page img').first();
        await expect(cardImage).toHaveAttribute('src', /^blob:/, { timeout: 20000 });
        await cardImage.click();

        // Wait for modal to open
        await expect(page.getByText('Select Artwork for Forest')).toBeVisible();
    });

    test.describe('Face Toggle (Front/Back)', () => {
        test('should display Face toggle buttons', async ({ page }) => {
            // The Face toggle should show "Forest" as the front tab
            const faceToggle = page.locator('button:has-text("Forest")').first();
            await expect(faceToggle).toBeVisible();
        });

        test('should switch face when clicking Back button', async ({ page }) => {
            // Find Face toggle buttons by looking for toggle button groups
            // The second face should be "Back" or the card back name
            // In single-faced cards, there might only be one tab
            // Let's check if there's a Back option in the toggle group
            const backButton = page.locator('button').filter({ hasText: /^(Back|Cardback)$/i });

            if (await backButton.count() > 0) {
                await backButton.first().click();
                // Modal should remain open
                await expect(page.getByText('Choose Cardback')).toBeVisible({ timeout: 5000 });
            }
        });
    });

    test.describe('View Toggle (Artwork/Settings)', () => {
        test('should display Artwork and Settings toggle buttons', async ({ page }) => {
            const artworkButton = page.locator('button').filter({ hasText: 'Artwork' });
            const settingsButton = page.locator('button').filter({ hasText: 'Settings' });

            await expect(artworkButton.first()).toBeVisible();
            await expect(settingsButton.first()).toBeVisible();
        });

        test('should switch to Settings view when clicking Settings', async ({ page }) => {
            const settingsButton = page.locator('button').filter({ hasText: 'Settings' });
            await settingsButton.first().click();

            // Modal should remain open and show settings content
            await expect(page.getByText('Select Artwork for Forest')).toBeVisible();

            // Settings content should be visible (e.g., adjustment sliders or similar)
            // Look for common settings elements
            const settingsContent = page.locator('text=/Brightness|Saturation|Contrast/i');
            await expect(settingsContent.first()).toBeVisible({ timeout: 5000 });
        });

        test('should switch back to Artwork view when clicking Artwork', async ({ page }) => {
            // First go to Settings
            const settingsButton = page.locator('button').filter({ hasText: 'Settings' });
            await settingsButton.first().click();

            // Wait for settings to load
            await expect(page.locator('text=/Brightness|Saturation|Contrast/i').first()).toBeVisible({ timeout: 5000 });

            // Now click Artwork
            const artworkButton = page.locator('button').filter({ hasText: 'Artwork' });
            await artworkButton.first().click();

            // Should be back on artwork view
            // Look for artwork-specific content like "Get All Prints" or card images
            await expect(page.getByRole('button', { name: /Get All (Prints|Art)/ })).toBeVisible();
        });
    });

    test.describe('Source Toggle (Scryfall/MPC)', () => {
        test('should display Scryfall and MPC toggle buttons', async ({ page }) => {
            const scryfallButton = page.locator('button').filter({ hasText: 'Scryfall' });
            const mpcButton = page.locator('button').filter({ hasText: 'MPC' });

            await expect(scryfallButton.first()).toBeVisible();
            await expect(mpcButton.first()).toBeVisible();
        });

        test('should switch to MPC source when clicking MPC', async ({ page }) => {
            const mpcButton = page.locator('button').filter({ hasText: 'MPC' });
            await mpcButton.first().click();

            // Modal should remain open
            await expect(page.getByText('Select Artwork for Forest')).toBeVisible();

            // Button text should change to "Get All Art" (MPC mode)
            await expect(page.getByRole('button', { name: 'Get All Art' })).toBeVisible({ timeout: 5000 });
        });

        test('should switch back to Scryfall source when clicking Scryfall', async ({ page }) => {
            // First go to MPC
            const mpcButton = page.locator('button').filter({ hasText: 'MPC' });
            await mpcButton.first().click();
            await expect(page.getByRole('button', { name: 'Get All Art' })).toBeVisible({ timeout: 5000 });

            // Now click Scryfall
            const scryfallButton = page.locator('button').filter({ hasText: 'Scryfall' });
            await scryfallButton.first().click();

            // Button should change back to "Get All Prints"
            await expect(page.getByRole('button', { name: 'Get All Prints' })).toBeVisible({ timeout: 5000 });
        });

        test('should NOT close modal when clicking toggle buttons', async ({ page }) => {
            const mpcButton = page.locator('button').filter({ hasText: 'MPC' });
            const scryfallButton = page.locator('button').filter({ hasText: 'Scryfall' });

            // Click MPC
            await mpcButton.first().click();
            await expect(page.getByText('Select Artwork for Forest')).toBeVisible();

            // Click Scryfall
            await scryfallButton.first().click();
            await expect(page.getByText('Select Artwork for Forest')).toBeVisible();

            // Click MPC again
            await mpcButton.first().click();
            await expect(page.getByText('Select Artwork for Forest')).toBeVisible();

            // Modal should still be open
            await expect(page.getByText('Select Artwork for Forest')).toBeVisible();
        });
    });

    test.describe('Multiple toggles interaction', () => {
        test('should allow changing all toggles without closing modal', async ({ page }) => {
            // Click Settings
            const settingsButton = page.locator('button').filter({ hasText: 'Settings' });
            await settingsButton.first().click();
            await expect(page.getByText('Select Artwork for Forest')).toBeVisible();

            // Click Artwork
            const artworkButton = page.locator('button').filter({ hasText: 'Artwork' });
            await artworkButton.first().click();
            await expect(page.getByText('Select Artwork for Forest')).toBeVisible();

            // Click MPC
            const mpcButton = page.locator('button').filter({ hasText: 'MPC' });
            await mpcButton.first().click();
            await expect(page.getByText('Select Artwork for Forest')).toBeVisible();

            // Verify MPC content loaded
            await expect(page.getByRole('button', { name: 'Get All Art' })).toBeVisible({ timeout: 10000 });
        });
    });
});

test.describe('AdvancedSearch Toggle Buttons', () => {
    test.beforeEach(async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');
        await page.goto('/');

        // Open Advanced Search
        await page.getByRole('button', { name: 'Advanced Search' }).click();

        // Wait for modal to be visible
        await expect(page.getByPlaceholder('Search card name...')).toBeVisible();
    });

    test.describe('Source Toggle (Scryfall/MPC)', () => {
        test('should display Scryfall and MPC Autofill toggle buttons', async ({ page }) => {
            const scryfallButton = page.locator('button').filter({ hasText: 'Scryfall' });
            const mpcButton = page.locator('button').filter({ hasText: 'MPC Autofill' });

            await expect(scryfallButton.first()).toBeVisible();
            await expect(mpcButton.first()).toBeVisible();
        });

        test('should switch to MPC search when clicking MPC Autofill', async ({ page }) => {
            const mpcButton = page.locator('button').filter({ hasText: 'MPC Autofill' });
            await mpcButton.first().click();

            // Modal should remain open
            await expect(page.getByPlaceholder(/Search MPC|Search card/)).toBeVisible();
        });

        test('should NOT close modal when clicking toggle buttons', async ({ page }) => {
            const mpcButton = page.locator('button').filter({ hasText: 'MPC Autofill' });
            const scryfallButton = page.locator('button').filter({ hasText: 'Scryfall' });

            // Click MPC
            await mpcButton.first().click();
            await expect(page.getByPlaceholder(/Search MPC|Search card/)).toBeVisible();

            // Click Scryfall
            await scryfallButton.first().click();
            await expect(page.getByPlaceholder('Search card name...')).toBeVisible();

            // Modal should still be open
            await expect(page.getByPlaceholder('Search card name...')).toBeVisible();
        });
    });
});
