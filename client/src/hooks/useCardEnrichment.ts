import { useState, useEffect, useRef, useCallback } from "react";
import { db, METADATA_CACHE_VERSION, type CachedMetadata } from "../db";
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
    // Token Support
    token_parts?: Array<{
        id?: string;
        name: string;
        type_line?: string;
        uri?: string;
    }>;
}

/**
 * Type guard to validate enriched card data from API response.
 * Ensures the response has the required fields before using it.
 */
function isEnrichedCardData(data: unknown): data is EnrichedCardData {
    return (
        typeof data === 'object' &&
        data !== null &&
        'name' in data &&
        typeof (data as { name: unknown }).name === 'string'
    );
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
                                // Validate cache version - if stale, fetch fresh data
                                if ((cached.cacheVersion ?? 0) < METADATA_CACHE_VERSION) {
                                    // Stale cache entry - fetch fresh
                                    cardsToFetch.push(card);
                                } else {
                                    // Touch cachedAt
                                    const cachedData = cached.data as unknown as EnrichedCardData;
                                    db.cardMetadataCache.update(cached.id, { cachedAt: Date.now() });
                                    cachedDataMap.set(card.uuid, cachedData);
                                }
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

                        const rawResponses = await response.json();
                        // Validate responses but keep index alignment (map invalid to null instead of filtering)
                        validResponses = Array.isArray(rawResponses)
                            ? rawResponses.map(r => isEnrichedCardData(r) ? r : null)
                            : [];

                        // Cache the new results
                        try {
                            const entriesToCache: { id: string, name: string, set: string, number: string, data: unknown, cachedAt: number, size: number, cacheVersion: number }[] = [];

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
                                        size: size,
                                        cacheVersion: METADATA_CACHE_VERSION
                                    });
                                }
                            });

                            if (entriesToCache.length > 0) {
                                await db.cardMetadataCache.bulkPut(entriesToCache as CachedMetadata[]);
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

                    // Perform DFC art lookups (respecting preferred source)
                    // Capture settings snapshot BEFORE entering parallel processing
                    // to ensure consistent behavior if settings change during operation
                    const settingsSnapshot = {
                        preferredArtSource: useSettingsStore.getState().preferredArtSource,
                        favoriteMpcSources: useSettingsStore.getState().favoriteMpcSources || [],
                        favoriteMpcTags: useSettingsStore.getState().favoriteMpcTags || [],
                    };

                    await Promise.all(batch.map(async (card) => {
                        const data = responseMap.get(card.uuid);
                        if (!data) return;

                        // Skip DFC art processing for user uploads - preserve their custom art
                        if (card.isUserUpload) return;

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

                            // Use captured settings snapshot for consistent behavior
                            const preferredSource = settingsSnapshot.preferredArtSource;

                            // Process Back Art (for front-face imports that need back art)
                            if (needsBackArt) {
                                try {
                                    if (preferredSource === 'mpc') {
                                        // MPC art fetching
                                        const mpcResults = await searchMpcAutofill(back.name);
                                        if (mpcResults && mpcResults.length > 0) {
                                            const favSources = new Set(settingsSnapshot.favoriteMpcSources);
                                            const favTags = new Set(settingsSnapshot.favoriteMpcTags);
                                            const bestBack = pickBestMpcCard(mpcResults, favSources, favTags);

                                            if (bestBack) {
                                                const backUrl = getMpcAutofillImageUrl(bestBack.identifier);
                                                const imgId = await addRemoteImage([backUrl], 1);
                                                if (imgId) backArtMap.set(card.uuid, imgId);
                                            }
                                        }
                                    } else {
                                        // Scryfall art: use image URL from enriched data's card_faces
                                        const backImageUrl = back.image_uris?.large || back.image_uris?.png || back.image_uris?.normal;
                                        if (backImageUrl) {
                                            const imgId = await addRemoteImage([backImageUrl], 1);
                                            if (imgId) backArtMap.set(card.uuid, imgId);
                                        }
                                    }
                                } catch (e) {
                                    console.warn(`[Enrichment] Failed to fetch back art for ${back.name}`, e);
                                }
                            }

                            // Process Front Art (for back-face imports that need front art)
                            if (isBackFaceImport) {
                                try {
                                    if (preferredSource === 'mpc') {
                                        // MPC art fetching
                                        const mpcResults = await searchMpcAutofill(front.name);
                                        if (mpcResults && mpcResults.length > 0) {
                                            const favSources = new Set(settingsSnapshot.favoriteMpcSources);
                                            const favTags = new Set(settingsSnapshot.favoriteMpcTags);
                                            const bestFront = pickBestMpcCard(mpcResults, favSources, favTags);

                                            if (bestFront) {
                                                const frontUrl = getMpcAutofillImageUrl(bestFront.identifier);
                                                const imgId = await addRemoteImage([frontUrl], 1);
                                                if (imgId) frontArtMap.set(card.uuid, imgId);
                                            }
                                        }
                                    } else {
                                        // Scryfall art: use image URL from enriched data's card_faces
                                        const frontImageUrl = front.image_uris?.large || front.image_uris?.png || front.image_uris?.normal;
                                        if (frontImageUrl) {
                                            const imgId = await addRemoteImage([frontImageUrl], 1);
                                            if (imgId) frontArtMap.set(card.uuid, imgId);
                                        }
                                    }
                                } catch (e) {
                                    console.warn(`[Enrichment] Failed to fetch front art for ${front.name}`, e);
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
                                // Default updates (for single face or DFC front)
                                const updates: Partial<CardOption> = {
                                    // Protect Custom/User Uploads from having their name/set/number identifying info overwritten
                                    // They only want enrichment for token_parts, colors, etc.
                                    ...(card.isUserUpload ? {} : {
                                        name: data.name,
                                        set: data.set || card.set,
                                        number: data.number || card.number,
                                        type_line: data.type_line,
                                        mana_cost: data.mana_cost,
                                    }),

                                    colors: data.colors,
                                    cmc: data.cmc,
                                    rarity: data.rarity,
                                    lang: data.lang,
                                    needsEnrichment: false,
                                    enrichmentRetryCount: undefined,
                                    enrichmentNextRetryAt: undefined,
                                    // Token support - only update if server returned token data
                                    // (don't overwrite existing needs_token: true with false)
                                    ...(data.token_parts !== undefined ? {
                                        token_parts: data.token_parts,
                                        needs_token: data.token_parts.length > 0,
                                    } : {}),
                                    // Detect if this card IS a token based on type_line
                                    isToken: data.type_line?.toLowerCase().includes('token') || undefined,
                                };

                                // DFC Handling - skip for user uploads (they want standalone custom cards)
                                if (!card.isUserUpload && data.card_faces && data.card_faces.length >= 2 && data.layout && ['transform', 'modal_dfc', 'mdfc', 'double_faced_token', 'flip', 'adventure'].includes(data.layout)) {
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

                                    // Apply Front Art Fix if needed (for back-face imports)
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
        // Track timeout ID for cleanup
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        // Trigger enrichment after short delay.
        const handler = () => {
            // Clear any existing timeout to avoid multiple triggers
            if (timeoutId) clearTimeout(timeoutId);

            timeoutId = setTimeout(() => {
                if (!isEnrichingRef.current) {
                    void enrichCards();
                }
            }, 1500);
        };

        // Subscribe to creating hook
        db.cards.hook("creating", handler);

        return () => {
            // Clean up timeout to prevent calls after unmount
            if (timeoutId) clearTimeout(timeoutId);
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
