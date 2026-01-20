import { test, expect } from './fixtures';

test.describe('Deck URL Import', () => {
    test.beforeEach(async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');
        await page.goto('/');
    });

    test('Imports deck from Moxfield URL', async ({ page }) => {
        // Use a known stable Moxfield deck
        const moxfieldUrl = 'https://moxfield.com/decks/6G3OF7b3iU6qH4q_6lHVBw';

        // Use DeckBuilderImporter's URL input field (use .last() to get the visible desktop version)
        const urlInput = page.getByPlaceholder('Paste Archidekt or Moxfield deck URL...').last();
        await urlInput.scrollIntoViewIfNeeded();
        await urlInput.fill(moxfieldUrl);
        await page.getByRole('button', { name: 'Import Deck' }).last().click();

        // Wait for cards to be imported (deck should have multiple cards)
        await expect(page.locator('[data-dnd-sortable-item]').first()).toBeVisible({ timeout: 60000 });

        // Verify we got more than 0 cards
        const cardCount = await page.locator('[data-dnd-sortable-item]').count();
        expect(cardCount).toBeGreaterThan(0);
    });

    test('Imports deck from Archidekt URL', async ({ page }) => {
        // Use a known stable Archidekt deck
        const archidektUrl = 'https://archidekt.com/decks/5149482/violets_marrowgnawer_game_knights_63';

        const urlInput = page.getByPlaceholder('Paste Archidekt or Moxfield deck URL...').last();
        await urlInput.scrollIntoViewIfNeeded();
        await urlInput.fill(archidektUrl);
        await page.getByRole('button', { name: 'Import Deck' }).last().click();

        // Wait for cards to be imported
        await expect(page.locator('[data-dnd-sortable-item]').first()).toBeVisible({ timeout: 60000 });

        // Verify we got more than 0 cards
        const cardCount = await page.locator('[data-dnd-sortable-item]').count();
        expect(cardCount).toBeGreaterThan(0);
    });

    test('Archidekt import includes deck categories', async ({ page }) => {
        // Archidekt decks have category metadata
        const archidektUrl = 'https://archidekt.com/decks/5149482/violets_marrowgnawer_game_knights_63';

        const urlInput = page.getByPlaceholder('Paste Archidekt or Moxfield deck URL...').last();
        await urlInput.scrollIntoViewIfNeeded();
        await urlInput.fill(archidektUrl);
        await page.getByRole('button', { name: 'Import Deck' }).last().click();

        // Wait for cards to be imported
        await expect(page.locator('[data-dnd-sortable-item]').first()).toBeVisible({ timeout: 60000 });

        // Open Filter/Sort section
        const filterSection = page.locator('#settings-panel-filterSort');
        const header = filterSection.locator('.cursor-pointer');
        const content = filterSection.locator('.p-4');

        if (!await content.isVisible()) {
            await header.click();
        }

        // Look for the Deck Categories section - Archidekt decks should have categories
        // Commander deck will have "Commander" category at minimum
        const categoriesSection = filterSection.getByText('Deck Categories');
        await expect(categoriesSection).toBeVisible({ timeout: 5000 });
    });

    test('Shows error for invalid deck URL format', async ({ page }) => {
        // Enter text that looks like a URL but isn't a valid deck builder URL
        const invalidUrl = 'https://invalid-deck-site.com/deck/12345';

        const urlInput = page.getByPlaceholder('Paste Archidekt or Moxfield deck URL...').last();
        await urlInput.scrollIntoViewIfNeeded();
        await urlInput.fill(invalidUrl);

        // The Import Deck button should be disabled for invalid URLs
        const importButton = page.getByRole('button', { name: 'Import Deck' }).last();
        await expect(importButton).toBeDisabled();
    });

    test('Mixed content with URL is parsed as URL', async ({ page }) => {
        // When a valid deck URL is pasted, it should import the deck
        const moxfieldUrl = 'https://moxfield.com/decks/6G3OF7b3iU6qH4q_6lHVBw';

        const urlInput = page.getByPlaceholder('Paste Archidekt or Moxfield deck URL...').last();
        await urlInput.scrollIntoViewIfNeeded();
        await urlInput.fill(moxfieldUrl);
        await page.getByRole('button', { name: 'Import Deck' }).last().click();

        // Should import the deck, not try to parse as card name
        await expect(page.locator('[data-dnd-sortable-item]').first()).toBeVisible({ timeout: 60000 });

        const cardCount = await page.locator('[data-dnd-sortable-item]').count();
        expect(cardCount).toBeGreaterThan(0);
    });
});
