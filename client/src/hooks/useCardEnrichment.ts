import { useState, useEffect, useRef, useCallback } from "react";
import { db } from "../db";
import type { CardOption } from "@/types";
import { API_BASE } from "../constants";
import { getCurrentSession } from "../helpers/importSession";
import { useToastStore } from "../store/toast";
import { getEnrichmentAbortController } from "../helpers/cancellationService";
import { isCardbackId } from "../helpers/cardbackLibrary";
import { searchMpcAutofill, getMpcAutofillImageUrl } from "../helpers/mpcAutofillApi";
import { addRemoteImage } from "../helpers/dbUtils";
import { pickBestMpcCard } from "../helpers/mpcImportIntegration";
import { useSettingsStore } from "../store";

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
    // DFC Support
    layout?: string;
    card_faces?: Array<{
        name: string;
        type_line?: string;
        mana_cost?: string;
        colors?: string[];
        image_uris?: {
            large?: string;
            normal?: string;
            png?: string;
        };
    }>;
}

export function useCardEnrichment() {
    const [enrichmentProgress, setEnrichmentProgress] = useState<EnrichmentProgress | null>(null);
    const isEnrichingRef = useRef(false);
    // Track cards that have been fully processed (success or max retries exceeded)
    // to avoid re-checking them on every enrichment cycle
    const processedCardsRef = useRef<Set<string>>(new Set());

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
                // Skip back cards (cardbacks) - they never need metadata enrichment
                if (card.linkedFrontId) return false;
                // Skip cards using cardback images - they're not real Magic cards
                if (card.imageId && isCardbackId(card.imageId)) return false;
                // Skip cards already processed in this session
                if (processedCardsRef.current.has(card.uuid)) return false;
                if (card.enrichmentNextRetryAt && card.enrichmentNextRetryAt > now) return false;
                // Skip if max retries exceeded
                if ((card.enrichmentRetryCount ?? 0) >= ENRICHMENT_RETRY_CONFIG.maxRetries) {
                    // Mark as processed so we don't check again
                    processedCardsRef.current.add(card.uuid);
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

                    // Pre-fetch existing back cards to check if they need art enrichment
                    const existingBackIds = batch.map(c => c.linkedBackId).filter((id): id is string => !!id);
                    const existingBackCards = existingBackIds.length > 0 ? await db.cards.bulkGet(existingBackIds) : [];
                    const backCardMap = new Map(existingBackCards.filter(Boolean).map(c => [c!.uuid, c!]));

                    // Search for MPC matches for DFC back faces OUTSIDE the transaction
                    // Map of FrontUUID -> BackImageId

                    // Map of FrontUUID -> BackImageId
                    const backArtMap = new Map<string, string>();
                    // Map of FrontUUID -> FrontImageId (for fixing back-face imports)
                    const frontArtMap = new Map<string, string>();

                    // RE-Map validResponses to specific cards to avoid index confusion
                    const responseMap = new Map<string, EnrichedCardData>();
                    let responseIndex = 0;
                    batch.forEach(card => {
                        if (cachedDataMap.has(card.uuid)) {
                            responseMap.set(card.uuid, cachedDataMap.get(card.uuid)!);
                        } else {
                            // If it was fetched
                            const res = validResponses[responseIndex];
                            if (res) responseMap.set(card.uuid, res);
                            responseIndex++; // Only increment if we tried to fetch this card
                        }
                    });

                    // Perform MPC searches
                    await Promise.all(batch.map(async (card) => {
                        const data = responseMap.get(card.uuid);
                        if (!data) return;

                        if (data.card_faces && data.card_faces.length >= 2 && data.layout && ['transform', 'modal_dfc', 'mdfc', 'double_faced_token', 'flip', 'adventure'].includes(data.layout)) {
                            const front = data.card_faces[0];
                            const back = data.card_faces[1];
                            const existingBack = card.linkedBackId ? backCardMap.get(card.linkedBackId) : null;

                            // Check if we need to find art
                            // 1. New back card (no existing)
                            // 2. Existing back card uses default cardback or placeholder
                            // 3. Existing back card has undefined imageId
                            const needsBackArt = !existingBack || (existingBack.usesDefaultCardback || (existingBack.imageId && isCardbackId(existingBack.imageId)) || !existingBack.imageId);

                            // Check if the current card name matches the BACK face name.
                            // If so, the user imported the back face, but we are converting it to the front face.
                            // We need to fetch the FRONT face art.
                            const isBackFaceImport = card.name.trim().toLowerCase() === back.name.trim().toLowerCase();

                            // Process Back Art
                            if (needsBackArt) {
                                try {
                                    console.log(`[Enrichment] DFC Back Art Needed for ${back.name}. existingBack: ${!!existingBack}`);
                                    const mpcResults = await searchMpcAutofill(back.name);
                                    if (mpcResults && mpcResults.length > 0) {
                                        const settings = useSettingsStore.getState();
                                        const favSources = new Set(settings.favoriteMpcSources || []);
                                        const favTags = new Set(settings.favoriteMpcTags || []);
                                        const bestBack = pickBestMpcCard(mpcResults, favSources, favTags);

                                        if (bestBack) {
                                            const backUrl = getMpcAutofillImageUrl(bestBack.identifier);
                                            // this creates its own transaction on images table, safe to parallelize
                                            const imgId = await addRemoteImage([backUrl], 1);
                                            console.log(`[Enrichment] Got back imageId: ${imgId}`);
                                            if (imgId) backArtMap.set(card.uuid, imgId);
                                        }
                                    }
                                } catch (e) {
                                    console.warn(`[Enrichment] Failed MPC search for ${back.name}`, e);
                                }
                            }

                            // Process Front Art (Fixing back-face import)
                            if (isBackFaceImport) {
                                try {
                                    console.log(`[Enrichment] Back-face import detected (${card.name}). Fetching correct Front art for ${front.name}...`);
                                    const mpcResults = await searchMpcAutofill(front.name);
                                    if (mpcResults && mpcResults.length > 0) {
                                        const settings = useSettingsStore.getState();
                                        const favSources = new Set(settings.favoriteMpcSources || []);
                                        const favTags = new Set(settings.favoriteMpcTags || []);
                                        const bestFront = pickBestMpcCard(mpcResults, favSources, favTags);

                                        if (bestFront) {
                                            const frontUrl = getMpcAutofillImageUrl(bestFront.identifier);
                                            const imgId = await addRemoteImage([frontUrl], 1);
                                            console.log(`[Enrichment] Fixed Front imageId: ${imgId}`);
                                            if (imgId) frontArtMap.set(card.uuid, imgId);
                                        }
                                    }
                                } catch (e) {
                                    console.warn(`[Enrichment] Failed to fix front art for ${front.name}`, e);
                                }
                            }
                        }
                    }));


                    // Update each card in DB (Merging cached and fetched data) using bulk operations
                    await db.transaction("rw", db.cards, async () => {
                        // Prepare bulk updates
                        const successUpdates: { key: string; changes: Partial<CardOption> }[] = [];
                        const retryUpdates: { key: string; changes: Partial<CardOption> }[] = [];
                        const newCards: CardOption[] = [];

                        for (const card of batch) {
                            const data = responseMap.get(card.uuid);

                            if (data) {
                                // Default updates (for single face or DFC front)
                                const updates: Partial<CardOption> = {
                                    name: data.name,
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
                                };

                                // DFC Handling
                                if (data.card_faces && data.card_faces.length >= 2 && data.layout && ['transform', 'modal_dfc', 'mdfc', 'double_faced_token', 'flip', 'adventure'].includes(data.layout)) {
                                    // 1. Update Front Face (Name, Type, Stats)
                                    const front = data.card_faces[0];
                                    updates.name = front.name;
                                    updates.type_line = front.type_line || data.type_line;
                                    updates.mana_cost = front.mana_cost || data.mana_cost;
                                    updates.colors = front.colors || data.colors;


                                    // 2. Handle Back Face
                                    const back = data.card_faces[1];
                                    const existingBack = card.linkedBackId ? backCardMap.get(card.linkedBackId) : null;
                                    const newBackArtId = backArtMap.get(card.uuid);
                                    const newFrontArtId = frontArtMap.get(card.uuid);

                                    // Apply Front Art Fix if needed
                                    if (newFrontArtId) {
                                        updates.imageId = newFrontArtId;
                                        updates.usesDefaultCardback = false;
                                        // Ensure we mark it as NOT user upload so it behaves like a normal MPC card
                                        updates.isUserUpload = false;
                                        // Since we swapped the identity to Front, but the user imported the Back name, flip it to show the Back.
                                        updates.isFlipped = true;
                                    }

                                    if (existingBack) {
                                        // Update existing back link
                                        const backChanges: Partial<CardOption> = {
                                            name: back.name,
                                            type_line: back.type_line,
                                            mana_cost: back.mana_cost,
                                            colors: back.colors,
                                            needsEnrichment: false
                                        };
                                        if (newBackArtId) {
                                            backChanges.imageId = newBackArtId;
                                            backChanges.usesDefaultCardback = false;
                                        }
                                        successUpdates.push({
                                            key: existingBack.uuid,
                                            changes: backChanges
                                        });

                                    } else {
                                        // Create New Back Card
                                        const backUuid = crypto.randomUUID();
                                        const newBackCard: CardOption = {
                                            uuid: backUuid,
                                            name: back.name,
                                            type_line: back.type_line || "",
                                            mana_cost: back.mana_cost || "",
                                            colors: back.colors || [],
                                            set: data.set || card.set || "",
                                            number: data.number || card.number || "",
                                            order: card.order,
                                            isUserUpload: false,
                                            linkedFrontId: card.uuid,

                                            imageId: newBackArtId, // Might be undefined -> placeholder
                                            usesDefaultCardback: !newBackArtId,

                                            needsEnrichment: false,
                                        };

                                        newCards.push(newBackCard);
                                        updates.linkedBackId = backUuid;
                                    }
                                }

                                successUpdates.push({
                                    key: card.uuid,
                                    changes: updates,
                                });
                                processedCardsRef.current.add(card.uuid);
                            } else {
                                // Error handling
                                const retryCount = (card.enrichmentRetryCount ?? 0) + 1;
                                if (retryCount >= ENRICHMENT_RETRY_CONFIG.maxRetries) {
                                    console.warn(`[Metadata] Max retries exceeded for: ${card.name} (UUID: ${card.uuid})`);
                                    retryUpdates.push({
                                        key: card.uuid,
                                        changes: {
                                            needsEnrichment: false,
                                            enrichmentRetryCount: retryCount,
                                        },
                                    });
                                    processedCardsRef.current.add(card.uuid);
                                } else {
                                    const nextRetryAt = Date.now() + getRetryDelay(retryCount - 1);
                                    retryUpdates.push({
                                        key: card.uuid,
                                        changes: {
                                            enrichmentRetryCount: retryCount,
                                            enrichmentNextRetryAt: nextRetryAt,
                                        },
                                    });
                                }
                            }
                        }

                        // Write updates
                        if (newCards.length > 0) {
                            await db.cards.bulkAdd(newCards);
                        }
                        if (successUpdates.length > 0) {
                            await db.cards.bulkUpdate(successUpdates);
                        }
                        if (retryUpdates.length > 0) {
                            await db.cards.bulkUpdate(retryUpdates);
                        }
                    });

                } catch (error) {
                    if ((error as Error).name === "AbortError") {
                        break;
                    }
                    console.error("[Metadata] Batch error:", error);

                    // Retry logic for failed batch
                    await db.transaction("rw", db.cards, async () => {
                        const updates: { key: string; changes: Partial<CardOption> }[] = [];
                        for (const card of batch) {
                            const retryCount = (card.enrichmentRetryCount ?? 0) + 1;
                            updates.push({
                                key: card.uuid,
                                changes: {
                                    needsEnrichment: false,
                                    enrichmentRetryCount: retryCount
                                }
                            });
                        }
                        if (updates.length > 0) await db.cards.bulkUpdate(updates);
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
