import { test, expect } from './fixtures';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('upload standard image', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

    await page.goto('/');

    // Upload the image file via unified input (default mode is "Without Bleed" = standard)
    const fileInput = page.locator('input#upload-images-unified');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/irenicus.png'));

    // Wait for card to be rendered
    await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(1, { timeout: 30000 });
});
