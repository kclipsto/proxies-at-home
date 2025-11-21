import { test, expect } from '@playwright/test';

test.describe('Page Layout Logic', () => {
    test('should update dimensions when preset and orientation change', async ({ page }) => {
        await page.goto('/');

        // Locate the Preset dropdown/select
        const presetSelect = page.getByLabel('Page size', { exact: true });
        await expect(presetSelect).toBeVisible();

        // Select A4
        await presetSelect.selectOption({ value: 'A4' });

        // Verify dimensions for A4 Portrait (210mm x 297mm)
        // The PageSizeControl displays width and height in disabled TextInputs.
        // We can check for the values in the inputs.
        // Since A4 is mm, the unit should be mm.
        // We need to find the inputs corresponding to width and height.
        // They are labeled "Page width (mm)" and "Page height (mm)"

        const widthInput = page.getByLabel('Page width (mm)');
        const heightInput = page.getByLabel('Page height (mm)');

        await expect(widthInput).toHaveValue('210');
        await expect(heightInput).toHaveValue('297');

        // Toggle Orientation to Landscape
        // Button text is "Swap Orientation"
        const swapButton = page.getByRole('button', { name: 'Swap Orientation' });
        await swapButton.click();

        // Verify dimensions swapped (297mm x 210mm)
        await expect(widthInput).toHaveValue('297');
        await expect(heightInput).toHaveValue('210');
    });
});
