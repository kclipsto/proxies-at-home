import { test, expect } from './fixtures';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('upload both images at once', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

    await page.goto('/');

    // Upload both files at once via unified input
    const fileInput = page.locator('input#upload-images-unified');
    const fixturePath1 = path.join(__dirname, '../fixtures/sliver-legion.jpg');
    const fixturePath2 = path.join(__dirname, '../fixtures/irenicus.png');
    await fileInput.setInputFiles([fixturePath1, fixturePath2]);

    // Verify 2 cards
    await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(2, { timeout: 30000 });
});
