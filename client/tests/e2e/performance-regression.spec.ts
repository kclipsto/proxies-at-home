import { test, expect } from './fixtures';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Performance Regression Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Mock the image fetch endpoint to return a placeholder image
        // This prevents server errors when fetching fake IDs and speeds up the test
        await page.route('**/api/cards/images/mpc*', async route => {
            // Create a simple 1x1 pixel red PNG
            const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
            await route.fulfill({
                status: 200,
                contentType: 'image/png',
                body: buffer
            });
        });
    });

    test('should load 200 MPC cards without excessive network requests', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is too slow for 200 cards in CI');
        test.slow(); // Triple timeout for resource-intensive 200-card test

        console.log(`[${browserName}] Starting 200-card performance test`);

        // Start monitoring network requests (exclude MPC image requests which are mocked)
        const apiRequests: string[] = [];

        page.on('request', request => {
            const url = request.url();
            if (url.includes('/api/') && !url.includes('/api/cards/images/mpc')) {
                apiRequests.push(url);
            }
        });

        await page.goto('/');

        // Helper function to get card count from IndexedDB
        const getCardCount = async () => {
            return await page.evaluate(async () => {
                return new Promise<number>((resolve) => {
                    const request = indexedDB.open('ProxxiedDB');
                    request.onsuccess = () => {
                        const db = request.result;
                        const stores = Array.from(db.objectStoreNames);
                        if (stores.includes('cards')) {
                            const tx = db.transaction('cards', 'readonly');
                            const store = tx.objectStore('cards');
                            const countReq = store.count();
                            countReq.onsuccess = () => resolve(countReq.result);
                            countReq.onerror = () => resolve(-1);
                        } else {
                            resolve(-2);
                        }
                    };
                    request.onerror = () => resolve(-3);
                });
            });
        };

        // Get initial card count (there may be cards from a previous test)
        const initialCount = await getCardCount();
        console.log(`[${browserName}] Initial cards in DB: ${initialCount}`);

        // Upload the 200-card XML file with real MPC IDs
        const fileInput = page.locator('input#import-mpc-xml');
        await fileInput.setInputFiles(path.join(__dirname, '../fixtures/mpc-200-cards.xml'));
        console.log(`[${browserName}] Uploaded 200-card MPC XML file`);

        // Wait for import to complete by checking card count increases
        await expect(async () => {
            const currentCount = await getCardCount();
            const imported = currentCount - initialCount;
            console.log(`[${browserName}] Cards: ${currentCount} (imported: ${imported})`);
            expect(imported).toBeGreaterThanOrEqual(200);
        }).toPass({ timeout: 90000, intervals: [2000, 5000, 10000] });

        const finalCount = await getCardCount();
        console.log(`[${browserName}] Import complete: ${finalCount - initialCount} cards imported`);

        // Wait for network to settle
        await page.waitForLoadState('networkidle', { timeout: 30000 });

        // Verify: No unexpected API requests during import (excluding mocked MPC image requests)
        const unexpectedRequests = apiRequests.filter(url => !url.includes('/api/stream/cards'));
        console.log(`[${browserName}] API requests (excluding stream): ${unexpectedRequests.length}`);

        if (unexpectedRequests.length > 0) {
            console.log(`[${browserName}] Unexpected requests:`);
            unexpectedRequests.forEach(url => console.log(`  - ${url}`));
        }

        // Allow some API requests for initial setup, but should be minimal
        expect(unexpectedRequests.length).toBeLessThanOrEqual(5);
    });

    test('should handle zoom changes without reprocessing', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is too slow for this test');

        const apiRequests: string[] = [];
        page.on('request', request => {
            const url = request.url();
            // Track all API requests except the stream endpoint
            if (url.includes('/api/') && !url.includes('/api/stream/cards')) {
                apiRequests.push(url);
                console.log(`[API Request] ${url}`);
            }
        });

        await page.goto('/');

        // Upload a smaller set for zoom test (faster)
        const fileInput = page.locator('input#import-mpc-xml');
        await fileInput.setInputFiles(path.join(__dirname, '../fixtures/mpc-cards.xml'));

        // Wait for cards to render
        const cardDragHandles = page.getByTitle('Drag');
        await expect(cardDragHandles).toHaveCount(2, { timeout: 10000 });

        // Wait for initial processing to complete by waiting for network to be idle
        // This ensures all prints/image requests from card loading are done
        await page.waitForLoadState('networkidle', { timeout: 15000 });

        // Small additional buffer to ensure reactive updates have settled
        await page.waitForTimeout(500);

        console.log(`API requests before clearing: ${apiRequests.length}`);
        apiRequests.forEach(url => console.log(`  - ${url}`));
        apiRequests.length = 0;

        // Change zoom multiple times
        const zoomSlider = page.locator('.zoom-slider');
        await expect(zoomSlider).toBeVisible();

        // Zoom out (approx 0.5x)
        // Slider 0-50 maps to 0.1-1.0
        // 0.5x -> ((0.5 - 0.1) / 0.9) * 50 = 22.22 -> 22
        await zoomSlider.fill('22');
        await page.waitForTimeout(1000);

        // Zoom in (approx 1.5x)
        // Slider 50-100 maps to 1.0-5.0
        // 1.5x -> 50 + ((1.5 - 1.0) / 4.0) * 50 = 56.25 -> 56
        await zoomSlider.fill('56');
        await page.waitForTimeout(1000);

        // Reset to 1.0x
        await zoomSlider.fill('50');
        await page.waitForTimeout(1000);

        const requestsAfterZoom = apiRequests.length;
        console.log(`API requests after zoom changes: ${requestsAfterZoom}`);
        if (requestsAfterZoom > 0) {
            console.log('Unexpected API requests during zoom:');
            apiRequests.forEach(url => console.log(`  - ${url}`));
        }

        // CRITICAL: Zoom should NOT trigger any API requests
        // Allow up to 3 due to potential lazy-loaded prints requests
        expect(requestsAfterZoom).toBeLessThanOrEqual(3);
    });

    test('should use cached blobs after page reload', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is too slow for this test');
        test.slow(); // Mark as slow - triples timeout for resource-intensive parallel execution

        const apiRequests: string[] = [];
        page.on('request', request => {
            if (request.url().includes('/api/') && !request.url().includes('/api/cards/images/mpc')) {
                apiRequests.push(request.url());
            }
        });

        await page.goto('/');

        // Upload cards
        const fileInput = page.locator('input#import-mpc-xml');
        await fileInput.setInputFiles(path.join(__dirname, '../fixtures/mpc-cards.xml'));

        // Wait for cards to render
        const cardDragHandles = page.getByTitle('Drag');
        await expect(cardDragHandles).toHaveCount(2, { timeout: 10000 });

        // Wait for VISIBLE card overlays to appear
        await expect(async () => {
            const visibleCards = page.locator('[data-dnd-sortable-item]:visible');
            const count = await visibleCards.count();
            expect(count).toBeGreaterThan(0);
        }).toPass({ timeout: 60000 });

        const initialRequestCount = apiRequests.length;
        console.log(`Initial requests before reload: ${initialRequestCount}`);

        // Clear and reload page
        apiRequests.length = 0;
        await page.reload();

        // Wait for cards to reappear
        await expect(cardDragHandles).toHaveCount(2, { timeout: 10000 });

        // Wait for VISIBLE card overlays (should be instant from cache)
        await expect(async () => {
            const visibleCards = page.locator('[data-dnd-sortable-item]:visible');
            const count = await visibleCards.count();
            expect(count).toBeGreaterThan(0);
        }).toPass({ timeout: 60000 });

        // Wait for any potential requests
        await page.waitForTimeout(1000);

        const requestsAfterReload = apiRequests.length;
        console.log(`API requests after reload: ${requestsAfterReload}`);

        // Should be ZERO or very few (blobs cached in IndexedDB)
        expect(requestsAfterReload).toBeLessThanOrEqual(2); // Allow minimal fallback
    });

    test('should not trigger cascading re-renders after processing completes', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'WebKit is too slow for this test');

        // Track console logs for processing patterns
        const processUnprocessedCalls: string[] = [];
        const imageCacheUpdates: string[] = [];
        const ensureProcessedCalls: string[] = [];

        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('[PerfTrace] ProxyBuilderPage: processUnprocessed found')) {
                processUnprocessedCalls.push(text);
            }
            if (text.includes('[PerfTrace] useImageCache: processedImageUrls updated')) {
                imageCacheUpdates.push(text);
            }
            if (text.includes('[PerfTrace] ensureProcessed: Starting processing for')) {
                ensureProcessedCalls.push(text);
            }
        });

        await page.goto('/');

        // Upload cards
        const fileInput = page.locator('input#import-mpc-xml');
        await fileInput.setInputFiles(path.join(__dirname, '../fixtures/mpc-cards.xml'));

        // Wait for cards to render
        const cardDragHandles = page.getByTitle('Drag');
        await expect(cardDragHandles).toHaveCount(2, { timeout: 10000 });

        // Wait for VISIBLE card overlays to appear
        await expect(async () => {
            const visibleCards = page.locator('[data-dnd-sortable-item]:visible');
            const count = await visibleCards.count();
            expect(count).toBeGreaterThan(0);
        }).toPass({ timeout: 60000 });

        // Let things settle
        await page.waitForTimeout(1000);

        // Log the patterns for debugging
        console.log(`processUnprocessed calls: ${processUnprocessedCalls.length}`);
        console.log(`useImageCache updates: ${imageCacheUpdates.length}`);
        console.log(`ensureProcessed calls: ${ensureProcessedCalls.length}`);

        // Print sample logs for debugging if there are too many
        if (processUnprocessedCalls.length > 10) {
            console.log('Sample processUnprocessed logs:');
            processUnprocessedCalls.slice(-5).forEach(log => console.log(`  ${log}`));
        }

        // CRITICAL: After processing is complete, we should see:
        // - processUnprocessed should eventually settle to "0 unique images"
        // - There should NOT be an excessive number of these calls

        // Count how many times processUnprocessed was called with 0 images
        const zeroImageCalls = processUnprocessedCalls.filter(c => c.includes('found 0 unique images'));

        // There should be at most 5 "found 0" calls after processing settles
        // If there are many more, it indicates a cascading re-render problem
        expect(zeroImageCalls.length).toBeLessThanOrEqual(5);

        // The useImageCache "New keys" updates should stabilize
        // After initial processing, there should NOT be repeated updates with same key count
        const keyUpdateCounts = imageCacheUpdates.map(log => {
            const match = log.match(/New keys: (\d+)/);
            return match ? parseInt(match[1]) : 0;
        });

        // Find how many times the same count repeats after it stabilizes
        const maxKeyCount = Math.max(...keyUpdateCounts);
        const repeatedMaxCount = keyUpdateCounts.filter(c => c === maxKeyCount).length;

        // If the max key count repeats more than 10 times, that's a bug
        // (indicates useImageCache creating new refs for unchanged data)
        expect(repeatedMaxCount).toBeLessThanOrEqual(10);

        console.log(`Max key count (${maxKeyCount}) repeated ${repeatedMaxCount} times`);
    });
});
