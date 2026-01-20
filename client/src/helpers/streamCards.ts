import { fetchEventSource } from "@microsoft/fetch-event-source";
import { undoableAddCards } from "./undoableActions";
import { addCards, addRemoteImage, createLinkedBackCardsBulk } from "./dbUtils";
import { createImportSession, getCurrentSession, type ImportType } from "./importSession";
import { useSettingsStore } from "../store";
import { findBestMpcMatches, parseMpcCardLogic } from "./mpcImportIntegration";
import { API_BASE } from "../constants";
import { IMAGE_PROCESSING } from "@/constants/imageProcessing";
import { db } from "../db";
import { getMpcAutofillImageUrl } from "./mpcAutofillApi";
import { convertScryfallToCardOptions, persistResolvedCards } from "./cardConverter";
import { fetchTokenParts } from "./tokenApi";

import type { CardOption, ScryfallCard, CardInfo } from "../../../shared/types";
import { normalizeDfcName } from "../../../shared/cardNameUtils";

export type { CardInfo };

export interface StreamCardsOptions {
    cardInfos: CardInfo[];
    language: string;
    importType: ImportType;
    signal: AbortSignal;
    /** Override preferred art source (if not specified, uses preferredArtSource from settings) */
    artSource?: 'scryfall' | 'mpc';
    onProgress?: (processed: number, total: number) => void;
    onFirstCard?: () => void;
    onComplete?: () => void;
    projectId?: string;
}

export interface StreamCardsResult {
    addedCardUuids: string[];
    totalCardsAdded: number;
}

// Valid DFC layouts from Scryfall
const DFC_LAYOUTS = ['transform', 'modal_dfc', 'mdfc', 'double_faced_token', 'flip', 'reversible_card'];

function isDfcLayout(layout?: string): boolean {
    return DFC_LAYOUTS.includes(layout || '');
}

/**
 * Enrich MPC-added cards with token_parts from server.
 * Call this after adding MPC cards to get Scryfall token data.
 */
async function enrichMpcCardsWithTokens(
    cardUuids: string[],
    signal?: AbortSignal
): Promise<void> {
    if (cardUuids.length === 0) return;

    // Get the cards we just added
    const cards = await db.cards.where('uuid').anyOf(cardUuids).toArray();
    if (cards.length === 0) return;

    // Only enrich cards that don't have token_parts yet
    const cardsNeedingEnrichment = cards.filter(c => c.token_parts === undefined);
    if (cardsNeedingEnrichment.length === 0) return;

    // Get unique card names for the API call
    const uniqueNames = [...new Set(cardsNeedingEnrichment.map(c => c.name))];
    const cardInfos = uniqueNames.map(name => ({ name }));

    // Fetch token data from server
    const result = await fetchTokenParts(cardInfos, signal);
    if (!result.success) {
        console.warn('[enrichMpcCardsWithTokens] Failed to fetch token parts:', result.error);
        return;
    }

    // Build a map of name -> token_parts
    const tokenMap = new Map<string, typeof result.data[number]['token_parts']>();
    for (const item of result.data) {
        if (item.token_parts !== undefined) {
            tokenMap.set(item.name.toLowerCase(), item.token_parts);
        }
    }

    // Update cards in DB with token_parts
    await db.transaction('rw', db.cards, async () => {
        for (const card of cardsNeedingEnrichment) {
            const tokenParts = tokenMap.get(card.name.toLowerCase());
            if (tokenParts !== undefined) {
                await db.cards.update(card.uuid, {
                    token_parts: tokenParts,
                    needs_token: tokenParts.length > 0,
                });
            }
        }
    });
}

const cardKey = (info: CardInfo) =>
    `${normalizeDfcName(info.name).toLowerCase()}|${info.set?.toLowerCase() ?? ""}|${info.number ?? ""}`;

