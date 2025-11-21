import { test, expect } from '@playwright/test';

test.describe('Settings Persistence', () => {
    test('should persist column count after reload', async ({ page }) => {
        await page.goto('/');

        // Open Layout Settings if not already visible (assuming it might be in an accordion or similar)
        // Based on previous context, there is a LayoutSettings component.
        // We'll look for the input directly first.

        // Locate the Columns input.
        // In PageSettingsControls.tsx: <Label>Columns</Label> followed by <TextInput ... placeholder={columns.toString()} />
        // We can find the input by the label "Columns"
        const columnsInput = page.getByLabel('Columns', { exact: true });

        // Ensure it's visible
        await expect(columnsInput).toBeVisible();

        // Change value to 4
        await columnsInput.fill('4');
        await columnsInput.blur(); // Trigger change

        // Verify it's set to 4
        await expect(columnsInput).toHaveValue('4');

        // Reload the page
        await page.reload();

        // Verify it's still 4
        await expect(columnsInput).toHaveValue('4');
    });
});
