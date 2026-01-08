import { fetchEventSource } from "@microsoft/fetch-event-source";
import { undoableAddCards } from "./undoableActions";
import { addCards, addRemoteImage, createLinkedBackCardsBulk } from "./dbUtils";
import { createImportSession, getCurrentSession, type ImportType } from "./importSession";
import { useSettingsStore } from "../store";
import { findBestMpcMatches, parseMpcCardLogic } from "./mpcImportIntegration";
import { API_BASE } from "../constants";
import { db } from "../db";
import { getMpcAutofillImageUrl } from "./mpcAutofillApi";

import type { CardOption, ScryfallCard } from "../../../shared/types";

export interface CardInfo {
    name: string;
    set?: string;
    number?: string;
    quantity?: number;
    category?: string;
    mpcIdentifier?: string;
}

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
}

export interface StreamCardsResult {
    addedCardUuids: string[];
    totalCardsAdded: number;
}

// Normalize DFC names: "A // B" -> "A" (front face only)
// This ensures client-side keys match server responses which return just the front face name
function normalizeDfcName(name: string): string {
    return name.includes(' // ') ? name.split(' // ')[0].trim() : name;
}

const cardKey = (info: CardInfo) =>
    `${normalizeDfcName(info.name).toLowerCase()}|${info.set?.toLowerCase() ?? ""}|${info.number ?? ""}`;

