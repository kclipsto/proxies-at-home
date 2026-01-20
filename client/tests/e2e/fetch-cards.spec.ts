
import { test, expect } from './fixtures';

test('fetch 9 forests', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

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

    // Verify card overlays are rendered (PixiJS canvas renders the images)
    const cardOverlays = page.locator('[data-dnd-sortable-item]');
    await expect(cardOverlays).toHaveCount(4);
    await expect(cardOverlays.first()).toBeVisible({ timeout: 30_000 });

    // Reload to check persistence
    await page.reload();
    await expect(cardDragHandles).toHaveCount(4, { timeout: 10_000 });
    await expect(cardOverlays).toHaveCount(4);
});

