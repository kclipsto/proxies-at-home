/**
 * Import Stats Tracker
 * Tracks timing and counts for card import operations.
 * Call start() at the beginning of an import, track events, and finish() for summary.
 */

export interface ImportStats {
    // Timing (all in ms from performance.now())
    startTime: number;
    imageLoadStartTime?: number;
    imageLoadEndTime?: number;
    processingStartTime?: number;
    processingEndTime?: number;
    enrichmentStartTime?: number;
    enrichmentEndTime?: number;
    endTime?: number;

    // Counts
    totalCards: number;
    imagesProcessed: number;
    imagesFailed: number;
    cardsEnriched: number;
    enrichmentsFailed: number;

    // Request stats
    proxyRequestCount: number;
    scryfallRequestCount: number;
    cacheHits: number;
    cacheMisses: number;
}

class ImportStatsTracker {
    private stats: ImportStats = this.getDefaultStats();
    private isActive = false;
    private cacheHitUuids: Set<string> = new Set();
    private cacheMissUuids: Set<string> = new Set();
    private pendingCardUuids: Set<string> = new Set();
    private validUuids: Set<string> = new Set();
    private hasLoggedSummary = false;
    private expectingEnrichment = false;

    private getDefaultStats(): ImportStats {
        return {
            startTime: 0,
            totalCards: 0,
            imagesProcessed: 0,
            imagesFailed: 0,
            cardsEnriched: 0,
            enrichmentsFailed: 0,
            proxyRequestCount: 0,
            scryfallRequestCount: 0,
            cacheHits: 0,
            cacheMisses: 0,
        };
    }

    start(totalCards: number, cardUuids?: string[], opts?: { awaitEnrichment?: boolean }) {
        this.stats = {
            ...this.getDefaultStats(),
            startTime: performance.now(),
            totalCards,
        };
        this.isActive = true;
        this.hasLoggedSummary = false;
        this.pendingCardUuids = new Set(cardUuids || []);
        this.validUuids = new Set(cardUuids || []);
        this.expectingEnrichment = !!opts?.awaitEnrichment;
        this.cacheHitUuids.clear();
        this.cacheMissUuids.clear();
        console.log(`[Import Stats] Started import of ${totalCards} cards`);
    }

    /**
     * Register card UUIDs that need processing (for batched registration after start)
     */
    registerPendingCards(uuids: string[]) {
        if (!this.isActive) return;
        uuids.forEach(uuid => {
            this.pendingCardUuids.add(uuid);
            this.validUuids.add(uuid);
        });
    }

    /**
     * Mark enrichment as complete. This removes the enrichment gate for the summary.
     */
    markEnrichmentComplete() {
        if (!this.isActive) return;
        this.expectingEnrichment = false;
        this.finish();
    }

    /**
     * Mark a card as processed. If all cards are done, log summary.
     */
    markCardProcessed(uuid: string) {
        if (!this.isActive) return;
        if (this.pendingCardUuids.delete(uuid)) {
            this.stats.imagesProcessed++;
        }

        if (this.pendingCardUuids.size === 0 && !this.hasLoggedSummary) {
            this.finish();
        }
    }

    /**
     * Mark a card as failed. If all cards are done, log summary.
     */
    markCardFailed(uuid: string) {
        if (!this.isActive) return;
        if (this.pendingCardUuids.delete(uuid)) {
            this.stats.imagesFailed++;
        }

        if (this.pendingCardUuids.size === 0 && !this.hasLoggedSummary) {
            this.finish();
        }
    }

    getPendingCount(): number {
        return this.pendingCardUuids.size;
    }


    markImageLoadStart() {
        if (!this.isActive) return;
        this.stats.imageLoadStartTime = performance.now();
    }

    markImageLoadEnd() {
        if (!this.isActive) return;
        this.stats.imageLoadEndTime = performance.now();
    }

    markProcessingStart() {
        if (!this.isActive) return;
        this.stats.processingStartTime = performance.now();
    }

    markProcessingEnd() {
        if (!this.isActive) return;
        this.stats.processingEndTime = performance.now();
    }

    markEnrichmentStart() {
        if (!this.isActive) return;
        this.stats.enrichmentStartTime = performance.now();
    }

