import { useState, useEffect, useRef, useCallback } from "react";
import { db } from "../db";
import { API_BASE } from "../constants";
import { importStats } from "../helpers/importStats";
import { useToastStore } from "../store/toast";
import { getEnrichmentAbortController } from "../helpers/cancellationService";

// Retry configuration with exponential backoff
const ENRICHMENT_RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,      // 1 second
    maxDelayMs: 120000,     // 2 minutes cap
    multiplier: 8,          // 1s → 8s → 64s (ensures 3rd retry is ~1min later)
    jitterFactor: 0.3,      // ±30% jitter
};

function getRetryDelay(attempt: number): number {
    const delay = ENRICHMENT_RETRY_CONFIG.baseDelayMs * Math.pow(ENRICHMENT_RETRY_CONFIG.multiplier, attempt);
    const capped = Math.min(delay, ENRICHMENT_RETRY_CONFIG.maxDelayMs);
    const jitter = capped * ENRICHMENT_RETRY_CONFIG.jitterFactor * (Math.random() * 2 - 1);
    return capped + jitter;
}

function chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

export interface EnrichmentProgress {
    current: number;
    total: number;
}

interface EnrichedCardData {
    name: string;
    set?: string;
    number?: string;
    colors?: string[];
    mana_cost?: string;
    cmc?: number;
    type_line?: string;
    rarity?: string;
    lang?: string;
}

