import { test, expect } from './fixtures';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('upload image', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

    await page.goto('/');

    // Upload the image file via unified input
    const fileInput = page.locator('input#upload-images-unified');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/sliver-legion.jpg'));

    // Wait for card to be rendered
    await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(1, { timeout: 30000 });
});
