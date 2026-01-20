import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    // Warm up server before tests run
    globalSetup: './tests/e2e/global-setup.ts',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    // Enable retries for stability: 2 in CI, 1 locally
    retries: process.env.CI ? 2 : 1,
    // Allow parallel execution - CLI can override (e.g., --workers=16)
    // Default to 50% of CPUs to leave room for browser processes
    workers: process.env.CI ? 4 : '50%',
    reporter: 'html',
    use: {
        baseURL: 'http://localhost:5173',
        trace: 'on-first-retry',
        // Capture video on retry for debugging flaky tests
        video: 'on-first-retry',
        acceptDownloads: true,
        // Action timeout for individual actions (clicks, fills, etc.)
        actionTimeout: 15000,
        // Navigation timeout for page.goto
        navigationTimeout: 30000,
        // Ensure each test gets a fresh storage state
        storageState: undefined,
    },
    // Global test timeout (increased for parallel execution)
    timeout: 90000,
    // Expect timeout for assertions
    expect: {
        timeout: 30000,
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'firefox',
            use: {
                ...devices['Desktop Firefox'],
                launchOptions: {
                    firefoxUserPrefs: {
                        'webgl.disabled': false,
                        'webgl.force-enabled': true,
                        'layers.acceleration.force-enabled': true,
                    },
                },
            },
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
        },
    ],
    webServer: {
        command: 'npm run dev --prefix ..',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
    },
});
