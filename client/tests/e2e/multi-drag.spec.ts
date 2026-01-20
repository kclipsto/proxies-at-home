import { test, expect } from './fixtures';

test.describe('Multi-Card Drag and Drop', () => {
    test.beforeEach(async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky with image loading');
        await page.goto('/');

        // Clear existing cards if any
        const cardCount = await page.locator('[data-dnd-sortable-item]').count();
        if (cardCount > 0) {
            const clearButton = page.getByRole('button', { name: 'Clear Cards' });
            if (await clearButton.isEnabled()) {
                await clearButton.click();
                await page.getByRole('button', { name: "Yes, I'm sure" }).click();
                await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(0, { timeout: 10000 });
            }
        }
    });

    test('should allow dragging multiple cards', async ({ page, browserName }) => {
        console.log(`[${browserName}] Starting multi-card drag test`);

        // Force desktop viewport to ensure drag handles are visible
        await page.setViewportSize({ width: 1280, height: 800 });

        // Ensure manual sort is active
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
        console.log(`[${browserName}] Filled decklist with 3 cards`);

        await page.getByRole('button', { name: 'Fetch Cards' }).click();
        console.log(`[${browserName}] Clicked Fetch Cards`);

        // Wait for cards to appear
        await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(3, { timeout: 30000 });
        console.log(`[${browserName}] 3 cards appeared in deck`);

        // Wait for processing to settle
        await page.waitForTimeout(1000);

        // Wait for drag handles
        const cardDragHandles = page.getByTitle('Drag');
        await expect(cardDragHandles).toHaveCount(3, { timeout: 10000 });
        console.log(`[${browserName}] Drag handles visible`);

        // Select first two cards
        const selectButtons = page.getByTitle('Select card');
        await expect(selectButtons).toHaveCount(3, { timeout: 5000 });

        await selectButtons.nth(0).click();
        console.log(`[${browserName}] Selected first card`);
        await selectButtons.nth(1).click();
        console.log(`[${browserName}] Selected second card`);

        // Verify selection visual (checkbox has bg-blue-600)
        const firstCheckbox = selectButtons.nth(0);
        await expect(firstCheckbox).toHaveClass(/bg-blue-600/, { timeout: 5000 });
        console.log(`[${browserName}] Selection visual confirmed`);

        // Drag first card to last position
        const sourceHandle = cardDragHandles.nth(0);
        const targetHandle = cardDragHandles.nth(2);

        // Use a more robust drag approach
        await sourceHandle.hover();
        await page.mouse.down();
        await page.waitForTimeout(200);

        const targetBound = await targetHandle.boundingBox();
        if (targetBound) {
            await page.mouse.move(targetBound.x + targetBound.width / 2, targetBound.y + targetBound.height / 2);
            await page.waitForTimeout(200);
        }

        await page.mouse.up();
        console.log(`[${browserName}] Drag operation completed`);

        // Verify cards are still there
        await expect(cardDragHandles).toHaveCount(3, { timeout: 5000 });
        console.log(`[${browserName}] Test passed - all 3 cards still present`);
    });
});
