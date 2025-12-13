import { useState, useEffect, useRef, useCallback } from "react";
import { db } from "../db";
import { API_BASE } from "../constants";
import { getCurrentSession } from "../helpers/ImportSession";
import { useToastStore } from "../store/toast";
import { getEnrichmentAbortController } from "../helpers/cancellationService";

// Retry configuration with exponential backoff
const ENRICHMENT_RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 120000,
    multiplier: 8,
    jitterFactor: 0.3,
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
            const allCards = await db.cards.toArray();

            // Note: Dexie may store booleans as true/false or 1/0 depending on version
            // Use filter on all cards for reliability
            const unenrichedCards = allCards.filter((card) => {
                if (!card.needsEnrichment) return false;
                if (card.enrichmentNextRetryAt && card.enrichmentNextRetryAt > now) return false;
                // Skip if max retries exceeded
                if ((card.enrichmentRetryCount ?? 0) >= ENRICHMENT_RETRY_CONFIG.maxRetries) {
                    return false;
                }
                return true;
            });

            if (unenrichedCards.length === 0) {
                isEnrichingRef.current = false;
                return;
            }

            setEnrichmentProgress({ current: 0, total: unenrichedCards.length });

            // Show metadata toast
            useToastStore.getState().showMetadataToast();

            // Get shared abort controller (can be cancelled by clearAllProcessing)
            const abortController = getEnrichmentAbortController();

            // Batch enrich via server endpoint
            const batches = chunkArray(unenrichedCards, 50);


            for (const batch of batches) {
                if (abortController.signal.aborted) break;

                try {
                    // Check cache for each card in batch first
                    const cardsToFetch: typeof batch = [];
                    const cachedDataMap = new Map<string, EnrichedCardData>();

                    await Promise.all(batch.map(async (card) => {
                        try {
                            // Lookup by name, then filter by set/number.
                            const targetSet = card.set || '';
                            const targetNum = card.number || '';

                            const cached = await db.cardMetadataCache
                                .where('name').equals(card.name)
                                .and(item => {
                                    if (targetSet && item.set !== targetSet) return false;
                                    if (targetNum && item.number !== targetNum) return false;
                                    return true;
                                })
                                .first();

                            if (cached) {
                                // Touch cachedAt
                                db.cardMetadataCache.update(cached.id, { cachedAt: Date.now() });
                                cachedDataMap.set(card.uuid, cached.data as unknown as EnrichedCardData);
                            } else {
                                cardsToFetch.push(card);
                            }
                        } catch {
                            cardsToFetch.push(card);
                        }
                    }));

                    // Fetch only missing cards.
                    let validResponses: (EnrichedCardData | null)[] = [];

                    if (cardsToFetch.length > 0) {
                        const response = await fetch(`${API_BASE}/api/cards/images/enrich`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                cards: cardsToFetch.map((c) => ({
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

                        validResponses = await response.json();

                        // Cache the new results
                        try {
                            const entriesToCache: { id: string, name: string, set: string, number: string, data: unknown, cachedAt: number, size: number }[] = [];

                            validResponses.forEach((data) => {
                                if (data) {
                                    const jsonStr = JSON.stringify(data);
                                    const size = new Blob([jsonStr]).size;

                                    entriesToCache.push({
                                        id: crypto.randomUUID(),
                                        name: data.name,
                                        set: data.set || '',
                                        number: data.number || '',
                                        data: data as unknown,
                                        cachedAt: Date.now(),
                                        size: size
                                    });
                                }
                            });

                            if (entriesToCache.length > 0) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                await db.cardMetadataCache.bulkPut(entriesToCache as any[]);
                            }
                        } catch (e) {
                            console.warn("[Metadata] Failed to cache results:", e);
                        }
                    }

                    // Update each card in DB (Merging cached and fetched data)
                    await db.transaction("rw", db.cards, async () => {
                        // Pointer for fetched responses
                        let fetchIndex = 0;

                        for (let i = 0; i < batch.length; i++) {
                            const card = batch[i];
                            let data: EnrichedCardData | null | undefined;

                            if (cachedDataMap.has(card.uuid)) {
                                data = cachedDataMap.get(card.uuid);
                            } else {
                                data = validResponses[fetchIndex++];
                            }

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
                            } else {
                                // Card not found in enrichment response.
                                const retryCount = (card.enrichmentRetryCount ?? 0) + 1;
                                if (retryCount >= ENRICHMENT_RETRY_CONFIG.maxRetries) {
                                    // Max retries exceeded.
                                    console.warn(`[Metadata] Max retries exceeded for: ${card.name} (UUID: ${card.uuid})`);
                                    await db.cards.update(card.uuid, {
                                        needsEnrichment: false,
                                        enrichmentRetryCount: retryCount,
                                    });
                                } else {
                                    // Schedule retry.
                                    const nextRetryAt = Date.now() + getRetryDelay(retryCount - 1);
                                    await db.cards.update(card.uuid, {
                                        enrichmentRetryCount: retryCount,
                                        enrichmentNextRetryAt: nextRetryAt,
                                    });
                                }
                            }
                        }
                    });


                } catch (error) {
                    if ((error as Error).name === "AbortError") {
                        break;
                    }
                    console.error("[Metadata] Batch error:", error);

                    // Schedule retry for failed batch.
                    await db.transaction("rw", db.cards, async () => {
                        for (const card of batch) {
                            const retryCount = (card.enrichmentRetryCount ?? 0) + 1;
                            const nextRetryAt = Date.now() + getRetryDelay(retryCount - 1);
                            await db.cards.update(card.uuid, {
                                enrichmentRetryCount: retryCount,
                                enrichmentNextRetryAt: nextRetryAt,
                            });
                            if (retryCount >= ENRICHMENT_RETRY_CONFIG.maxRetries) {
                                // Max retries exceeded.
                                await db.cards.update(card.uuid, {
                                    needsEnrichment: false,
                                    enrichmentRetryCount: retryCount,
                                });
                            }
                        }
                    });
                }
            }

            // Mark enrichment complete for MPC imports that await it
            getCurrentSession()?.markEnrichmentComplete();

            // Hide metadata toast
            useToastStore.getState().hideMetadataToast();

            setEnrichmentProgress(null);
        } finally {
            isEnrichingRef.current = false;
        }
    }, []);

    // Trigger enrichment when cards are added.
    useEffect(() => {
        const checkAndEnrich = async () => {
            const count = await db.cards.where("needsEnrichment").equals(1).count();
            if (count > 0 && !isEnrichingRef.current) {
                await enrichCards();
            }
        };

        const initialTimer = setTimeout(checkAndEnrich, 1000);
        const retryInterval = setInterval(checkAndEnrich, 30000);

        return () => {
            clearTimeout(initialTimer);
            clearInterval(retryInterval);
            // Note: abort is handled by cancelAllProcessing from cancellationService
        };
    }, [enrichCards]);

    // Listen for database changes.
    useEffect(() => {
        // Trigger enrichment after short delay.
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
