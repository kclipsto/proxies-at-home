import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('mixed uploads', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    const sliverPath = path.join(__dirname, '../fixtures/sliver-legion.jpg');
    const irenicusPath = path.join(__dirname, '../fixtures/irenicus.png');

    test('same file: MPC then Standard', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

        // Upload to MPC
        await page.locator('input#upload-mpc').setInputFiles(sliverPath);
        // Upload to Standard
        await page.locator('input#upload-standard').setInputFiles(sliverPath);

        // Verify 2 cards
        await expect(page.getByTitle('Drag')).toHaveCount(2, { timeout: 10_000 });

        // Verify images load
        const images = page.locator('.proxy-page img');
        await expect(images).toHaveCount(2);
        for (let i = 0; i < 2; i++) {
            await expect(images.nth(i)).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });
            await expect(async () => {
                const naturalWidth = await images.nth(i).evaluate((el: HTMLImageElement) => el.naturalWidth);
                expect(naturalWidth).toBeGreaterThan(0);
            }).toPass({ timeout: 30_000 });
        }
    });

    test('same file: Standard then MPC', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

        // Upload to Standard
        await page.locator('input#upload-standard').setInputFiles(sliverPath);
        // Upload to MPC
        await page.locator('input#upload-mpc').setInputFiles(sliverPath);

        // Verify 2 cards
        await expect(page.getByTitle('Drag')).toHaveCount(2, { timeout: 10_000 });

        // Verify images load
        const images = page.locator('.proxy-page img');
        await expect(images).toHaveCount(2);
        for (let i = 0; i < 2; i++) {
            await expect(images.nth(i)).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });
            await expect(async () => {
                const naturalWidth = await images.nth(i).evaluate((el: HTMLImageElement) => el.naturalWidth);
                expect(naturalWidth).toBeGreaterThan(0);
            }).toPass({ timeout: 30_000 });
        }
    });

    test('different files: Sliver (MPC) + Irenicus (Standard)', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

        await page.locator('input#upload-mpc').setInputFiles(sliverPath);
        await page.locator('input#upload-standard').setInputFiles(irenicusPath);

        await expect(page.getByTitle('Drag')).toHaveCount(2, { timeout: 10_000 });

        const images = page.locator('.proxy-page img');
        await expect(images).toHaveCount(2);
        for (let i = 0; i < 2; i++) {
            await expect(images.nth(i)).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });
            await expect(async () => {
                const naturalWidth = await images.nth(i).evaluate((el: HTMLImageElement) => el.naturalWidth);
                expect(naturalWidth).toBeGreaterThan(0);
            }).toPass({ timeout: 30_000 });
        }
    });

    test('different files: Sliver (Standard) + Irenicus (MPC)', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

        await page.locator('input#upload-standard').setInputFiles(sliverPath);
        await page.locator('input#upload-mpc').setInputFiles(irenicusPath);

        await expect(page.getByTitle('Drag')).toHaveCount(2, { timeout: 10_000 });

        const images = page.locator('.proxy-page img');
        await expect(images).toHaveCount(2);
        for (let i = 0; i < 2; i++) {
            await expect(images.nth(i)).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });
            await expect(async () => {
                const naturalWidth = await images.nth(i).evaluate((el: HTMLImageElement) => el.naturalWidth);
                expect(naturalWidth).toBeGreaterThan(0);
            }).toPass({ timeout: 30_000 });
        }
    });
});
