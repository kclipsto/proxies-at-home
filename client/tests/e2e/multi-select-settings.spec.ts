
import { test, expect } from '@playwright/test';

test('Multi-select Settings Context Menu', async ({ page }) => {
    // 1. Load the app
    await page.goto('/');

    // 2. Fetch 2 cards
    const decklistInput = page.getByPlaceholder(/1x Sol Ring/);
    await decklistInput.fill('2 Forest');
    await page.getByRole('button', { name: 'Fetch Cards' }).click();

    // Wait for cards to appear
    const cardDragHandles = page.getByTitle('Drag');
    await expect(cardDragHandles).toHaveCount(2, { timeout: 30_000 });

    // 3. Select both cards
    const selectButtons = page.getByTitle('Select card');
    await expect(selectButtons).toHaveCount(2);

    await selectButtons.nth(0).click();
    await selectButtons.nth(1).click();

    // Verify selection banner shows "2 selected"
    await expect(page.getByText('2 selected')).toBeVisible();

    // 4. Right click on first card to open context menu
    // The context menu listener is on the card wrapper
    const firstCard = page.locator('.proxy-page img').first();
    await firstCard.click({ button: 'right' });

    // Verify context menu is open by checking for another item first
    await expect(page.getByText('Duplicate 2 Selected')).toBeVisible();

    // 5. Check for Settings button (with count) and click it
    const settingsButton = page.getByRole('button', { name: 'Settings 2 Selected', exact: true });
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();

    // 6. Verify Modal opens to Settings tab and Bleed Settings are visible
    await expect(page.getByRole('heading', { name: 'Bleed Settings' })).toBeVisible();
});
