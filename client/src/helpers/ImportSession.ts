export type ImportType = 'archidekt' | 'moxfield' | 'scryfall' | 'mpc' | 'unknown';

export interface ImportSessionConfig {
    totalCards?: number;
    cardUuids?: string[];
    importType: ImportType;
    awaitEnrichment?: boolean;
}

export interface ImportSessionStats {
    totalCards: number;
    imagesProcessed: number;
    imagesFailed: number;
    persistentCacheHits: number;
    networkFetches: number;
    totalTimeMs: number;
    fetchTimeMs: number;
    processingTimeMs: number;
    importType: ImportType;
}

export class ImportSession {
    readonly id = crypto.randomUUID();
    readonly startTime = performance.now();
    readonly config: ImportSessionConfig;

    private readonly cardUuids = new Set<string>();
    private readonly processedUuids = new Set<string>();
    private readonly failedUuids = new Set<string>();
    private readonly persistentCacheHitUuids = new Set<string>();
    private readonly networkFetchUuids = new Set<string>();
    private readonly earlyProcessed = new Map<string, boolean>();
    private readonly earlyFailed = new Set<string>();

    fetchEndTime?: number;
    processingStartTime?: number;
    processingEndTime?: number;

    private isFinished = false;
    private enrichmentComplete = false;

    constructor(config: ImportSessionConfig) {
        this.config = config;
        config.cardUuids?.forEach(uuid => this.cardUuids.add(uuid));
    }

    registerUuids(uuids: string[]) {
        for (const uuid of uuids) {
            this.cardUuids.add(uuid);
            if (this.earlyProcessed.has(uuid)) {
                const fromCache = this.earlyProcessed.get(uuid)!;
                this.processedUuids.add(uuid);
                (fromCache ? this.persistentCacheHitUuids : this.networkFetchUuids).add(uuid);
                this.earlyProcessed.delete(uuid);
            } else if (this.earlyFailed.has(uuid)) {
                this.failedUuids.add(uuid);
                this.earlyFailed.delete(uuid);
            }
        }
    }

    markProcessed(uuid: string, fromPersistentCache: boolean) {
        if (this.isFinished) return;
        if (!this.cardUuids.has(uuid)) {
            // console.log('[PerfTrace] ImportSession: Early processed', uuid);
            this.earlyProcessed.set(uuid, fromPersistentCache);
            return;
        }
        if (!this.processedUuids.has(uuid)) {
            // console.log('[PerfTrace] ImportSession: Processed', uuid);
            this.processedUuids.add(uuid);
            (fromPersistentCache ? this.persistentCacheHitUuids : this.networkFetchUuids).add(uuid);
        }
        this.tryAutoFinish();
    }

    markFailed(uuid: string) {
        if (this.isFinished) return;
        if (!this.cardUuids.has(uuid)) {
            this.earlyFailed.add(uuid);
            return;
        }
        if (!this.failedUuids.has(uuid)) {
            this.failedUuids.add(uuid);
        }
        this.tryAutoFinish();
    }

    private tryAutoFinish() {
        if (!this.isFinished && this.isReadyToLog) this.finish();
    }

    markFetchComplete() {
        this.fetchEndTime ??= performance.now();
    }

    markProcessingStart() {
        this.processingStartTime ??= performance.now();
    }

    markProcessingComplete() {
        this.processingEndTime ??= performance.now();
    }

    markEnrichmentComplete() {
        this.enrichmentComplete = true;
    }

    get isComplete(): boolean {
        return this.processedUuids.size + this.failedUuids.size >= this.cardUuids.size;
    }

    get isReadyToLog(): boolean {
        return this.isComplete && (!this.config.awaitEnrichment || this.enrichmentComplete);
    }

    getStats(): ImportSessionStats {
        const now = performance.now();
        return {
            totalCards: this.cardUuids.size,
            imagesProcessed: this.processedUuids.size,
            imagesFailed: this.failedUuids.size,
            persistentCacheHits: this.persistentCacheHitUuids.size,
            networkFetches: this.networkFetchUuids.size,
            totalTimeMs: now - this.startTime,
            fetchTimeMs: this.fetchEndTime ? this.fetchEndTime - this.startTime : 0,
            processingTimeMs: this.processingStartTime && this.processingEndTime
                ? this.processingEndTime - this.processingStartTime
                : 0,
            importType: this.config.importType,
        };
    }

