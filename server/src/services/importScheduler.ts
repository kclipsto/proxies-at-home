import cron from 'node-cron';
import { shouldImport, downloadAndImportBulkData, getLastImportTime } from './bulkDataService.js';
import { getCardCount, getDbSizeBytes, formatBytes } from '../db/proxxiedCardLookup.js';
import { initCatalogs } from '../utils/scryfallCatalog.js';

let isImporting = false;

// Cron expression for scheduling imports
// Use '* * * * *' for testing (every minute)
// Use '0 3 * * 3' for production (Wednesday 3AM UTC)
const CRON_EXPRESSION = '0 3 * * 3';

/**
 * Calculate the next run time for a cron expression.
 */
function getNextRunTime(cronExpr: string): string {
    // Parse cron expression to determine next run
    const parts = cronExpr.split(' ');
    if (parts.length !== 5) return 'unknown';

    // Simple parsing for common patterns
    if (cronExpr === '* * * * *') {
        return 'every minute (TESTING MODE)';
    }

    const [minute, hour, , , dayOfWeek] = parts;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    if (dayOfWeek !== '*' && minute !== '*' && hour !== '*') {
        const dayName = days[parseInt(dayOfWeek, 10)] || `day ${dayOfWeek}`;
        return `every ${dayName} at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')} UTC`;
    }

    return `cron: ${cronExpr}`;
}

/**
 * Start the import scheduler.
 * - Runs based on CRON_EXPRESSION
 * - Triggers import on startup if needed (cold start)
 */
export function startImportScheduler(): void {
    console.log('[Scheduler] Starting import scheduler...');

    // Check if we need to import on startup
    const lastImport = getLastImportTime();
    const cardCount = getCardCount();
    const dbSize = formatBytes(getDbSizeBytes());

    console.log(`[Scheduler] Last import: ${lastImport || 'never'}`);
    console.log(`[Scheduler] Cards in database: ${cardCount} (${dbSize})`);

    const nextRunDescription = getNextRunTime(CRON_EXPRESSION);

    if (shouldImport()) {
        console.log('[Scheduler] Import needed. Starting background import...');
        runImport();
    } else {
        console.log(`[Scheduler] Database is up to date. Next import: ${nextRunDescription}`);
    }

    // Schedule the import
    cron.schedule(CRON_EXPRESSION, () => {
        console.log('[Scheduler] Scheduled import triggered.');
        runImport();
    }, {
        timezone: 'UTC',
    });

    console.log(`[Scheduler] Import scheduled: ${nextRunDescription}`);
}

/**
 * Run the bulk data import with retry logic.
 * Uses exponential backoff: 5 min, 30 min, 2 hours between retries.
 */
async function runImport(): Promise<void> {
    if (isImporting) {
        console.log('[Scheduler] Import already in progress. Skipping.');
        return;
    }

    isImporting = true;

    const RETRY_DELAYS_MS = [
        5 * 60 * 1000,    // 5 minutes
        30 * 60 * 1000,   // 30 minutes
        2 * 60 * 60 * 1000 // 2 hours
    ];
    const MAX_RETRIES = 3;

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= MAX_RETRIES) {
        try {
            if (attempt > 0) {
                console.log(`[Scheduler] Retry attempt ${attempt}/${MAX_RETRIES}...`);
            }

            const result = await downloadAndImportBulkData();
            const dbSize = formatBytes(getDbSizeBytes());
            console.log(`[Scheduler] Import complete: ${result.cardsImported} cards in ${(result.durationMs / 1000 / 60).toFixed(1)} minutes. DB size: ${dbSize}`);

            // Refresh type catalogs from Scryfall API after successful import
            await initCatalogs();

            isImporting = false;
            return; // Success - exit retry loop
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            const msg = lastError.message;

            if (attempt < MAX_RETRIES) {
                const delayMs = RETRY_DELAYS_MS[attempt];
                const delayMinutes = Math.round(delayMs / 60000);
                console.warn(`[Scheduler] Import failed: ${msg}. Retrying in ${delayMinutes} minutes...`);

                // Wait before next retry (release isImporting temporarily to allow graceful cancellation)
                await new Promise(resolve => setTimeout(resolve, delayMs));
            } else {
                console.error(`[Scheduler] Import failed after ${MAX_RETRIES} retries: ${msg}`);
            }

            attempt++;
        }
    }

    isImporting = false;
}