export async function streamCards(options: StreamCardsOptions): Promise<StreamCardsResult> {
    const { cardInfos, language, importType, signal, artSource, onProgress, onFirstCard, onComplete } = options;

    // Get initial max order to compute starting positions for all cards
    const initialMaxOrder = (await db.cards.orderBy("order").last())?.order ?? 0;
    let currentOrderBase = initialMaxOrder + 10;

    // Build quantity map for deduplication AND track original order positions
    // The key insight: each unique card should be placed at its FIRST occurrence position
    const quantityByKey = new Map<string, { info: CardInfo; quantity: number; startOrder: number }>();
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

    const cardsWithMpcId = Array.from(quantityByKey.values()).filter(v => v.info.mpcIdentifier);
    const cardsWithoutMpcId = Array.from(quantityByKey.values()).filter(v => !v.info.mpcIdentifier);

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

    let uniqueInfos = cardsWithoutMpcId.map(v => v.info);

    // --- MPC Autofill Integration ---
    // Use explicit artSource override if provided, otherwise fall back to settings
    const effectiveArtSource = artSource ?? useSettingsStore.getState().preferredArtSource;
    console.log('[streamCards] Preferred art source:', effectiveArtSource);
    if (effectiveArtSource === 'mpc') {
        console.log('[streamCards] MPC mode enabled, searching for', uniqueInfos.length, 'cards');
        // Debug log removed

        // Chunk cards for batch processing
        const CHUNK_SIZE = 50;

        // When MPC is preferred, search ALL cards in MPC first (not just those without set/number)
        // Cards not found in MPC will fallback to Scryfall
        const mpcInfos = [...uniqueInfos];
        const failingInfos: CardInfo[] = [];

        // Report progress base
        let processedMpc = 0;

        // Process chunks
        for (let i = 0; i < mpcInfos.length; i += CHUNK_SIZE) {
            if (signal.aborted) break;

            const chunk = mpcInfos.slice(i, i + CHUNK_SIZE);
            const matches = await findBestMpcMatches(chunk);
            console.log(`[streamCards] MPC Batch Result: ${matches.length} matches found out of ${chunk.length} in chunk.`);

            // Process matches
            const matchedNames = new Set<string>();

            for (const match of matches) {
                matchedNames.add(cardKey(match.info));

                // Construct card object and add to DB
                const entry = quantityByKey.get(cardKey(match.info));
                if (!entry) continue;

                const quantity = entry.quantity;
                const imageId = await addRemoteImage([match.imageUrl], quantity);

                const { name: cardName, hasBuiltInBleed, needsEnrichment } = parseMpcCardLogic(match.mpcCard);

                const cardsToAdd = createCardOptions(
                    {
                        name: cardName,
                        lang: language,
                        imageId,
                        hasBuiltInBleed,
                        needsEnrichment,
                        category: entry.info.category,
                    },
                    quantity
                );

                const startOrder = entry.startOrder;
                const added = await undoableAddCards(cardsToAdd, { startOrder });
                cardsAdded += added.length;
                addedCardUuids.push(...added.map(c => c.uuid));
                if (cardsAdded === added.length) onFirstCard?.();
            }

            // Collect failed lookups for Scryfall fallback
            for (const info of chunk) {
                if (!matchedNames.has(cardKey(info))) {
                    failingInfos.push(info);
                }
            }

            processedMpc += chunk.length;
            onProgress?.(processedMpc, uniqueInfos.length); // Report progress as we search/add
        }

        // Fallback to Scryfall for cards not found in MPC
        uniqueInfos = [...failingInfos];
    }

    if (uniqueInfos.length === 0) {
        // All handled by MPC (or empty input)
        onComplete?.();
        return { addedCardUuids, totalCardsAdded: cardsAdded };
    }
    // --- End MPC Autofill Integration ---

    // Track pending async operations for race condition with SSE done event
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
                const { query } = JSON.parse(ev.data) as { query: CardInfo };
                const entry = quantityByKey.get(cardKey(query));
                const quantity = entry?.quantity ?? 1;

                const placeholderCards = Array.from({ length: quantity }, () => ({
                    name: query.name,
                    set: query.set,
                    number: query.number,
                    isUserUpload: false,
                    imageId: undefined,
                }));

                // Use the tracked startOrder to maintain original decklist position
                const startOrder = entry?.startOrder;
                const added = await addCards(placeholderCards, startOrder !== undefined ? { startOrder } : undefined);
                cardsAdded += added.length;
                if (cardsAdded === added.length) onFirstCard?.();

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

                const entry = quantityByKey.get(exactKey)
                    || (setOnlyKey && quantityByKey.get(setOnlyKey))
                    || quantityByKey.get(nameOnlyKey);

                const quantity = entry?.quantity ?? 1;
                const imageId = await addRemoteImage(card.imageUrls ?? [], quantity, card.prints);

                // DFC handling: check for back face
                const hasDfcBack = card.card_faces && card.card_faces.length > 1;
                let backImageId: string | undefined;
                let backFaceName: string | undefined;

                if (hasDfcBack) {
                    const backFace = card.card_faces![1];
                    backFaceName = backFace.name;
                    if (backFace.imageUrl) {
                        backImageId = await addRemoteImage([backFace.imageUrl], quantity);
                    }
                }

                const category = entry?.info.category;
                const cardsToAdd: (Omit<CardOption, "uuid" | "order"> & { imageId?: string })[] = [];
                for (let i = 0; i < quantity; i++) {
                    cardsToAdd.push({
                        name: card.name,
                        set: card.set,
                        number: card.number,
                        lang: card.lang,
                        isUserUpload: false,
                        imageId,
                        colors: card.colors,
                        cmc: card.cmc,
                        type_line: card.type_line,
                        rarity: card.rarity,
                        mana_cost: card.mana_cost,
                        token_parts: card.token_parts,
                        needs_token: card.needs_token,
                        category,
                    });
                }

                if (cardsToAdd.length > 0) {
                    // Use the tracked startOrder to maintain original decklist position
                    const startOrder = entry?.startOrder;
                    const added = await undoableAddCards(cardsToAdd, startOrder !== undefined ? { startOrder } : undefined);
                    cardsAdded += added.length;
                    addedCardUuids.push(...added.map(c => c.uuid));
                    if (cardsAdded === added.length) onFirstCard?.();

                    // Create linked back cards for DFCs using bulk operation
                    if (hasDfcBack && backImageId) {
                        await createLinkedBackCardsBulk(
                            added.map(frontCard => ({
                                frontUuid: frontCard.uuid,
                                backImageId,
                                backName: backFaceName || 'Back',
                            }))
                        );
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
