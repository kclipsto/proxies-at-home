import cron from 'node-cron';
import { shouldImport, downloadAndImportBulkData, getLastImportTime } from './bulkDataService.js';
import { getCardCount, getDbSizeBytes, formatBytes } from '../db/proxxiedCardLookup.js';

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
 * Run the bulk data import (non-blocking).
 */
async function runImport(): Promise<void> {
    if (isImporting) {
        console.log('[Scheduler] Import already in progress. Skipping.');
        return;
    }

    isImporting = true;

    try {
        const result = await downloadAndImportBulkData();
        const dbSize = formatBytes(getDbSizeBytes());
        console.log(`[Scheduler] Import complete: ${result.cardsImported} cards in ${(result.durationMs / 1000 / 60).toFixed(1)} minutes. DB size: ${dbSize}`);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[Scheduler] Import failed:', msg);
    } finally {
        isImporting = false;
    }
}

// TODO: Add admin endpoint for manual re-import trigger
