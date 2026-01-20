import { Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const fixturesDir = path.join(__dirname, 'fixtures');

/**
 * Load a fixture JSON file
 */
export function loadFixture(filename: string): unknown {
    const filePath = path.join(fixturesDir, filename);
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Setup API mocking for Scryfall search endpoint.
 * Intercepts /api/scryfall/search and returns mock data based on query.
 */
export async function mockScryfallSearch(page: Page) {
    await page.route('**/api/scryfall/search*', async (route) => {
        const url = new URL(route.request().url());
        const query = url.searchParams.get('q')?.toLowerCase() || '';

        let fixture = 'scryfall-forest.json';
        if (query.includes('mountain')) {
            fixture = 'scryfall-mountain.json';
        } else if (query.includes('forest')) {
            fixture = 'scryfall-forest.json';
        }

        const data = loadFixture(fixture);
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(data),
        });
    });
}

/**
 * Setup API mocking for Scryfall prints endpoint.
 * Intercepts /api/scryfall/prints and returns mock data.
 */
export async function mockScryfallPrints(page: Page) {
    await page.route('**/api/scryfall/prints*', async (route) => {
        const url = new URL(route.request().url());
        const name = url.searchParams.get('name')?.toLowerCase() || '';

        let fixture = 'scryfall-forest.json';
        if (name.includes('mountain')) {
            fixture = 'scryfall-mountain.json';
        }

        const data = loadFixture(fixture);
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(data),
        });
    });
}

/**
 * Fill decklist and click fetch cards button
 */
export async function loadCards(page: Page, cardList: string) {
    const textarea = page.getByPlaceholder('1x Sol Ring');
    await textarea.fill(cardList);
    await page.getByRole('button', { name: 'Fetch Cards' }).click();
}

/**
 * Wait for specific number of cards to be loaded
 */
export async function waitForCardCount(page: Page, count: number, timeout = 30000) {
    const { expect } = await import('@playwright/test');
    await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(count, { timeout });
}

/**
 * Open artwork modal by clicking on first card
 */
export async function openArtworkModal(page: Page) {
    const { expect } = await import('@playwright/test');
    await page.locator('[data-dnd-sortable-item]').first().click();
    await expect(page.getByText(/Select Artwork for/)).toBeVisible({ timeout: 10000 });
}

/**
 * Get all artwork cards in the modal
 */
export function getArtworkCards(page: Page) {
    return page.getByTestId('artwork-card');
}