export function useCardEnrichment() {
    const [enrichmentProgress, setEnrichmentProgress] = useState<EnrichmentProgress | null>(null);
    const isEnrichingRef = useRef(false);

    const enrichCards = useCallback(async () => {
        if (isEnrichingRef.current) return;
        isEnrichingRef.current = true;

        try {
            // Get all cards that need enrichment and are ready for retry
            const now = Date.now();

            // Debug: Log all cards and their needsEnrichment status
            const allCards = await db.cards.toArray();
            const cardsNeedingEnrichment = allCards.filter(c => c.needsEnrichment);
            console.log(`[Metadata] All cards: ${allCards.length}, Cards with needsEnrichment=true: ${cardsNeedingEnrichment.length}`);
            if (cardsNeedingEnrichment.length > 0) {
                console.log("[Metadata] Sample card needing metadata:", cardsNeedingEnrichment[0]);
            }

            // Note: Dexie may store booleans as true/false or 1/0 depending on version
            // Use filter on all cards for reliability
            const unenrichedCards = allCards.filter((card) => {
                if (!card.needsEnrichment) return false;
                // Skip cards that are scheduled for later retry
                if (card.enrichmentNextRetryAt && card.enrichmentNextRetryAt > now) {
                    return false;
                }
                // Skip cards that have exceeded max retries
                if ((card.enrichmentRetryCount ?? 0) >= ENRICHMENT_RETRY_CONFIG.maxRetries) {
                    return false;
                }
                return true;
            });

            console.log(`[Metadata] Cards ready for fetch: ${unenrichedCards.length}`);

            if (unenrichedCards.length === 0) {
                isEnrichingRef.current = false;
                console.log("[Metadata] No cards to fetch - returning");
                return;
            }

            console.log(`[Metadata] Starting fetch for ${unenrichedCards.length} cards`);
            const startTime = performance.now();
            setEnrichmentProgress({ current: 0, total: unenrichedCards.length });

            // Show metadata toast
            useToastStore.getState().showMetadataToast();

            // Track enrichment stats
            if (importStats.isTracking()) {
                importStats.markEnrichmentStart();
            }

            // Get shared abort controller (can be cancelled by clearAllProcessing)
            const abortController = getEnrichmentAbortController();

            // Batch enrich via server endpoint
            const batches = chunkArray(unenrichedCards, 50);
            let enrichedCount = 0;
            let failedCount = 0;
            let retryingCount = 0;

            for (const batch of batches) {
                if (abortController.signal.aborted) break;

                const batchStart = performance.now();

                try {
                    const response = await fetch(`${API_BASE}/api/cards/images/enrich`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            cards: batch.map((c) => ({
                                name: c.name,
                                set: c.set,
                                number: c.number,
                            })),
                        }),
                        signal: abortController.signal,
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    const enrichedData: (EnrichedCardData | null)[] = await response.json();
                    console.log(`[Metadata] Batch of ${batch.length} cards: ${(performance.now() - batchStart).toFixed(0)}ms`);

                    // Update each card in DB
                    await db.transaction("rw", db.cards, async () => {
                        let batchEnrichedCount = 0;
                        for (let i = 0; i < batch.length; i++) {
                            const card = batch[i];
                            const data = enrichedData[i];

                            if (data) {
                                await db.cards.update(card.uuid, {
                                    colors: data.colors,
                                    cmc: data.cmc,
                                    type_line: data.type_line,
                                    rarity: data.rarity,
                                    mana_cost: data.mana_cost,
                                    lang: data.lang,
                                    set: data.set || card.set,
                                    number: data.number || card.number,
                                    needsEnrichment: false,
                                    enrichmentRetryCount: undefined,
                                    enrichmentNextRetryAt: undefined,
                                });
                                batchEnrichedCount++;
                            } else {
                                // Card not found in enrichment response - schedule retry
                                const retryCount = (card.enrichmentRetryCount ?? 0) + 1;
                                if (retryCount >= ENRICHMENT_RETRY_CONFIG.maxRetries) {
                                    // Max retries exceeded - give up
                                    console.warn(`[Metadata] Max retries exceeded for: ${card.name} (UUID: ${card.uuid})`);
                                    await db.cards.update(card.uuid, {
                                        needsEnrichment: false,
                                        enrichmentRetryCount: retryCount,
                                    });
                                    importStats.incrementEnrichmentFailed();
                                    failedCount++;
                                } else {
                                    // Schedule retry
                                    const nextRetryAt = Date.now() + getRetryDelay(retryCount - 1);
                                    console.log(`[Metadata] Card failed fetch, scheduling retry ${retryCount}: ${card.name}`);
                                    await db.cards.update(card.uuid, {
                                        enrichmentRetryCount: retryCount,
                                        enrichmentNextRetryAt: nextRetryAt,
                                    });
                                    retryingCount++;
                                }
                            }
                        }
                        importStats.incrementCardsEnriched(batchEnrichedCount);
                        enrichedCount += batchEnrichedCount;
                    });


                } catch (error) {
                    if ((error as Error).name === "AbortError") {
                        console.log("[Metadata] Aborted");
                        break;
                    }
                    console.error("[Metadata] Batch failed:", error);

                    // Schedule retry for all cards in failed batch
                    await db.transaction("rw", db.cards, async () => {
                        for (const card of batch) {
                            const retryCount = (card.enrichmentRetryCount ?? 0) + 1;
                            const nextRetryAt = Date.now() + getRetryDelay(retryCount - 1);
                            await db.cards.update(card.uuid, {
                                enrichmentRetryCount: retryCount,
                                enrichmentNextRetryAt: nextRetryAt,
                            });
                            if (retryCount >= ENRICHMENT_RETRY_CONFIG.maxRetries) {
                                // Max retries exceeded - give up
                                console.warn(`[Enrichment] Max retries exceeded for: ${card.name} (UUID: ${card.uuid}) due to batch failure`);
                                await db.cards.update(card.uuid, {
                                    needsEnrichment: false,
                                    enrichmentRetryCount: retryCount,
                                });
                                importStats.incrementEnrichmentFailed();
                                failedCount++;
                            } else {
                                const nextRetryAt = Date.now() + getRetryDelay(retryCount - 1);
                                await db.cards.update(card.uuid, {
                                    enrichmentRetryCount: retryCount,
                                    enrichmentNextRetryAt: nextRetryAt,
                                });
                                retryingCount++;
                            }
                        }
                    });
                }
            }


            console.log(`
╔══════════════════════════════════════════════════════════════╗
║              METADATA FETCH COMPLETE                         ║
╠══════════════════════════════════════════════════════════════╣
║  Time:                 ${((performance.now() - startTime) / 1000).toFixed(2)}s
║  Cards Fetched:        ${enrichedCount}
║  Cards Failed:         ${failedCount}
║  Cards Retrying:       ${retryingCount}
╚══════════════════════════════════════════════════════════════╝
            `);

            // Mark enrichment end FIRST so stats are recorded
            if (importStats.isTracking()) {
                importStats.markEnrichmentEnd();
            }

            // THEN signal complete, which triggers the summary log
            importStats.markEnrichmentComplete();

            // Hide metadata toast
            useToastStore.getState().hideMetadataToast();

            setEnrichmentProgress(null);
        } finally {
            isEnrichingRef.current = false;
        }
    }, []);

    // Trigger enrichment when cards are added
    useEffect(() => {
        // Check for unenriched cards periodically
        const checkAndEnrich = async () => {
            const count = await db.cards.where("needsEnrichment").equals(1).count();
            if (count > 0 && !isEnrichingRef.current) {
                await enrichCards();
            }
        };

        // Initial check after a short delay
        const initialTimer = setTimeout(checkAndEnrich, 1000);

        // Periodic check for retries
        const retryInterval = setInterval(checkAndEnrich, 30000);

        return () => {
            clearTimeout(initialTimer);
            clearInterval(retryInterval);
            // Note: abort is handled by cancelAllProcessing from cancellationService
        };
    }, [enrichCards]);

    // Also listen for database changes
    useEffect(() => {
        // Use a simple approach - trigger enrichment after short delay when cards might be added
        // The periodic check will handle the actual enrichment
        const handler = () => {
            setTimeout(() => {
                if (!isEnrichingRef.current) {
                    void enrichCards();
                }
            }, 1500);
        };

        // Subscribe to creating hook
        db.cards.hook("creating", handler);

        return () => {
            db.cards.hook("creating").unsubscribe(handler);
        };
    }, [enrichCards]);

    const cancelEnrichment = useCallback(() => {
        // Use the shared cancellation service to abort
        getEnrichmentAbortController().abort();
        setEnrichmentProgress(null);
    }, []);

    return { enrichmentProgress, cancelEnrichment };
}
