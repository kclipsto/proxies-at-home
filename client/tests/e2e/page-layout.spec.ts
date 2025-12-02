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

        await expect(widthInput).toHaveValue('210.00');
        await expect(heightInput).toHaveValue('297.00');

        // Toggle Orientation to Landscape
        // Button text is "Swap Orientation"
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
        // Note: Using fill instead of type to ensure clean input
        await widthInput.fill('12.5');
        await widthInput.blur(); // Trigger commit

        await heightInput.fill('18.5');
        await heightInput.blur(); // Trigger commit

        // Verify values persisted in inputs
        await expect(widthInput).toHaveValue('12.50');
        await expect(heightInput).toHaveValue('18.50');

        // Toggle unit to mm
        const unitToggle = page.getByRole('checkbox', { name: 'Unit' }); // Flowbite ToggleSwitch uses a checkbox input
        // Or we can find it by label if the structure allows, but ToggleSwitch structure is specific.
        // Let's try clicking the toggle switch container or label if needed, but checkbox interaction is standard.
        // The label "Unit" is associated with the toggle.

        // Wait for toggle to be visible and verify labels
        // Use specific locator to avoid strict mode violation with other "mm" text on page
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

        // Verify Custom preset is still selected
        await expect(presetSelect).toHaveValue('Custom');

        // Verify custom values persisted (in mm since that was last state)
        await expect(widthInputMm).toHaveValue('317.50');
        await expect(heightInputMm).toHaveValue('469.90');

        // Switch to Letter
        await presetSelect.selectOption({ value: 'Letter' });
        await expect(page.getByLabel('Page width (in)')).toHaveValue('8.50');

        // Switch back to Custom
        await presetSelect.selectOption({ value: 'Custom' });

        // Verify custom values restored (in mm)
        await expect(widthInputMm).toHaveValue('317.50');
        await expect(heightInputMm).toHaveValue('469.90');
    });
});
