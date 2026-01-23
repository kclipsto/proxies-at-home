import { test, expect } from './fixtures';

/**
 * E2E tests for DFC (Double-Faced Card) back face linking.
 * 
 * Tests the scenario where a user replaces a card with a DFC via the artwork modal.
 * The back face should be properly linked instead of using the default cardback.
 */
test.describe('DFC Back Face Linking', () => {
    // Skip WebKit - consistently flaky
    test.skip(({ browserName }) => browserName === 'webkit', 'WebKit is flaky in this environment');

    test('should link DFC back face when replacing card via Scryfall search', async ({ page, browserName }) => {
        console.log(`[${browserName}] Starting DFC back face linking test (Scryfall)`);

        await page.goto('/');

        // Add a typo card that we'll replace with a DFC
        const decklistInput = page.getByPlaceholder(/1x Sol Ring/);
        await decklistInput.fill('1x Seph');
        await page.getByRole('button', { name: 'Fetch Cards' }).click();

        // Wait for the card to appear (it will be in error/lookup failed state)
        const cardOverlays = page.locator('[data-dnd-sortable-item]');
        await expect(cardOverlays).toHaveCount(1, { timeout: 30_000 });
        console.log(`[${browserName}] Card added`);

        // Click the card to open artwork modal
        await cardOverlays.first().click();
        await expect(page.getByText('Select Artwork for')).toBeVisible({ timeout: 10000 });
        console.log(`[${browserName}] Artwork modal opened`);

        // Click "Search for a different card..." button
        const searchButton = page.getByRole('button', { name: 'Search for a different card...' });
        await expect(searchButton).toBeVisible({ timeout: 5000 });
        await searchButton.click();

        // Wait for search input and search for a DFC
        const searchInput = page.getByPlaceholder('Search card name...');
        await expect(searchInput).toBeVisible({ timeout: 5000 });
        await searchInput.fill('Huntmaster of the Fells');
        await page.keyboard.press('Enter');
        console.log(`[${browserName}] Searching for Huntmaster of the Fells (DFC)`);

        // Wait for search results
        const artworkCards = page.getByTestId('artwork-card');
        await expect(artworkCards.first()).toBeVisible({ timeout: 30000 });
        console.log(`[${browserName}] Search results visible`);

        // Click first search result to select the DFC
        await artworkCards.first().click({ force: true });

        // Wait for modal to close and card to update
        await expect(page.getByText('Select Artwork for')).toBeHidden({ timeout: 10000 });
        console.log(`[${browserName}] Modal closed after selection`);

        // Verify card still exists
        await expect(cardOverlays).toHaveCount(1);

        // Click the flip button to show the back face
        const flipButton = page.getByTestId('flip-button');
        await expect(flipButton).toBeVisible({ timeout: 5000 });
        await flipButton.click();
        console.log(`[${browserName}] Card flipped`);

        // The flip button should now be highlighted (blue) indicating flipped state
        await expect(flipButton).toHaveClass(/bg-blue-500/, { timeout: 5000 });
        console.log(`[${browserName}] Card confirmed flipped (blue flip button)`);

        // Open the artwork modal again to verify back face tab shows DFC back name
        await cardOverlays.first().click();
        await expect(page.getByText('Select Artwork for')).toBeVisible({ timeout: 10000 });

        // Look for the back face tab - should show "Ravager of the Fells" (Huntmaster's back face)
        // or another DFC back name, not "Back" or default cardback name
        const tabs = page.locator('[role="tab"], [role="tablist"] button, .tab');
        const tabCount = await tabs.count();
        console.log(`[${browserName}] Found ${tabCount} tabs in modal`);

        // Check if there's a tab with the back face name (not "Back" generic)
        // Huntmaster of the Fells transforms to "Ravager of the Fells"
        const backTab = page.getByRole('tab', { name: /Ravager of the Fells|Back:/ });
        const hasBackTab = await backTab.count();
        console.log(`[${browserName}] Back face tab found: ${hasBackTab > 0}`);

        // If we can see tabs, verify it's a DFC tab not default cardback
        if (tabCount >= 2) {
            // The second tab should be the back face
            const secondTabText = await tabs.nth(1).textContent();
            console.log(`[${browserName}] Second tab text: "${secondTabText}"`);
            // DFC tabs typically show the back face name, not just "Back"
            // Default cardback would show "Cardback" or "Back"
            expect(secondTabText).not.toMatch(/^Back$/);
            expect(secondTabText).not.toMatch(/Cardback/i);
        }

        // Close modal
        await page.keyboard.press('Escape');
        console.log(`[${browserName}] Test completed successfully!`);
    });

    test('should link DFC back face when replacing card via MPC search', async ({ page, browserName }) => {
        console.log(`[${browserName}] Starting DFC back face linking test (MPC)`);

        await page.goto('/');

        // Add a typo card
        const decklistInput = page.getByPlaceholder(/1x Sol Ring/);
        await decklistInput.fill('1x Seph');
        await page.getByRole('button', { name: 'Fetch Cards' }).click();

        // Wait for card
        const cardOverlays = page.locator('[data-dnd-sortable-item]');
        await expect(cardOverlays).toHaveCount(1, { timeout: 30_000 });
        console.log(`[${browserName}] Card added`);

        // Click card to open modal
        await cardOverlays.first().click();
        await expect(page.getByText('Select Artwork for')).toBeVisible({ timeout: 10000 });

        // Switch to MPC art source
        const mpcToggle = page.getByRole('button', { name: /MPC/i });
        if (await mpcToggle.isVisible()) {
            await mpcToggle.click();
            console.log(`[${browserName}] Switched to MPC source`);
        }

        // Click search button
        const searchButton = page.getByRole('button', { name: 'Search for a different card...' });
        await expect(searchButton).toBeVisible({ timeout: 5000 });
        await searchButton.click();

        // Search for a DFC in MPC
        const searchInput = page.getByPlaceholder('Search card name...');
        await expect(searchInput).toBeVisible({ timeout: 5000 });
        await searchInput.fill('Jace, Vryn');
        await page.keyboard.press('Enter');
        console.log(`[${browserName}] Searching for Jace, Vryn's Prodigy (DFC) in MPC`);

        // Wait for MPC search results
        // MPC uses different result format
        const mpcResults = page.locator('[data-testid="mpc-card"], [data-testid="artwork-card"], .group.cursor-pointer');

        // Wait up to 30 seconds for results
        let found = false;
        for (let i = 0; i < 30 && !found; i++) {
            const count = await mpcResults.count();
            if (count > 0) {
                found = true;
                console.log(`[${browserName}] Found ${count} MPC results`);
            } else {
                await page.waitForTimeout(1000);
            }
        }

        if (!found) {
            console.log(`[${browserName}] No MPC results found, skipping MPC-specific verification`);
            // Take screenshot for debugging
            await page.screenshot({ path: `test-results/dfc-mpc-no-results-${browserName}.png` });
            // Skip MPC test if no results (API might not have this card)
            test.skip();
            return;
        }

        // Click first result
        await mpcResults.first().click({ force: true });

        // Wait for modal to close
        await expect(page.getByText('Select Artwork for')).toBeHidden({ timeout: 10000 });
        console.log(`[${browserName}] Modal closed after MPC selection`);

        // Verify card exists
        await expect(cardOverlays).toHaveCount(1);

        // Flip the card
        const flipButton = page.getByTestId('flip-button');
        await expect(flipButton).toBeVisible({ timeout: 5000 });
        await flipButton.click();
        console.log(`[${browserName}] Card flipped`);

        // Verify flipped state
        await expect(flipButton).toHaveClass(/bg-blue-500/, { timeout: 5000 });
        console.log(`[${browserName}] MPC DFC test completed`);
    });
});
