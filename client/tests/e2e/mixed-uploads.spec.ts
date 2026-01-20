import { test, expect } from './fixtures';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('File Uploads', () => {
    test.beforeEach(async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');
        await page.goto('/');
    });

    const sliverPath = path.join(__dirname, '../fixtures/sliver-legion.jpg');
    const irenicusPath = path.join(__dirname, '../fixtures/irenicus.png');

    test('should upload multiple images at once', async ({ page }) => {
        const fileInput = page.locator('input#upload-images-unified');
        await fileInput.setInputFiles([sliverPath, irenicusPath]);

        // Verify 2 cards appeared
        await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(2, { timeout: 30000 });
    });

    test('should upload single image', async ({ page }) => {
        const fileInput = page.locator('input#upload-images-unified');
        await fileInput.setInputFiles(sliverPath);

        // Verify 1 card appeared
        await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(1, { timeout: 30000 });
    });
});
