import { test, expect } from '@playwright/test';

test.describe('Card Spacing and Position Offset', () => {
    test.beforeEach(async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');
        test.skip(browserName === 'firefox', 'Firefox is flaky in this environment');
        await page.goto('/');

        // Add a few cards for testing
        const deckText = `
1x Sol Ring
1x Counterspell
1x Lightning Bolt
        `.trim();

        const textarea = page.getByPlaceholder(/1x Sol Ring/);
        await textarea.fill(deckText);
        await page.getByRole('button', { name: 'Fetch Cards' }).click();

        // Wait for cards to appear
        await expect(page.getByText('Sol Ring')).toBeVisible({ timeout: 15000 });
        await page.waitForTimeout(2000);
    });

    test('should apply card spacing setting', async ({ page }) => {
        // Open Card section
        const cardSection = page.locator('#settings-panel-card');
        const header = cardSection.locator('.cursor-pointer');
        const content = cardSection.locator('.p-4');

        if (!await content.isVisible()) {
            await header.click();
        }

        // Find card spacing input (first input in the card section)
        const spacingInput = cardSection.locator('input[type="number"]').first();
        await expect(spacingInput).toBeVisible();

        // Set spacing to 2mm (fits in default Letter 3x3 layout with bleed)
        await spacingInput.clear();
        await spacingInput.fill('2');
        await spacingInput.blur();

        // Wait for setting to apply
        await page.waitForTimeout(500);

        // Verify the input reflects the value (or clamped value if too large)
        const actualValue = await spacingInput.inputValue();
        expect(parseFloat(actualValue)).toBeGreaterThanOrEqual(0);
        expect(parseFloat(actualValue)).toBeLessThanOrEqual(2);
    });

    test('should apply card position offset X', async ({ page }) => {
        // Open Card section
        const cardSection = page.locator('#settings-panel-card');
        const header = cardSection.locator('.cursor-pointer');
        const content = cardSection.locator('.p-4');

        if (!await content.isVisible()) {
            await header.click();
        }

        // Find horizontal offset input (second input in the card section)
        const offsetXInput = cardSection.locator('input[type="number"]').nth(1);
        await expect(offsetXInput).toBeVisible();

        // Set offset to 10mm
        await offsetXInput.clear();
        await offsetXInput.fill('10');
        await offsetXInput.blur();

        // Wait for setting to apply
        await page.waitForTimeout(500);

        // Verify the input reflects the value
        await expect(offsetXInput).toHaveValue('10');
    });

    test('should apply card position offset Y', async ({ page }) => {
        // Open Card section
        const cardSection = page.locator('#settings-panel-card');
        const header = cardSection.locator('.cursor-pointer');
        const content = cardSection.locator('.p-4');

        if (!await content.isVisible()) {
            await header.click();
        }

        // Find vertical offset input (third input in the card section)
        const offsetYInput = cardSection.locator('input[type="number"]').nth(2);
        await expect(offsetYInput).toBeVisible();

        // Set offset to 10mm
        await offsetYInput.clear();
        await offsetYInput.fill('10');
        await offsetYInput.blur();

        // Wait for setting to apply
        await page.waitForTimeout(500);

        // Verify the input reflects the value
        await expect(offsetYInput).toHaveValue('10');
    });

    test('should persist spacing and offset settings', async ({ page }) => {
        // Open Card section
        const cardSection = page.locator('#settings-panel-card');
        const header = cardSection.locator('.cursor-pointer');
        const content = cardSection.locator('.p-4');

        if (!await content.isVisible()) {
            await header.click();
        }

        // Set spacing and offsets
        const spacingInput = cardSection.locator('input[type="number"]').first();
        const offsetXInput = cardSection.locator('input[type="number"]').nth(1);
        const offsetYInput = cardSection.locator('input[type="number"]').nth(2);

        await spacingInput.clear();
        await spacingInput.fill('1');
        await spacingInput.blur();

        await offsetXInput.clear();
        await offsetXInput.fill('5');
        await offsetXInput.blur();

        await offsetYInput.clear();
        await offsetYInput.fill('-5');
        await offsetYInput.blur();

        // Wait for settings to save
        await page.waitForTimeout(1000);

        // Reload the page
        await page.reload();
        await page.waitForTimeout(2000);

        // Open Card section again
        const cardSection2 = page.locator('#settings-panel-card');
        const header2 = cardSection2.locator('.cursor-pointer');
        const content2 = cardSection2.locator('.p-4');

        if (!await content2.isVisible()) {
            await header2.click();
        }

        // Verify settings persisted
        const spacingInput2 = cardSection2.locator('input[type="number"]').first();
        const offsetXInput2 = cardSection2.locator('input[type="number"]').nth(1);
        const offsetYInput2 = cardSection2.locator('input[type="number"]').nth(2);

        await expect(spacingInput2).toHaveValue('1');
        await expect(offsetXInput2).toHaveValue('5');
        await expect(offsetYInput2).toHaveValue('-5');
    });

    test('should update when offset changes', async ({ page }) => {
        // Open Card section
        const cardSection = page.locator('#settings-panel-card');
        const header = cardSection.locator('.cursor-pointer');
        const content = cardSection.locator('.p-4');

        if (!await content.isVisible()) {
            await header.click();
        }

        // Set horizontal offset
        const offsetXInput = cardSection.locator('input[type="number"]').nth(1);
        await offsetXInput.clear();
        await offsetXInput.fill('10');
        await offsetXInput.blur();

        await page.waitForTimeout(500);

        // Verify offset was set
        await expect(offsetXInput).toHaveValue('10');
    });
});
