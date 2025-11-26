import { test, expect } from '@playwright/test';
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
        test.skip(browserName === 'webkit', 'WebKit is flaky in this environment');
        test.slow(); // Mark as slow - triples timeout for resource-intensive parallel execution

        // 1. Upload XML to get cards
        const xmlPath = path.join(__dirname, '../fixtures/mpc-cards.xml');
        await page.locator('input#import-mpc-xml').setInputFiles(xmlPath);

        // 2. Wait for cards to render and images to process
        await expect(page.getByTitle('Drag')).toHaveCount(2, { timeout: 30_000 });
        const images = page.locator('.proxy-page img');
        await expect(images).toHaveCount(2);

        // Ensure images are fully loaded/processed before export
        for (let i = 0; i < 2; i++) {
            await expect(images.nth(i)).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });
            await expect(async () => {
                const naturalWidth = await images.nth(i).evaluate((el: HTMLImageElement) => el.naturalWidth);
                expect(naturalWidth).toBeGreaterThan(0);
            }).toPass({ timeout: 30_000 });
        }

        // 3. Trigger Export
        // The "Export to PDF" button is in the settings panel.
        // We might need to make sure it's enabled (it is disabled if no cards).
        const exportBtn = page.getByRole('button', { name: 'Export to PDF' });
        await expect(exportBtn).toBeEnabled();

        // Setup download listener
        const downloadPromise = page.waitForEvent('download');
        await exportBtn.click();
        const download = await downloadPromise;

        // 4. Verify filename
        expect(download.suggestedFilename()).toMatch(/proxxies_.*\.pdf/);

        // 5. Save and Validate PDF
        const downloadPath = await download.path();
        // download.path() gives a temporary path. We can read it directly.
        // Note: download.path() might be null if the download failed or is not local. 
        // In Playwright, it usually works for local execution.
        expect(downloadPath).toBeTruthy();

        const pdfBytes = fs.readFileSync(downloadPath!);
        const pdfDoc = await PDFDocument.load(pdfBytes);

        // 6. Assertions
        // We have 2 cards. Default layout is 3x3 (9 cards per page). So should be 1 page.
        expect(pdfDoc.getPageCount()).toBe(1);

        const firstPage = pdfDoc.getPages()[0];
        const { width, height } = firstPage.getSize();

        // Default is Letter (612x792) or A4 (595.28x841.89).
        // Allow for either.
        const isLetter = Math.abs(width - 612) < 1 && Math.abs(height - 792) < 1;
        const isA4 = Math.abs(width - 595.28) < 1 && Math.abs(height - 841.89) < 1;

        expect(isLetter || isA4).toBeTruthy();

        // 7. Structural Validation: Check for embedded images
        // The PDF should contain exactly 1 image (the flattened page content).
        // We can inspect the PDF's objects to find images.

        // Access the page's resources
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
                    // Images are typically streams with Subtype = Image
                    if (xObject instanceof PDFStream) {
                        const dict = xObject.dict;
                        const subtype = dict.lookup(PDFName.of('Subtype'));
                        if (subtype === PDFName.of('Image')) {
                            console.log(`  Subtype: ${subtype}`);
                            imageCount++;

                            // Check dimensions (High Res for 300 DPI)
                            // The worker flattens the page into a single image.
                            // So the image dimensions should match the page size in pixels at 300 DPI.
                            // Letter: 8.5 x 11 in * 300 DPI = 2550 x 3300 px
                            // A4: 210 x 297 mm * 300 DPI = ~2480 x ~3508 px

                            const width = dict.lookup(PDFName.of('Width'));
                            const height = dict.lookup(PDFName.of('Height'));

                            const w = Number(width?.toString());
                            const h = Number(height?.toString());
                            console.log(`  Dimensions: ${w}x${h}`);

                            expect(w).toBeGreaterThan(2000);
                            expect(h).toBeGreaterThan(3000);

                            // Visual Comparison
                            // Extract the raw image data
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const rawBytes = (xObject as any).contents;
                            expect(rawBytes).toBeTruthy();

                            // We can use Playwright's snapshot testing on the buffer
                            // This will verify the actual pixel content of the generated PDF page image
                            expect(Buffer.from(rawBytes)).toMatchSnapshot('pdf-export-page-1.jpg', {
                                maxDiffPixelRatio: 0.01 // Allow 1% difference for rendering variations
                            });
                        }
                    }
                }
            }
        }
        // Expect 1 image because the worker flattens the page
        expect(imageCount).toBe(1);
    });
});
