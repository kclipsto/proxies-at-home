import { test, expect } from './fixtures';

test.describe('Page Layout Logic', () => {
    test('should update dimensions when preset and orientation change', async ({ page }) => {
        await page.goto('/');

        // Locate the Preset dropdown/select
        const presetSelect = page.getByLabel('Page size', { exact: true });
        await expect(presetSelect).toBeVisible();

        // Select A4
        await presetSelect.selectOption({ value: 'A4' });

        // Verify dimensions for A4 Portrait (210mm x 297mm)
        const widthInput = page.getByLabel('Page width (mm)');
        const heightInput = page.getByLabel('Page height (mm)');

        await expect(widthInput).toHaveValue('210.00');
        await expect(heightInput).toHaveValue('297.00');

        // Toggle Orientation to Landscape
        const swapButton = page.getByRole('button', { name: 'Swap Orientation' });
        await swapButton.click();

        // Verify dimensions swapped (297mm x 210mm)
        await expect(widthInput).toHaveValue('297.00');
        await expect(heightInput).toHaveValue('210.00');
    });

    test('should handle custom page size interactions and persistence', async ({ page }) => {
        await page.goto('/');

        // Select Custom preset
        const presetSelect = page.getByLabel('Page size', { exact: true });
        await presetSelect.selectOption({ value: 'Custom' });

        // Verify inputs are enabled
        const widthInput = page.getByLabel('Page width (in)');
        const heightInput = page.getByLabel('Page height (in)');

        await expect(widthInput).toBeEnabled();
        await expect(heightInput).toBeEnabled();

        // Enter custom values
        await widthInput.fill('12.5');
        await widthInput.blur();

        await heightInput.fill('18.5');
        await heightInput.blur();

        // Verify values persisted in inputs
        await expect(widthInput).toHaveValue('12.50');
        await expect(heightInput).toHaveValue('18.50');

        // Toggle unit to mm
        const unitContainer = page.locator('.flex.items-center.gap-2', { has: page.locator('#unit-toggle') });
        await expect(unitContainer.getByText('inches')).toBeVisible();
        await expect(unitContainer.getByText('mm')).toBeVisible();

        // Click the toggle
        await page.locator('label[for="unit-toggle"]').click();

        // Verify conversion (12.5 in * 25.4 = 317.5 mm, 18.5 in * 25.4 = 469.9 mm)
        const widthInputMm = page.getByLabel('Page width (mm)');
        const heightInputMm = page.getByLabel('Page height (mm)');

        await expect(widthInputMm).toHaveValue('317.50');
        await expect(heightInputMm).toHaveValue('469.90');

        // Reload page to test persistence
        await page.reload();

        // Re-locate elements after reload (important for Firefox!)
        const presetSelectAfterReload = page.getByLabel('Page size', { exact: true });
        const widthInputMmAfterReload = page.getByLabel('Page width (mm)');
        const heightInputMmAfterReload = page.getByLabel('Page height (mm)');

        // Verify Custom preset is still selected
        await expect(presetSelectAfterReload).toHaveValue('Custom');

        // Verify custom values persisted (in mm since that was last state)
        await expect(widthInputMmAfterReload).toHaveValue('317.50');
        await expect(heightInputMmAfterReload).toHaveValue('469.90');

        // Switch to Letter
        await presetSelectAfterReload.selectOption({ value: 'Letter' });
        await expect(page.getByLabel('Page width (in)')).toHaveValue('8.50');

        // Switch back to Custom
        await presetSelectAfterReload.selectOption({ value: 'Custom' });

        // Verify custom values restored (in mm)
        await expect(widthInputMmAfterReload).toHaveValue('317.50');
        await expect(heightInputMmAfterReload).toHaveValue('469.90');
    });
});