export async function streamCards(options: StreamCardsOptions): Promise<StreamCardsResult> {
    const { cardInfos, language, importType, signal, artSource, onProgress, onFirstCard, onComplete, projectId } = options;

    // Get initial max order to compute starting positions for all cards
    const initialMaxOrder = (await db.cards.orderBy("order").last())?.order ?? 0;
    let currentOrderBase = initialMaxOrder + 10;

    // Build quantity map for deduplication AND track original order positions
    // The key insight: each unique card should be placed at its FIRST occurrence position
    const quantityByKey = new Map<string, { info: CardInfo; quantity: number; startOrder: number; placeholderUuids?: string[] }>();
    for (const info of cardInfos) {
        const k = cardKey(info);
        const cardQty = info.quantity ?? 1;
        const existing = quantityByKey.get(k);
        if (existing) {
            // Card already seen - just add to its quantity (it keeps its original position)
            existing.quantity += cardQty;
        } else {
            // First time seeing this card - record its starting order position
            quantityByKey.set(k, { info, quantity: cardQty, startOrder: currentOrderBase });
        }
        // Advance order counter by quantity (even for duplicates, to reserve space)
        currentOrderBase += cardQty * 10;
    }

    // --- Handle cards with explicit MPC identifiers first ---
    let cardsAdded = 0;
    const addedCardUuids: string[] = [];

    // Single-pass partitioning instead of two filter() calls
    type QuantityEntry = { info: CardInfo; quantity: number; startOrder: number; placeholderUuids?: string[] };
    const cardsWithMpcId: QuantityEntry[] = [];
    const cardsWithoutMpcId: QuantityEntry[] = [];
    for (const entry of quantityByKey.values()) {
        (entry.info.mpcIdentifier ? cardsWithMpcId : cardsWithoutMpcId).push(entry);
    }

    // Process cards with explicit MPC identifiers directly
    for (const entry of cardsWithMpcId) {
        if (signal.aborted) break;

        const { info, quantity, startOrder } = entry;
        const imageUrl = getMpcAutofillImageUrl(info.mpcIdentifier!);
        const imageId = await addRemoteImage([imageUrl], quantity);

        const cardsToAdd = createCardOptions(
            {
                name: info.name,
                lang: language,
                imageId,
                hasBuiltInBleed: true,
                needsEnrichment: true,
                category: info.category,
                // For MPC cards, merge darken-off defaults with any existing overrides
                overrides: info.overrides
                    ? { darkenMode: 'none' as const, darkenUseGlobalSettings: false, ...info.overrides }
                    : { darkenMode: 'none' as const, darkenUseGlobalSettings: false },
                projectId,
            },
            quantity
        );

        const added = await undoableAddCards(cardsToAdd, { startOrder });
        cardsAdded += added.length;
        addedCardUuids.push(...added.map(c => c.uuid));
        if (cardsAdded === added.length) onFirstCard?.();

        // Remove from quantityByKey so it's not processed again
        quantityByKey.delete(cardKey(info));
    }

    // --- Handle cards that match custom cardback names ---
    // If a card name matches a cardback's displayName, use that cardback and auto-flip
    const allCardbacks = await db.cardbacks.toArray();
    const cardbackByName = new Map<string, typeof allCardbacks[number]>();
    for (const cb of allCardbacks) {
        if (cb.displayName) {
            cardbackByName.set(cb.displayName.toLowerCase(), cb);
        }
    }

    // Check remaining cards for cardback matches
    const cardbackMatches: { entry: typeof cardsWithoutMpcId[number]; cardback: typeof allCardbacks[number] }[] = [];
    for (const entry of cardsWithoutMpcId) {
        const nameLower = entry.info.name.toLowerCase();
        const matchedCardback = cardbackByName.get(nameLower);
        if (matchedCardback) {
            cardbackMatches.push({ entry, cardback: matchedCardback });
        }
    }

    // Process cardback matches - create flipped cards using the cardback
    for (const { entry, cardback } of cardbackMatches) {
        if (signal.aborted) break;

        const { info, quantity, startOrder } = entry;

        const cardsToAdd = createCardOptions(
            {
                name: info.name,
                lang: language,
                imageId: cardback.id,
                isFlipped: true,
                hasBuiltInBleed: cardback.hasBuiltInBleed ?? true,
                category: info.category,
                projectId,
            },
            quantity
        );

        const added = await undoableAddCards(cardsToAdd, { startOrder });
        cardsAdded += added.length;
        addedCardUuids.push(...added.map(c => c.uuid));
        if (cardsAdded === added.length) onFirstCard?.();

        quantityByKey.delete(cardKey(info));
    }

    let uniqueInfos = Array.from(quantityByKey.values())
        .filter(v => !v.info.mpcIdentifier)
        .map(v => v.info);
    const effectiveArtSource = artSource ?? useSettingsStore.getState().preferredArtSource;
    if (effectiveArtSource === 'mpc') {
        // --- MPC Path: Add placeholder cards immediately, update when images arrive ---

        // Step 1: Add placeholder cards for ALL cards upfront (shows immediately in UI)
        const placeholderUuidsByKey = new Map<string, string[]>();

        for (const entry of quantityByKey.values()) {
            if (entry.info.mpcIdentifier) continue; // Skip cards with explicit MPC IDs (already handled)

            const key = cardKey(entry.info);
            const { quantity, startOrder, info } = entry;

            // Create placeholder cards with imageId: undefined (triggers loading spinner)
            const placeholderCards = createCardOptions(
                {
                    name: info.name,
                    lang: language,
                    imageId: undefined, // Shows loading spinner
                    category: info.category,
                    isToken: info.isToken,
                    overrides: info.overrides, // Preserve overrides for share import
                    projectId,
                },
                quantity
            );

            const added = await undoableAddCards(placeholderCards, { startOrder });
            cardsAdded += added.length;
            addedCardUuids.push(...added.map(c => c.uuid));
            placeholderUuidsByKey.set(key, added.map(c => c.uuid));

            if (cardsAdded === added.length) onFirstCard?.();
        }

        // Step 2: Process MPC matches in batches and UPDATE placeholder cards
        const CHUNK_SIZE = IMAGE_PROCESSING.MPC_CHUNK_SIZE;
        const mpcInfos = [...uniqueInfos];
        const failingInfos: CardInfo[] = [];
        let processedMpc = 0;

        for (let i = 0; i < mpcInfos.length; i += CHUNK_SIZE) {
            if (signal.aborted) break;

            const chunk = mpcInfos.slice(i, i + CHUNK_SIZE);
            const matches = await findBestMpcMatches(chunk);
            const matchedNames = new Set<string>();

            for (const match of matches) {
                const key = cardKey(match.info);
                matchedNames.add(key);

                const placeholderUuids = placeholderUuidsByKey.get(key);
                if (!placeholderUuids || placeholderUuids.length === 0) continue;

                const entry = quantityByKey.get(key);
                if (!entry) continue;

                const imageId = await addRemoteImage([match.imageUrl], entry.quantity);
                const { name: cardName, hasBuiltInBleed, needsEnrichment } = parseMpcCardLogic(match.mpcCard);

                // Update all placeholder cards for this key with the MPC image
                await db.transaction('rw', db.cards, async () => {
                    for (const uuid of placeholderUuids) {
                        await db.cards.update(uuid, {
                            name: cardName,
                            imageId,
                            hasBuiltInBleed,
                            needsEnrichment,
                        });
                    }
                });
            }

            // Collect failed lookups for Scryfall fallback
            for (const info of chunk) {
                if (!matchedNames.has(cardKey(info))) {
                    failingInfos.push(info);
                }
            }

            processedMpc += chunk.length;
            onProgress?.(processedMpc, uniqueInfos.length);
        }

        // Enrich MPC cards with token_parts from server (non-blocking, fire-and-forget)
        if (addedCardUuids.length > 0) {
            void enrichMpcCardsWithTokens(addedCardUuids, signal);
        }

        // Step 3: For failed MPC lookups, leave placeholders for Scryfall SSE to update
        // Store the placeholder UUIDs so SSE can update them instead of adding new cards
        uniqueInfos = [...failingInfos];

        // Store placeholderUuidsByKey in a way SSE can access it
        // We'll pass it through by adding to quantityByKey entries
        for (const info of failingInfos) {
            const key = cardKey(info);
            const entry = quantityByKey.get(key);
            if (entry) {
                entry.placeholderUuids = placeholderUuidsByKey.get(key);
            }
        }
    }

    if (uniqueInfos.length === 0) {
        onComplete?.();
        return { addedCardUuids, totalCardsAdded: cardsAdded };
    }

    let pendingOperations = 0;
    let doneEventReceived = false;
    let resolvePromise: () => void;
    const completionPromise = new Promise<void>(resolve => { resolvePromise = resolve; });

    const checkComplete = () => {
        if (doneEventReceived && pendingOperations === 0) {
            if (addedCardUuids.length > 0) {
                createImportSession({
                    totalCards: addedCardUuids.length,
                    cardUuids: addedCardUuids,
                    importType,
                });
                getCurrentSession()?.markFetchComplete();
                useSettingsStore.getState().setSortBy("manual");
            }
            onComplete?.();
            resolvePromise();
        }
    };

    await fetchEventSource(`${API_BASE}/api/stream/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardQueries: uniqueInfos, language }),
        signal,
        onopen: async (res) => {
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Failed to fetch cards: ${res.status} ${res.statusText} - ${errorText}`);
            }
        },
        onmessage: async (ev) => {
            if (ev.event === "progress") {
                const progress = JSON.parse(ev.data);
                onProgress?.(progress.processed, progress.total);
            } else if (ev.event === "card-error") {
                pendingOperations++;
                const { query, error } = JSON.parse(ev.data) as { query: CardInfo; error?: string };
                const entry = quantityByKey.get(cardKey(query));
                const quantity = entry?.quantity ?? 1;
                const placeholderUuids = entry?.placeholderUuids;

                if (placeholderUuids && placeholderUuids.length > 0) {
                    // Update existing placeholder cards with error state
                    await db.transaction('rw', db.cards, async () => {
                        for (const uuid of placeholderUuids) {
                            await db.cards.update(uuid, {
                                lookupError: error || 'Card not found',
                            });
                        }
                    });
                } else {
                    // No existing placeholders - add new error cards
                    const placeholderCards = Array.from({ length: quantity }, () => ({
                        name: query.name,
                        set: query.set,
                        number: query.number,
                        isUserUpload: false,
                        imageId: undefined,
                        lookupError: error || 'Card not found',
                        projectId,
                    }));

                    const startOrder = entry?.startOrder;
                    const added = await addCards(placeholderCards, startOrder !== undefined ? { startOrder } : undefined);
                    cardsAdded += added.length;
                    if (cardsAdded === added.length) onFirstCard?.();
                }

                pendingOperations--;
                checkComplete();
            } else if (ev.event === "card-found") {
                pendingOperations++;
                const card = JSON.parse(ev.data) as ScryfallCard;

                if (!card?.name) {
                    pendingOperations--;
                    checkComplete();
                    return;
                }

                const exactKey = cardKey({ name: card.name, set: card.set, number: card.number });
                const setOnlyKey = card.set ? cardKey({ name: card.name, set: card.set }) : null;
                const nameOnlyKey = cardKey({ name: card.name });

                let entry = quantityByKey.get(exactKey)
                    || (setOnlyKey && quantityByKey.get(setOnlyKey))
                    || quantityByKey.get(nameOnlyKey);

                const hasDfcBack = card.card_faces && card.card_faces.length > 1;
                let isBackFaceImport = false;

                if (!entry && hasDfcBack) {
                    const backFaceName = card.card_faces![1].name;
                    if (backFaceName) {
                        const backFaceKey = cardKey({ name: backFaceName });
                        entry = quantityByKey.get(backFaceKey);
                        // Only treat as back-face import if card layout confirms it's a DFC
                        if (entry && isDfcLayout(card.layout)) {
                            isBackFaceImport = true;
                        }
                    }
                }

                if (entry && !isBackFaceImport && hasDfcBack) {
                    const originalQueryName = entry.info.name?.toLowerCase().trim() ?? '';
                    const backName = card.card_faces![1].name?.toLowerCase().trim();
                    if (backName && backName === originalQueryName) {
                        isBackFaceImport = true;
                    }
                }

                const quantity = entry?.quantity ?? 1;
                const placeholderUuids = entry?.placeholderUuids;

                // Map token_parts from all_parts if available (SSE returns raw object)
                // Define type for all_parts entries (not in ScryfallCard interface but returned by SSE)
                interface AllPartsEntry {
                    component: string;
                    name: string;
                    id: string;
                    uri: string;
                }
                const cardWithAllParts = card as ScryfallCard & { all_parts?: AllPartsEntry[] };
                if (cardWithAllParts.all_parts && !card.token_parts) {
                    card.token_parts = cardWithAllParts.all_parts
                        .filter((p) => p.component === 'token')
                        .map((p) => ({
                            name: p.name,
                            id: p.id,
                            uri: p.uri,
                        }));
                    card.needs_token = card.token_parts!.length > 0;
                }

                const { cardsToAdd, backCardTasks } = await convertScryfallToCardOptions(card, quantity, {
                    category: entry?.info.category,
                    isToken: entry?.info.isToken,
                    isBackFaceImport,
                    projectId,
                });

                if (cardsToAdd.length > 0) {
                    if (placeholderUuids && placeholderUuids.length > 0) {
                        // Update existing placeholder cards with Scryfall data
                        const cardData = cardsToAdd[0]; // Get template from first card
                        await db.transaction('rw', db.cards, async () => {
                            for (const uuid of placeholderUuids) {
                                await db.cards.update(uuid, {
                                    name: cardData.name,
                                    imageId: cardData.imageId,
                                    set: cardData.set,
                                    number: cardData.number,
                                    lang: cardData.lang,
                                    colors: cardData.colors,
                                    cmc: cardData.cmc,
                                    type_line: cardData.type_line,
                                    rarity: cardData.rarity,
                                    mana_cost: cardData.mana_cost,
                                    token_parts: cardData.token_parts,
                                    needs_token: cardData.needs_token,
                                    isToken: cardData.isToken,
                                    hasBuiltInBleed: false, // Scryfall images don't have built-in bleed
                                    needsEnrichment: false,
                                });
                            }
                        });

                        // Handle DFC back cards for existing placeholders
                        if (backCardTasks.length > 0) {
                            await createLinkedBackCardsBulk(
                                backCardTasks.map((task, i) => ({
                                    frontUuid: placeholderUuids[task.frontIndex] || placeholderUuids[i] || placeholderUuids[0],
                                    backImageId: task.backImageId,
                                    backName: task.backName,
                                }))
                            );
                        }
                    } else {
                        // No existing placeholders - add new cards
                        const added = await persistResolvedCards({ cardsToAdd, backCardTasks }, { startOrder: entry?.startOrder });
                        cardsAdded += added.length;
                        addedCardUuids.push(...added.map(c => c.uuid));
                        if (cardsAdded === added.length) onFirstCard?.();
                    }
                }
                pendingOperations--;
                checkComplete();
            } else if (ev.event === "done") {
                doneEventReceived = true;
                checkComplete();
            }
        },
    });

    await completionPromise;
    return { addedCardUuids, totalCardsAdded: cardsAdded };
}

function createCardOptions(
    base: Partial<Omit<CardOption, "uuid" | "order"> & { imageId?: string }>,
    quantity: number
): (Omit<CardOption, "uuid" | "order"> & { imageId?: string })[] {
    const defaults = {
        set: undefined,
        number: undefined,
        isUserUpload: false,
        colors: [],
        cmc: 0,
        type_line: "Card",
        rarity: "common",
        mana_cost: "",
    };

    // Type assertion needed due to strict Omit/Partial overlap
    const card = {
        ...defaults,
        ...base,
    } as Omit<CardOption, "uuid" | "order"> & { imageId?: string };

    return Array.from({ length: quantity }, () => ({ ...card }));
}
