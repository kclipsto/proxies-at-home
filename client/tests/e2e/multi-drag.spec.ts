import { test, expect } from '@playwright/test';

test.describe('Multi-Card Drag and Drop', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');

        // Clear existing cards if any (handle persistence)
        const clearButton = page.getByRole('button', { name: 'Clear Cards' });
        if (await clearButton.isEnabled()) {
            await clearButton.click();
            await page.getByRole('button', { name: "Yes, I'm sure" }).click();
            await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(0);
        }
    });

    test('should allow dragging multiple cards', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky with image loading');

        // Force desktop viewport to ensure drag handles are visible
        await page.setViewportSize({ width: 1280, height: 800 });


        // Ensure manual sort is active (Drag & Drop disabled if not)
        await page.evaluate(() => {
            interface CustomWindow extends Window {
                useSettingsStore?: {
                    getState: () => {
                        setSortBy: (value: 'manual' | 'name' | 'type' | 'cmc' | 'color' | 'rarity') => void;
                    };
                };
            }
            const store = (window as unknown as CustomWindow).useSettingsStore;
            if (store) store.getState().setSortBy('manual');
        });

        // Add 3 cards
        const decklistInput = page.getByPlaceholder(/1x Sol Ring/);
        await decklistInput.fill('Island\nMountain\nForest');
        await page.getByRole('button', { name: 'Fetch Cards' }).click();

        // Wait for cards to appear (check elements first)
        await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(3, { timeout: 30_000 });

        // Wait for drag handles
        const cardDragHandles = page.getByTitle('Drag');
        await expect(cardDragHandles).toHaveCount(3, { timeout: 10_000 });

        // Wait for images to load (stability)
        await expect(page.locator('.proxy-page img').first()).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });

        // Select first two cards (Shift + Click)
        await page.keyboard.down('Shift');
        await page.getByTitle('Select card').nth(0).click();
        await page.getByTitle('Select card').nth(1).click();
        await page.keyboard.up('Shift');

        // Verify selection visual (checkbox is checked - distinct style)
        // We can check if the parent div has bg-blue-600
        const firstCheckbox = page.getByTitle('Select card').nth(0);
        await expect(firstCheckbox).toHaveClass(/bg-blue-600/);

        // Drag first card to last position using the HANDLE
        const sourceHandle = cardDragHandles.nth(0);
        const targetHandle = cardDragHandles.nth(2);

        // Simple drag simulation
        await sourceHandle.dragTo(targetHandle);

        // Verify cards are still there (basic crash check)
        await expect(cardDragHandles).toHaveCount(3);
    });
});
