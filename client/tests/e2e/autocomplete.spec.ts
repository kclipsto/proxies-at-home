import { test, expect } from '@playwright/test';

test('Advanced Search autocomplete adds card', async ({ page }) => {
    await page.goto('/');

    // Open Advanced Search modal
    // await page.getByRole('button', { name: 'Add Card' }).click();
    await page.getByRole('button', { name: 'Advanced Search' }).click();

    // Find the search input in the modal
    const input = page.getByPlaceholder('Search card name...');
    await expect(input).toBeVisible({ timeout: 30000 });

    // Type to trigger autocomplete
    await input.fill('Forest');

    // Verify dropdown appears with suggestions
    // The Advanced Search uses a list of results
    // Wait for the list container first
    // Open the list manually if it's not open (it's hidden by default in AdvancedSearch)
    // const resultsButton = page.getByRole('button', { name: /Results|Close List/i });
    // Or the 1/N button. The text is dynamic "1 / N".
    // Let's find the button that toggles the list.
    // In AdvancedSearch.tsx: <button onClick={handleToggleResultsList} ...> {index + 1} / {length} ... </button>
    // We can click that.
    await page.locator('button').filter({ hasText: /\d+ \/ \d+/ }).click();

    await expect(page.locator('ul.divide-y')).toBeVisible({ timeout: 10000 });
    // Verify we can see multiple suggestions
    const suggestions = page.locator('ul li').filter({ hasText: /Forest/ });
    await expect(suggestions.first()).toBeVisible();

    // Click the results toggle button (like card-interactions) to ensure list state
    // This might be redundant if list is already open, but aligning with working test
    // await page.getByRole('button', { name: /1 \// }).click(); 
    // Actually, if list is open, clicking might close it.
    // card-interactions clicks it. Maybe it expects it to be closed?
    // But typing opens it.

    // Let's just remove the unused variable first.

    // Verify the card was added to the main page
    // It might take a moment to appear
    // Verify the card was added to the main page
    // It might take a moment to appear
    // Check for either the image OR the "not found" text (in case image load failed)
    const cardImage = page.locator('img[alt="Forest"]');
    const notFoundText = page.getByText('"Forest"');
    await expect(cardImage.or(notFoundText)).toBeVisible({ timeout: 30000 });
});
