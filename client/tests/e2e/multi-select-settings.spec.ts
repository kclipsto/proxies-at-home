import { test, expect } from './fixtures';

test('Multi-select Settings Context Menu', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

    await page.goto('/');

    // Fetch 2 cards
    const decklistInput = page.getByPlaceholder(/1x Sol Ring/);
    await decklistInput.fill('2 Forest');
    await page.getByRole('button', { name: 'Fetch Cards' }).click();

    // Wait for cards to appear
    await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(2, { timeout: 30000 });

    // Select both cards
    const selectButtons = page.getByTitle('Select card');
    await expect(selectButtons).toHaveCount(2);
    await selectButtons.nth(0).click();
    await selectButtons.nth(1).click();

    // Verify selection banner shows "2 selected"
    await expect(page.getByText('2 selected')).toBeVisible();

    // Right click on first card to open context menu
    const firstCard = page.locator('[data-dnd-sortable-item]').first();
    await firstCard.click({ button: 'right' });

    // Verify context menu is open - looking for the multi-select button text
    // The button says "{n} Cards Settings" for multi-select
    await expect(page.getByText('Duplicate 2 Cards')).toBeVisible({ timeout: 5000 });

    // Check for Settings button (with count) and click it
    const settingsButton = page.getByRole('button', { name: '2 Cards Settings' });
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();

    // Verify Modal opens with Settings content
    await expect(page.locator('text=/Brightness|Saturation|Bleed/i').first()).toBeVisible({ timeout: 5000 });
});
