import { chromium, FullConfig } from '@playwright/test';

/**
 * Global setup that runs once before all tests.
 * Warms up the server to reduce initial connection latency.
 */
async function globalSetup(config: FullConfig) {
    const baseURL = config.projects[0].use.baseURL || 'http://localhost:5173';

    // Launch a browser to warm up the server
    const browser = await chromium.launch();
    const page = await browser.newPage();

    try {
        // Navigate to the app to ensure server is ready
        await page.goto(baseURL, { timeout: 60000 });
        // Wait for the app to be interactive
        await page.waitForLoadState('networkidle', { timeout: 30000 });
        console.log('Server warmed up successfully');
    } catch (error) {
        console.log('Server warmup had issues, but continuing:', error);
    } finally {
        await browser.close();
    }
}

export default globalSetup;
