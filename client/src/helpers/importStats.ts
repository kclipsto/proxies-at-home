/**
 * Import Stats Tracker
 * Tracks timing and counts for card import operations.
 * Call start() at the beginning of an import, track events, and finish() for summary.
 */

import { useToastStore } from '../store/toast';

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
    dbHits: number;           // Hits from existing processed blobs in DB
    cacheMisses: number;
    persistentCacheHits: number; // Hits from LRU raw image cache
    metadataCacheHits: number;
}

export type ImportType = 'scryfall' | 'mpc' | 'upload' | 'unknown';

class ImportStatsTracker {
    private stats: ImportStats = this.getDefaultStats();
    private isActive = false;
    private cacheHitUuids: Set<string> = new Set();
    private cacheMissUuids: Set<string> = new Set();
    private pendingCardUuids: Set<string> = new Set();
    private validUuids: Set<string> = new Set();
    private hasLoggedSummary = false;
    private expectingEnrichment = false;
    private importType: ImportType = 'unknown';

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
            dbHits: 0,
            cacheMisses: 0,
            persistentCacheHits: 0,
            metadataCacheHits: 0,
        };
    }

    start(totalCards: number, cardUuids?: string[], opts?: { awaitEnrichment?: boolean; importType?: ImportType }) {
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
        this.importType = opts?.importType || 'unknown';
        this.cacheHitUuids.clear();
        this.cacheMissUuids.clear();
        console.log(`[Import Stats] Started ${this.importType} import of ${totalCards} cards`);

        // Show processing toast
        useToastStore.getState().showProcessingToast();
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
            this.stats.dbHits = this.cacheHitUuids.size;
        }
    }

    markCacheMiss(uuid: string) {
        if (!this.isActive) return;
        this.cacheMissUuids.add(uuid);
        this.cacheHitUuids.delete(uuid); // If it was counted as hit, remove it (unlikely sequence but safe)
        this.stats.dbHits = this.cacheHitUuids.size; // Update hits in case we removed one
        this.stats.cacheMisses = this.cacheMissUuids.size;
    }

    incrementPersistentCacheHit() {
        if (!this.isActive) return;
        this.stats.persistentCacheHits++;
    }

    incrementMetadataCacheHit() {
        if (!this.isActive) return;
        this.stats.metadataCacheHits++;
    }

    finish() {
        // Only finish if no pending cards AND not waiting for enrichment
        if (!this.isActive || this.hasLoggedSummary || this.pendingCardUuids.size > 0 || this.expectingEnrichment) return;

        this.stats.endTime = performance.now();
        this.hasLoggedSummary = true;
        this.logSummary();
        this.isActive = false;

        // Hide processing toast
        useToastStore.getState().hideProcessingToast();
    }

    forceFinish() {
        //force finish when we can not find a card art
        if (!this.isActive || this.hasLoggedSummary) return;

        this.stats.endTime = performance.now();
        this.hasLoggedSummary = true;
        this.logSummary();
        this.isActive = false;
        this.pendingCardUuids.clear();

        useToastStore.getState().hideProcessingToast();
    }

    private logSummary() {
        const s = this.stats;
        const totalTime = (s.endTime! - s.startTime) / 1000;
        const loadTime = s.imageLoadEndTime && s.imageLoadStartTime
            ? (s.imageLoadEndTime - s.imageLoadStartTime) / 1000 : 0;
        let processTime = s.processingEndTime && s.processingStartTime
            ? (s.processingEndTime - s.processingStartTime) / 1000 : 0;

        // If processing time is 0 (not explicitly tracked), infer it as Total - ImageLoad
        if (processTime === 0 && totalTime > 0) {
            processTime = Math.max(0, totalTime - loadTime);
        }
        const enrichTime = s.enrichmentEndTime && s.enrichmentStartTime
            ? (s.enrichmentEndTime - s.enrichmentStartTime) / 1000 : 0;

        // Helper to pad content to box width (62 chars inside borders)
        const pad = (content: string) => content.padEnd(62);

        // Customize labels based on import type
        const isScryfall = this.importType === 'scryfall';
        const loadLabel = isScryfall ? 'Scryfall Fetch:' : 'Image Load:    ';
        const titleText = isScryfall ? 'DECK TEXT IMPORT SUMMARY' : 'IMPORT SUMMARY';
        // Box inner width is 62 chars, center the title
        const title = titleText.padStart(Math.floor((62 + titleText.length) / 2)).padEnd(62);

        // Build summary lines
        let summary = `
╔══════════════════════════════════════════════════════════════╗
║${title}║
╠══════════════════════════════════════════════════════════════╣
║${pad(`  Total Time:        ${totalTime.toFixed(2).padStart(8)}s`)}║
║${pad(`  ├── ${loadLabel}${loadTime.toFixed(2).padStart(8)}s`)}║
║${pad(`  └── Processing:    ${processTime.toFixed(2).padStart(8)}s`)}║`;

        // Only show metadata line for imports that use enrichment
        if (!isScryfall) {
            summary += `
║${pad(`      Metadata:      ${enrichTime.toFixed(2).padStart(8)}s (parallel)`)}║`;
        }

        summary += `
╠══════════════════════════════════════════════════════════════╣
║${pad(`  Cards:             ${String(s.totalCards).padStart(8)}`)}║
║${pad(`  Images Processed:  ${String(s.imagesProcessed).padStart(8)} (${s.imagesFailed} failed)`)}║`;

        // Only show metadata fetched for imports that use enrichment
        if (!isScryfall) {
            summary += `
║${pad(`  Metadata Fetched:  ${String(s.cardsEnriched).padStart(8)}`)}║
║${pad(`  ├── Network:       ${String(s.cardsEnriched - s.metadataCacheHits).padStart(8)} (${s.enrichmentsFailed} failed)`)}║
║${pad(`  └── Cache Hits:    ${String(s.metadataCacheHits).padStart(8)}`)}║`;
        }

        summary += `
╠══════════════════════════════════════════════════════════════╣
║${pad(`  Network Fetches:   ${String(s.totalCards - s.dbHits - s.persistentCacheHits).padStart(8)} (${s.imagesFailed} failed)`)}║
║${pad(`  Image Cache Hits:  ${String(s.persistentCacheHits).padStart(8)}`)}║
║${pad(`  Processed DB Hits: ${String(s.dbHits).padStart(8)}`)}║
╚══════════════════════════════════════════════════════════════╝`;
        console.log(summary);
    }

    getStats(): ImportStats {
        return { ...this.stats };
    }

    isTracking(): boolean {
        return this.isActive;
    }
}

export const importStats = new ImportStatsTracker();

