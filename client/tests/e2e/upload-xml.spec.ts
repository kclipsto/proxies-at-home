import { test, expect } from './fixtures';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('upload mpc xml', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

    await page.goto('/');

    // Upload the XML file via the MPC XML import input
    const fileInput = page.locator('input#import-mpc-xml');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/mpc-cards.xml'));

    // Wait for cards to be rendered
    await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(2, { timeout: 30000 });
});