    markEnrichmentEnd() {
        if (!this.isActive) return;
        this.stats.enrichmentEndTime = performance.now();
    }

    incrementImagesProcessed() {
        if (!this.isActive) return;
        this.stats.imagesProcessed++;
    }

    incrementImagesFailed() {
        if (!this.isActive) return;
        this.stats.imagesFailed++;
    }

    incrementCardsEnriched(count: number) {
        if (!this.isActive) return;
        this.stats.cardsEnriched += count;
    }

    incrementEnrichmentFailed() {
        if (!this.isActive) return;
        this.stats.enrichmentsFailed++;
    }

    incrementProxyRequest() {
        if (!this.isActive) return;
        this.stats.proxyRequestCount++;
    }

    incrementScryfallRequest() {
        if (!this.isActive) return;
        this.stats.scryfallRequestCount++;
    }

    markCacheHit(uuid: string) {
        if (!this.isActive) return;
        // Only count if this card isn't already processed as miss
        // AND if this card is actually part of the current import batch
        if (!this.cacheMissUuids.has(uuid) && this.validUuids.has(uuid)) {
            this.cacheHitUuids.add(uuid);
            this.stats.cacheHits = this.cacheHitUuids.size;
        }
    }

    markCacheMiss(uuid: string) {
        if (!this.isActive) return;
        this.cacheMissUuids.add(uuid);
        this.cacheHitUuids.delete(uuid); // If it was counted as hit, remove it (unlikely sequence but safe)
        this.stats.cacheHits = this.cacheHitUuids.size; // Update hits in case we removed one
        this.stats.cacheMisses = this.cacheMissUuids.size;
    }

    finish() {
        // Only finish if no pending cards AND not waiting for enrichment
        if (!this.isActive || this.hasLoggedSummary || this.pendingCardUuids.size > 0 || this.expectingEnrichment) return;

        this.stats.endTime = performance.now();
        this.hasLoggedSummary = true;
        this.logSummary();
        this.isActive = false;
    }

    private logSummary() {
        const s = this.stats;
        const totalTime = (s.endTime! - s.startTime) / 1000;
        const loadTime = s.imageLoadEndTime && s.imageLoadStartTime
            ? (s.imageLoadEndTime - s.imageLoadStartTime) / 1000 : 0;
        let processTime = s.processingEndTime && s.processingStartTime
            ? (s.processingEndTime - s.processingStartTime) / 1000 : 0;

        // If processing time is 0 (not explicitly tracked), infer it as Total - ImageLoad - Enrichment (approx)
        // Or simpler: Total - ImageLoad
        if (processTime === 0 && totalTime > 0) {
            processTime = Math.max(0, totalTime - loadTime);
            // Verify log logic: "Enrichment" runs in parallel often, so subtracting it might be wrong.
            // But usually Processing is the main blocker.
        }
        const enrichTime = s.enrichmentEndTime && s.enrichmentStartTime
            ? (s.enrichmentEndTime - s.enrichmentStartTime) / 1000 : 0;

        console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    IMPORT SUMMARY                            ║
╠══════════════════════════════════════════════════════════════╣
║  Total Time:        ${totalTime.toFixed(2).padStart(8)}s
║  ├── Image Load:    ${loadTime.toFixed(2).padStart(8)}s
║  ├── Processing:    ${processTime.toFixed(2).padStart(8)}s
║  └── Metadata:      ${enrichTime.toFixed(2).padStart(8)}s (parallel)
╠══════════════════════════════════════════════════════════════╣
║  Cards:             ${String(s.totalCards).padStart(8)}
║  Images Processed:  ${String(s.imagesProcessed).padStart(8)} (${s.imagesFailed} failed)
║  Metadata Fetched:  ${String(s.cardsEnriched).padStart(8)} (${s.enrichmentsFailed} failed)
╠══════════════════════════════════════════════════════════════╣
║  DB Cache Hits:     ${String(s.cacheHits).padStart(8)}
║  DB Cache Misses:   ${String(s.cacheMisses).padStart(8)}
╚══════════════════════════════════════════════════════════════╝
    `);
    }

    getStats(): ImportStats {
        return { ...this.stats };
    }

    isTracking(): boolean {
        return this.isActive;
    }
}

export const importStats = new ImportStatsTracker();