    finish(): ImportSessionStats | null {
        if (this.isFinished) return null;
        this.isFinished = true;
        this.markProcessingComplete();
        const stats = this.getStats();
        this.logSummary(stats);
        return stats;
    }

    forceFinish(): ImportSessionStats | null {
        if (this.isFinished) return null;
        const pending = this.cardUuids.size - this.processedUuids.size - this.failedUuids.size;
        if (pending > 0) {
            const missing = [...this.cardUuids].filter(
                uuid => !this.processedUuids.has(uuid) && !this.failedUuids.has(uuid)
            );
            console.warn(`[ImportSession] ${pending} cards never processed:`, missing);
        }
        return this.finish();
    }

    private logSummary(stats: ImportSessionStats) {
        const title = this.getImportTitle();
        const pad = (s: string) => s.padEnd(62);
        const fmt = (n: number) => (n / 1000).toFixed(2).padStart(6);

        const lines = [
            `╔══════════════════════════════════════════════════════════════╗`,
            `║${title.padStart(Math.floor(31 + title.length / 2)).padEnd(62)}║`,
            `╠══════════════════════════════════════════════════════════════╣`,
            `║${pad(`  Total Time:           ${fmt(stats.totalTimeMs)}s`)}║`,
            `║${pad(`  ├── Fetch:            ${fmt(stats.fetchTimeMs)}s`)}║`,
            `║${pad(`  └── Processing:       ${fmt(stats.processingTimeMs)}s`)}║`,
            `╠══════════════════════════════════════════════════════════════╣`,
            `║${pad(`  Cards:                ${String(stats.totalCards).padStart(6)}`)}║`,
            `║${pad(`  Images Processed:     ${String(stats.imagesProcessed).padStart(6)} (${stats.imagesFailed} failed)`)}║`,
            `╠══════════════════════════════════════════════════════════════╣`,
            `║${pad(`  Cache Hits:           ${String(stats.persistentCacheHits).padStart(6)}`)}║`,
            `║${pad(`  Network Fetches:      ${String(stats.networkFetches).padStart(6)}`)}║`,
            `╚══════════════════════════════════════════════════════════════╝`,
        ];
        console.log('\n' + lines.join('\n'));
    }

    private getImportTitle(): string {
        switch (this.config.importType) {
            case 'archidekt': return 'ARCHIDEKT IMPORT SUMMARY';
            case 'scryfall': return 'DECK TEXT IMPORT SUMMARY';
            case 'mpc': return 'MPC XML IMPORT SUMMARY';
            default: return 'IMPORT SUMMARY';
        }
    }
}

// Global session state
let currentSession: ImportSession | null = null;
const globalEarlyProcessed = new Map<string, boolean>();
const globalEarlyFailed = new Set<string>();

export function createImportSession(config: ImportSessionConfig): ImportSession {
    currentSession?.forceFinish();
    currentSession = new ImportSession(config);

    // Transfer buffered results
    for (const uuid of config.cardUuids ?? []) {
        if (globalEarlyProcessed.has(uuid)) {
            currentSession.markProcessed(uuid, globalEarlyProcessed.get(uuid)!);
            globalEarlyProcessed.delete(uuid);
        } else if (globalEarlyFailed.has(uuid)) {
            currentSession.markFailed(uuid);
            globalEarlyFailed.delete(uuid);
        }
    }
    return currentSession;
}

export function getCurrentSession(): ImportSession | null {
    return currentSession;
}

export function clearCurrentSession(): void {
    currentSession = null;
    globalEarlyProcessed.clear();
    globalEarlyFailed.clear();
}

export function hasActiveSession(): boolean {
    return currentSession !== null && !currentSession.isComplete;
}

export function markCardProcessed(uuid: string, fromPersistentCache: boolean): void {
    if (currentSession) {
        currentSession.markProcessed(uuid, fromPersistentCache);
    } else {
        globalEarlyProcessed.set(uuid, fromPersistentCache);
    }
}

export function markCardFailed(uuid: string): void {
    if (currentSession) {
        currentSession.markFailed(uuid);
    } else {
        globalEarlyFailed.add(uuid);
    }
}
