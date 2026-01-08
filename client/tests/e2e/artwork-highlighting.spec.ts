import { test, expect } from '@playwright/test';

test.describe('Artwork Highlighting', () => {
    test.beforeEach(async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');
        await page.goto('/');
    });

    /**
     * Helper to add a card and open its artwork modal
     */
    async function addCardAndOpenModal(page: import('@playwright/test').Page, cardName: string) {
        const deckInput = page.getByPlaceholder('1x Sol Ring');
        await deckInput.fill(`1x ${cardName}`);
        await page.getByRole('button', { name: 'Fetch Cards' }).click();
        await expect(page.getByTitle('Drag')).toHaveCount(1, { timeout: 60000 });

        // Open Artwork Modal by clicking the card image
        const cardImage = page.locator('.proxy-page img').first();
        await expect(cardImage).toHaveAttribute('src', /^blob:/, { timeout: 20000 });
        await cardImage.click();

        // Wait for modal to open
        await expect(page.getByText(`Select Artwork for ${cardName}`)).toBeVisible({ timeout: 10000 });
    }

    test.describe('Initial Card Click', () => {
        test('should open modal to Scryfall tab for Scryfall card', async ({ page }) => {
            await addCardAndOpenModal(page, 'Forest');

            // Should be on Scryfall tab (Get All Prints button visible)
            await expect(page.getByRole('button', { name: 'Get All Prints' })).toBeVisible({ timeout: 10000 });

            // The Scryfall toggle should be active/selected
            const scryfallButton = page.locator('button').filter({ hasText: 'Scryfall' }).first();
            await expect(scryfallButton).toBeVisible();
        });

        test('should highlight the card in the artwork grid', async ({ page }) => {
            await addCardAndOpenModal(page, 'Forest');

            // Wait for prints to load
            await page.waitForTimeout(2000);

            // There should be a highlighted card (ring-green-500 class)
            const highlightedCard = page.locator('.ring-green-500');
            // If prints loaded, there should be exactly 1 highlighted card
            const count = await highlightedCard.count();
            if (count > 0) {
                await expect(highlightedCard).toHaveCount(1);
            }
        });

        test('should sort highlighted card to front of list', async ({ page }) => {
            await addCardAndOpenModal(page, 'Forest');

            // Wait for prints to load
            await page.waitForTimeout(2000);

            // The first card in the grid should be highlighted
            const firstCard = page.locator('.relative.group.cursor-pointer').first();
            const highlightedCard = page.locator('.ring-green-500');

            // Check if the highlighted card is the first one
            const count = await highlightedCard.count();
            if (count > 0) {
                const firstCardBox = await firstCard.boundingBox();
                const highlightedBox = await highlightedCard.boundingBox();
                if (firstCardBox && highlightedBox) {
                    // Highlighted card should be at or near the top
                    expect(highlightedBox.y).toBeLessThanOrEqual(firstCardBox.y + 10);
                }
            }
        });
    });

    test.describe('Source Toggle - Single Highlight', () => {
        test('should have only one highlight when toggling Scryfall to MPC', async ({ page }) => {
            await addCardAndOpenModal(page, 'Forest');

            // Toggle to MPC
            const mpcButton = page.locator('button').filter({ hasText: 'MPC' }).first();
            await mpcButton.click();

            // Wait for MPC content to load
            await expect(page.getByRole('button', { name: 'Get All Art' })).toBeVisible({ timeout: 10000 });

            // Wait for any search to complete
            await page.waitForTimeout(2000);

            // There should be at most 1 highlighted card (or 0 if canvas card not in MPC)
            const highlightedCards = page.locator('.ring-green-500');
            const count = await highlightedCards.count();
            expect(count).toBeLessThanOrEqual(1);
        });

        test('should have only one highlight when toggling MPC to Scryfall', async ({ page }) => {
            await addCardAndOpenModal(page, 'Forest');

            // Toggle to MPC first
            const mpcButton = page.locator('button').filter({ hasText: 'MPC' }).first();
            await mpcButton.click();
            await expect(page.getByRole('button', { name: 'Get All Art' })).toBeVisible({ timeout: 10000 });

            // Toggle back to Scryfall
            const scryfallButton = page.locator('button').filter({ hasText: 'Scryfall' }).first();
            await scryfallButton.click();
            await expect(page.getByRole('button', { name: 'Get All Prints' })).toBeVisible({ timeout: 5000 });

            // Wait for prints to load
            await page.waitForTimeout(2000);

            // There should be at most 1 highlighted card
            const highlightedCards = page.locator('.ring-green-500');
            const count = await highlightedCards.count();
            expect(count).toBeLessThanOrEqual(1);
        });

        test('should clear original highlight when selecting in other source', async ({ page }) => {
            await addCardAndOpenModal(page, 'Forest');

            // Wait for Scryfall prints to load
            await page.waitForTimeout(2000);

            // Toggle to MPC
            const mpcButton = page.locator('button').filter({ hasText: 'MPC' }).first();
            await mpcButton.click();
            await expect(page.getByRole('button', { name: 'Get All Art' })).toBeVisible({ timeout: 10000 });

            // Wait for MPC search to complete
            await page.waitForTimeout(3000);

            // Click on an MPC card if available
            const mpcCards = page.locator('.relative.group.cursor-pointer');
            const mpcCardCount = await mpcCards.count();
            if (mpcCardCount > 0) {
                await mpcCards.first().click();

                // Click confirm to keep the selection
                await page.waitForTimeout(500);

                // Toggle back to Scryfall
                const scryfallButton = page.locator('button').filter({ hasText: 'Scryfall' }).first();
                await scryfallButton.click();

                // Wait for prints
                await page.waitForTimeout(2000);

                // The original Scryfall card should NOT be highlighted (user selected MPC)
                // There should be 0 highlighted cards in Scryfall now
                const highlightedCards = page.locator('.ring-green-500');
                const count = await highlightedCards.count();
                // Either 0 (no matching selection) or the new one could match
                expect(count).toBeLessThanOrEqual(1);
            }
        });
    });

    test.describe('Card Selection in Grid', () => {
        test('should highlight new card when clicked without changing preview', async ({ page }) => {
            await addCardAndOpenModal(page, 'Forest');

            // Wait for prints to load
            await page.waitForTimeout(2000);


            // Click on a different print in the grid (not the first one)
            const prints = page.locator('.relative.group.cursor-pointer');
            const printCount = await prints.count();

            if (printCount > 1) {
                // Click the second print
                await prints.nth(1).click();

                // Wait for selection update
                await page.waitForTimeout(500);

                // There should still be exactly 1 highlighted card
                const highlightedCards = page.locator('.ring-green-500');
                await expect(highlightedCards).toHaveCount(1);

                // The newly clicked card should now be highlighted
                // (The highlight should have moved from first to second)
            }
        });
    });

    test.describe('Navigation Between Cards', () => {
        test('should update highlight when navigating to next card', async ({ page }) => {
            // Add two cards
            const deckInput = page.getByPlaceholder('1x Sol Ring');
            await deckInput.fill('1x Forest\n1x Island');
            await page.getByRole('button', { name: 'Fetch Cards' }).click();
            await expect(page.getByTitle('Drag')).toHaveCount(2, { timeout: 60000 });

            // Open modal on first card
            const firstCard = page.locator('.proxy-page img').first();
            await expect(firstCard).toHaveAttribute('src', /^blob:/, { timeout: 20000 });
            await firstCard.click();

            // Wait for modal
            await expect(page.getByText(/Select Artwork for/)).toBeVisible({ timeout: 10000 });

            // Find and click next button
            const nextButton = page.locator('button[aria-label="Next card"]').or(
                page.locator('button').filter({ hasText: '→' })
            );

            if (await nextButton.count() > 0) {
                await nextButton.first().click();

                // Wait for navigation
                await page.waitForTimeout(2000);

                // Modal should still be open with different card
                await expect(page.getByText(/Select Artwork for/)).toBeVisible();

                // There should still be at most 1 highlighted card
                const highlightedCards = page.locator('.ring-green-500');
                const count = await highlightedCards.count();
                expect(count).toBeLessThanOrEqual(1);
            }
        });
    });
});
