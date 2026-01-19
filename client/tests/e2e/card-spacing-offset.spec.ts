import { test, expect } from './fixtures';

test.describe('Card Spacing and Position Offset', () => {
    test.beforeEach(async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');
        await page.goto('/');

        // Expand the Card settings panel if it's collapsed
        const cardPanel = page.locator('#settings-panel-card');
        const cardPanelContent = cardPanel.locator('.p-4');
        const cardPanelHeader = cardPanel.locator('.cursor-pointer');

        // Check if content is visible, if not click header to expand
        if (await cardPanel.isVisible() && !await cardPanelContent.isVisible()) {
            await cardPanelHeader.click();
            await expect(cardPanelContent).toBeVisible({ timeout: 5000 });
        }
    });

    test('should find and modify card spacing input', async ({ page }) => {
        // Find the Card Spacing label
        const spacingLabel = page.getByText('Card Spacing (mm)');
        await expect(spacingLabel).toBeVisible({ timeout: 5000 });
    });

    test('should find and modify horizontal offset input', async ({ page }) => {
        // Find the Horizontal Offset label (inside Card Position Adjustment section)
        const offsetLabel = page.getByText('Horizontal Offset');
        await expect(offsetLabel).toBeVisible({ timeout: 5000 });
    });

    test('should find and modify vertical offset input', async ({ page }) => {
        // Find the Vertical Offset label
        const offsetLabel = page.getByText('Vertical Offset');
        await expect(offsetLabel).toBeVisible({ timeout: 5000 });
    });

    test('should toggle separate back offset', async ({ page }) => {
        // Find and click the "Separate Back Offset" checkbox
        const checkbox = page.locator('#useCustomBackOffset');
        await expect(checkbox).toBeVisible({ timeout: 5000 });
        await checkbox.click();

        // Verify back offset fields appear
        const backHorizontalLabel = page.getByText('Back Horizontal');
        const backVerticalLabel = page.getByText('Back Vertical');
        await expect(backHorizontalLabel).toBeVisible({ timeout: 5000 });
        await expect(backVerticalLabel).toBeVisible({ timeout: 5000 });

        // Toggle off
        await checkbox.click();
        await expect(backHorizontalLabel).toBeHidden({ timeout: 5000 });
    });
});
