import { fetchEventSource } from "@microsoft/fetch-event-source";
import { undoableAddCards } from "./undoableActions";
import { addCards, addRemoteImage } from "./dbUtils";
import { createImportSession, getCurrentSession, type ImportType } from "./ImportSession";
import { useSettingsStore } from "../store";
import { API_BASE } from "../constants";
import type { CardOption, ScryfallCard } from "../../../shared/types";

export interface CardInfo {
    name: string;
    set?: string;
    number?: string;
    quantity?: number;
    category?: string;
}

export interface StreamCardsOptions {
    cardInfos: CardInfo[];
    language: string;
    importType: ImportType;
    signal: AbortSignal;
    onProgress?: (processed: number, total: number) => void;
    onFirstCard?: () => void;
    onComplete?: () => void;
}

export interface StreamCardsResult {
    addedCardUuids: string[];
    totalCardsAdded: number;
}

const cardKey = (info: CardInfo) =>
    `${info.name.toLowerCase()}|${info.set?.toLowerCase() ?? ""}|${info.number ?? ""}`;

export async function streamCards(options: StreamCardsOptions): Promise<StreamCardsResult> {
    const { cardInfos, language, importType, signal, onProgress, onFirstCard, onComplete } = options;

    // Build quantity map for deduplication
    const quantityByKey = new Map<string, { info: CardInfo; quantity: number }>();
    for (const info of cardInfos) {
        const k = cardKey(info);
        const existing = quantityByKey.get(k);
        if (existing) {
            existing.quantity += info.quantity ?? 1;
        } else {
            quantityByKey.set(k, { info, quantity: info.quantity ?? 1 });
        }
    }

    const uniqueInfos = Array.from(quantityByKey.values()).map(v => v.info);
    let cardsAdded = 0;
    const addedCardUuids: string[] = [];

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
                const quantity = quantityByKey.get(cardKey(query))?.quantity ?? 1;

                const placeholderCards = Array.from({ length: quantity }, () => ({
                    name: query.name,
                    set: query.set,
                    number: query.number,
                    isUserUpload: false,
                    imageId: undefined,
                }));

                const added = await addCards(placeholderCards);
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
                        category,
                    });
                }

                if (cardsToAdd.length > 0) {
                    const added = await undoableAddCards(cardsToAdd);
                    cardsAdded += added.length;
                    addedCardUuids.push(...added.map(c => c.uuid));
                    if (cardsAdded === added.length) onFirstCard?.();
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
