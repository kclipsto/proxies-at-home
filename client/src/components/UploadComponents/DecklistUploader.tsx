import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Select, Textarea } from "flowbite-react";
import { ExternalLink, HelpCircle } from "lucide-react";
import { LANGUAGE_OPTIONS } from "@/constants";
import { parseDeckToInfos } from "@/helpers/CardInfoHelper";
import { streamCards, type CardInfo } from "@/helpers/streamCards";
import { db } from "../../db";
import { useCardsStore, useSettingsStore } from "@/store";
import { useLoadingStore } from "@/store/loading";
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

        if (infos.length === 0) {
            alert("No valid cards found to import. Please check your input.");
            setLoadingTask(null);
            return;
        }

        try {
            await streamCards({
                cardInfos: infos,
                language: globalLanguage,
                importType: 'scryfall',
                signal: fetchController.current.signal,
                onProgress: (processed, total) => setLoadingMessage(`(${processed} / ${total})`),
                onFirstCard: () => setLoadingTask(null),
                onComplete: () => {
                    setDeckText("");
                    onUploadComplete?.();
                },
            });
        } catch (err: unknown) {
            if (err instanceof Error && err.name !== "AbortError") {
                setLoadingTask(null);
                alert(err.message || "Something went wrong while fetching cards.");
            } else if (!(err instanceof Error)) {
                setLoadingTask(null);
                alert("An unknown error occurred while fetching cards.");
            }
        } finally {
            fetchController.current = null;
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
                <Button color="blue" size="lg" onClick={handleSubmit} disabled={!deckText.trim()}>
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
                    <AutoTooltip content="Used for Scryfall lookups" mobile={mobile} tooltipClassName="w-[80%]">
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
