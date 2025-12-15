import { useRef, useState } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { createPortal } from "react-dom";
import { Button, Select, Textarea } from "flowbite-react";
import { ExternalLink, HelpCircle } from "lucide-react";
import { API_BASE, LANGUAGE_OPTIONS } from "@/constants";
import { cardKey, parseDeckToInfos } from "@/helpers/CardInfoHelper";
import { addCards, addRemoteImage } from "@/helpers/dbUtils";
import { undoableAddCards } from "@/helpers/undoableActions";
import { importStats } from "@/helpers/importStats";
import { db } from "../../db"; // Adjusted import path
import { useCardsStore, useSettingsStore } from "@/store";
import { useLoadingStore } from "@/store/loading";
import type { CardInfo, CardOption, ScryfallCard } from "../../../../shared/types";
import { AutoTooltip } from "../AutoTooltip";
import { AdvancedSearch } from "../AdvancedSearch";
import { AddCardBack } from "./AddCardBack";

type Props = {
    mobile?: boolean;
    cardCount: number;
    onUploadComplete?: () => void;
};

export function DecklistUploader({ mobile, cardCount, onUploadComplete }: Props) {
    const [deckText, setDeckText] = useState("");
    const fetchController = useRef<AbortController | null>(null);
    const enrichmentController = useRef<AbortController | null>(null);

    const setLoadingTask = useLoadingStore((state) => state.setLoadingTask);
    const setLoadingMessage = useLoadingStore((state) => state.setLoadingMessage);

    const globalLanguage = useSettingsStore((s) => s.globalLanguage ?? "en");
    const setGlobalLanguage = useSettingsStore((s) => s.setGlobalLanguage ?? (() => { }));

    const clearAllCardsAndImages = useCardsStore((state) => state.clearAllCardsAndImages);

    const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
    const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);

    // --- Fetch Logic ---

    const processCardFetch = async (infos: CardInfo[]) => {
        setLoadingTask("Fetching cards");
        setLoadingMessage("Connecting to Scryfall...");

        onUploadComplete?.();

        if (fetchController.current) {
            fetchController.current.abort();
        }
        fetchController.current = new AbortController();
        const signal = fetchController.current.signal;

        let totalCards = 0;
        for (const info of infos) {
            totalCards += info.quantity ?? 1;
        }

        importStats.start(totalCards, undefined, { importType: 'scryfall' });
        importStats.markImageLoadStart();

        try {
            const quantityByKey = new Map<string, { info: CardInfo; quantity: number }>();
            for (const info of infos) {
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

            await fetchEventSource(`${API_BASE}/api/stream/cards`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    cardQueries: uniqueInfos,
                    language: globalLanguage,
                }),
                signal,
                onopen: async (res) => {
                    if (!res.ok) {
                        const errorText = await res.text();
                        throw new Error(
                            `Failed to fetch cards: ${res.status} ${res.statusText} - ${errorText}`
                        );
                    }
                },
                onmessage: async (ev) => {
                    if (ev.event === "progress") {
                        const progress = JSON.parse(ev.data);
                        setLoadingMessage(`(${progress.processed} / ${progress.total})`);
                    } else if (ev.event === "card-error") {
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
                        if (cardsAdded === added.length) setLoadingTask(null);

                        importStats.incrementImagesFailed();
                    } else if (ev.event === "card-found") {
                        const card = JSON.parse(ev.data) as ScryfallCard;
                        if (!card?.name) return;

                        const exactKey = cardKey({ name: card.name, set: card.set, number: card.number });
                        const setOnlyKey = card.set ? cardKey({ name: card.name, set: card.set }) : null;
                        const nameOnlyKey = cardKey({ name: card.name });

                        const entry = quantityByKey.get(exactKey)
                            || (setOnlyKey && quantityByKey.get(setOnlyKey))
                            || quantityByKey.get(nameOnlyKey);

                        const quantity = entry?.quantity ?? 1;

                        const imageId = await addRemoteImage(card.imageUrls ?? [], quantity, card.prints);

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
                            });
                        }

                        if (cardsToAdd.length > 0) {
                            const added = await undoableAddCards(cardsToAdd);
                            cardsAdded += added.length;
                            const newUuids = added.map(c => c.uuid);
                            addedCardUuids.push(...newUuids);
                            importStats.registerPendingCards(newUuids);

                            if (cardsAdded === added.length) {
                                setLoadingTask(null);
                            }
                        }
                    } else if (ev.event === "done") {
                        importStats.markImageLoadEnd();

                        if (cardsAdded > 0) {
                            useSettingsStore.getState().setSortBy("manual");
                        }

                        if (importStats.getPendingCount() === 0) {
                            importStats.forceFinish();
                        }

                        setDeckText("");
                        onUploadComplete?.();
                    }
                },
                onclose: () => {
                    setLoadingTask(null);
                    fetchController.current = null;
                },
                onerror: (err) => {
                    setLoadingTask(null);
                    if (err.name !== "AbortError") {
                        alert("An error occurred while fetching cards. Please try again.");
                    }
                    fetchController.current = null;
                    throw err;
                },
            });
        } catch (err: unknown) {
            if (err instanceof Error) {
                if (err.name !== "AbortError") {
                    setLoadingTask(null);
                    alert(err.message || "Something went wrong while fetching cards.");
                }
            } else {
                setLoadingTask(null);
                alert("An unknown error occurred while fetching cards.");
            }
        }
    };

    const handleSubmit = async () => {
        const infos = parseDeckToInfos(deckText || "");
        if (!infos.length) return;
        await processCardFetch(infos);
    };

    const handleAddCard = async (cardName: string, set?: string, number?: string) => {
        await processCardFetch([{ name: cardName, set, number, quantity: 1 }]);
    };

    // --- Clear Logic ---

    const handleClear = async () => {
        const count = await db.cards.count();
        if (count === 0) {
            await confirmClear();
            setShowClearConfirmModal(false);
        } else {
            setShowClearConfirmModal(true);
        }
    };

    const confirmClear = async () => {
        setLoadingTask("Clearing Images");

        if (fetchController.current) {
            fetchController.current.abort();
            fetchController.current = null;
        }
        if (enrichmentController.current) {
            enrichmentController.current.abort();
            enrichmentController.current = null;
        }

        try {
            await clearAllCardsAndImages();
        } catch (err: unknown) {
            if (err instanceof Error) {
                alert(err.message || "Failed to clear images.");
            } else {
                alert("An unknown error occurred while clearing images.");
            }
        } finally {
            setLoadingTask(null);
            setShowClearConfirmModal(false);
        }
    };

    return (
        <div className={`space-y-4 ${mobile ? 'landscape:flex landscape:flex-col landscape:h-full landscape:space-y-0 landscape:gap-4' : ''}`}>
            <div className={`space-y-1 ${mobile ? 'landscape:flex-1 landscape:flex landscape:flex-col' : ''}`}>
                <h6 className="font-medium dark:text-white">
                    Add Cards (
                    <a
                        href="https://scryfall.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-blue-600 dark:hover:text-blue-400"
                    >
                        Scryfall
                        <ExternalLink className="inline-block size-4 ml-1" />
                    </a>
                    )
                </h6>

                <Textarea
                    className={`h-64 ${mobile ? 'landscape:flex-1 landscape:[&::-webkit-scrollbar]:hidden landscape:[-ms-overflow-style:none] landscape:[scrollbar-width:none]' : ''} resize-none text-base p-3`}
                    placeholder={`1x Sol Ring\n2x Counterspell\nFor specific art include set / CN\neg. Strionic Resonator (lcc)\nor Repurposing Bay (dft) 380`}
                    value={deckText}
                    onChange={(e) => setDeckText(e.target.value)}
                />
            </div>

            <div className="flex flex-col gap-3">
                <Button color="blue" size="lg" onClick={handleSubmit}>
                    Fetch Cards
                </Button>
                <Button
                    color="red"
                    size="lg"
                    onClick={handleClear}
                    disabled={cardCount === 0}
                >
                    Clear Cards
                </Button>
            </div>

            <div className="flex gap-2">
                <Button
                    color="indigo"
                    size="lg"
                    onClick={() => setIsAdvancedSearchOpen(true)}
                    className="flex-1"
                >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Advanced Search
                </Button>
            </div>

            <AddCardBack onUploadComplete={onUploadComplete} />

            {/* Advanced Search Modal */}
            {isAdvancedSearchOpen && (
                <AdvancedSearch
                    isOpen={isAdvancedSearchOpen}
                    onClose={() => setIsAdvancedSearchOpen(false)}
                    onSelectCard={handleAddCard}
                />
            )}

            {/* Language Selector - Hidden in Landscape (moved to left col), Visible in Portrait */}
            <div className={`space-y-1 ${mobile ? 'landscape:hidden' : ''}`}>
                <div className="flex items-center justify-between">
                    <h6 className="font-medium dark:text-white">Language</h6>
                    <AutoTooltip content="Used for Scryfall lookups" mobile={mobile}>
                        <HelpCircle className="w-4 h-4 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 cursor-pointer" />
                    </AutoTooltip>
                </div>

                <Select
                    className="w-full rounded-md bg-gray-300 dark:bg-gray-600 my-2 text-sm text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500"
                    value={globalLanguage}
                    onChange={(e) => setGlobalLanguage(e.target.value)}
                >
                    {LANGUAGE_OPTIONS.map((o) => (
                        <option key={o.code} value={o.code}>
                            {o.label}
                        </option>
                    ))}
                </Select>
            </div>

            {
                showClearConfirmModal && createPortal(
                    <div className="fixed inset-0 z-[100] bg-gray-900/50 flex items-center justify-center">
                        <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-md w-96 text-center">
                            <div className="mb-4 text-lg font-semibold text-gray-800 dark:text-white">
                                Confirm Clear Cards
                            </div>
                            <div className="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">
                                Are you sure you want to clear all cards? This action cannot be
                                undone.
                            </div>
                            <div className="flex justify-center gap-4">
                                <Button
                                    color="failure"
                                    className="bg-red-600 hover:bg-red-700 text-white"
                                    onClick={confirmClear}
                                >
                                    Yes, I'm sure
                                </Button>
                                <Button
                                    color="gray"
                                    onClick={() => setShowClearConfirmModal(false)}
                                >
                                    No, cancel
                                </Button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )
            }
        </div>
    );
}
