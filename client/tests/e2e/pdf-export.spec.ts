import { test, expect } from './fixtures';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, PDFName, PDFDict, PDFStream } from 'pdf-lib';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('pdf export', () => {
    test.describe.configure({ mode: 'serial' });

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('export to PDF with validation', async ({ page, browserName }) => {
        // Skip WebKit (flaky)
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');

        test.setTimeout(90000);

        // 1. Upload XML to get cards - wait for page to be ready first
        await page.waitForLoadState('networkidle');

        const xmlPath = path.join(__dirname, '../fixtures/mpc-cards.xml');
        const fileInput = page.locator('input#import-mpc-xml');
        await expect(fileInput).toBeAttached({ timeout: 30000 });
        await fileInput.setInputFiles(xmlPath);

        // 2. Wait for cards to render (DOM elements)
        await expect(page.locator('[data-dnd-sortable-item]')).toHaveCount(2, { timeout: 20000 });

        // 3. Wait for card images to fully load - look for canvas or img elements in card area
        // Wait for network to settle after cards appear (images are being fetched)
        await page.waitForLoadState('networkidle');

        // Wait a bit more for WebGL rendering to complete (Firefox needs more time)
        await page.waitForTimeout(browserName === 'firefox' ? 5000 : 3000);

        // 4. Find export button
        const exportBtn = page.locator('button').filter({ hasText: 'Export to PDF' }).first();
        await expect(exportBtn).toBeVisible({ timeout: 10000 });
        await expect(exportBtn).toBeEnabled({ timeout: 5000 });

        // 4. Setup download listener BEFORE clicking
        const downloadPromise = page.waitForEvent('download', { timeout: 60000 });

        // 5. Click export button
        await exportBtn.click();

        // 6. Wait for download
        const download = await downloadPromise;

        // 7. Verify filename
        expect(download.suggestedFilename()).toMatch(/proxxies_.*\.pdf/);

        // 8. Save and Validate PDF
        const downloadPath = await download.path();
        expect(downloadPath).toBeTruthy();

        const pdfBytes = fs.readFileSync(downloadPath!);
        const pdfDoc = await PDFDocument.load(pdfBytes);

        // 9. Assertions - 2 cards on 1 page
        expect(pdfDoc.getPageCount()).toBe(1);

        const firstPage = pdfDoc.getPages()[0];
        const { width, height } = firstPage.getSize();

        // Default is Letter (612x792) or A4 (595.28x841.89)
        const isLetter = Math.abs(width - 612) < 1 && Math.abs(height - 792) < 1;
        const isA4 = Math.abs(width - 595.28) < 1 && Math.abs(height - 841.89) < 1;
        expect(isLetter || isA4).toBeTruthy();

        // 10. Check for embedded image
        const { Resources } = firstPage.node.normalizedEntries();
        let imageCount = 0;

        if (Resources) {
            const xObjects = Resources.get(PDFName.of('XObject'));
            if (xObjects instanceof PDFDict) {
                console.log('Found XObjects:', xObjects.keys());
                for (const key of xObjects.keys()) {
                    const xObject = xObjects.lookup(key);
                    if (!xObject) continue;
                    console.log(`Checking XObject ${key}:`, xObject.constructor.name);
                    if (xObject instanceof PDFStream) {
                        const dict = xObject.dict;
                        const subtype = dict.lookup(PDFName.of('Subtype'));
                        if (subtype === PDFName.of('Image')) {
                            console.log(`  Subtype: ${subtype}`);
                            imageCount++;

                            const imgWidth = dict.lookup(PDFName.of('Width'));
                            const imgHeight = dict.lookup(PDFName.of('Height'));

                            const w = Number(imgWidth?.toString());
                            const h = Number(imgHeight?.toString());
                            console.log(`  Dimensions: ${w}x${h}`);

                            expect(w).toBeGreaterThan(2000);
                            expect(h).toBeGreaterThan(3000);

                            // Visual Comparison
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const rawBytes = (xObject as any).contents;
                            expect(rawBytes).toBeTruthy();

                            expect(Buffer.from(rawBytes)).toMatchSnapshot('pdf-export-page-1.jpg', {
                                maxDiffPixelRatio: 0.01
                            });
                        }
                    }
                }
            }
        }
        expect(imageCount).toBe(1);
    });
});
