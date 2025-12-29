import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Textarea } from "flowbite-react";
import { ExternalLink } from "lucide-react";
import { parseDeckToInfos } from "@/helpers/cardInfoHelper";
import { streamCards, type CardInfo } from "@/helpers/streamCards";
import { addRemoteImage } from "@/helpers/dbUtils";
import { undoableAddCards } from "@/helpers/undoableActions";
import { db } from "../../db";
import { useCardsStore, useSettingsStore } from "@/store";
import { useLoadingStore } from "@/store/loading";
import { AdvancedSearch } from "../ArtworkModal";

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

    const globalLanguage = useSettingsStore((s) => s.globalLanguage ?? "en");
    const preferredArtSource = useSettingsStore((s) => s.preferredArtSource);

    const clearAllCardsAndImages = useCardsStore((state) => state.clearAllCardsAndImages);

    const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
    const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);

    // --- Fetch Logic ---

    const processCardFetch = async (infos: CardInfo[]) => {
        onUploadComplete?.();

        if (fetchController.current) {
            fetchController.current.abort();
        }
        fetchController.current = new AbortController();

        if (infos.length === 0) {
            alert("No valid cards found to import. Please check your input.");
            return;
        }

        try {
            // No loading modal - processing toast will show via useImageProcessing
            await streamCards({
                cardInfos: infos,
                language: globalLanguage,
                importType: 'scryfall',
                signal: fetchController.current.signal,
                onComplete: () => {
                    setDeckText("");
                    onUploadComplete?.();
                },
            });
        } catch (err: unknown) {
            if (err instanceof Error && err.name !== "AbortError") {
                alert(err.message || "Something went wrong while fetching cards.");
            } else if (!(err instanceof Error)) {
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

    const handleAddCard = async (cardName: string, mpcImageUrl?: string) => {
        // If MPC image URL is provided, add the card directly without Scryfall lookup
        if (mpcImageUrl) {
            onUploadComplete?.();

            // Extract base card name from MPC name (e.g., "Forest (Ukiyo)" -> "Forest")
            const baseNameMatch = cardName.match(/^([^(]+)/);
            const baseName = baseNameMatch ? baseNameMatch[1].trim() : cardName;

            // Add the image directly
            const imageId = await addRemoteImage([mpcImageUrl], 1);

            // Add the card with the image and mark for enrichment
            const added = await undoableAddCards([{
                name: baseName,
                isUserUpload: false,
                imageId,
                hasBuiltInBleed: true,
                needsEnrichment: true,
            }]);

            if (added.length > 0) {
                useSettingsStore.getState().setSortBy("manual");
            }
            return;
        }

        // Standard Scryfall-based card addition
        await processCardFetch([{ name: cardName, quantity: 1 }]);
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
                    {preferredArtSource === 'mpc' ? (
                        <a
                            href="https://mpcfill.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-blue-600 dark:hover:text-blue-400"
                        >
                            MPC Autofill
                            <ExternalLink className="inline-block size-4 ml-1" />
                        </a>
                    ) : (
                        <a
                            href="https://scryfall.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-blue-600 dark:hover:text-blue-400"
                        >
                            Scryfall
                            <ExternalLink className="inline-block size-4 ml-1" />
                        </a>
                    )}
                    )
                </h6>

                <Textarea
                    className={`h-64 ${mobile ? 'landscape:flex-1 landscape:[&::-webkit-scrollbar]:hidden landscape:[-ms-overflow-style:none] landscape:[scrollbar-width:none]' : ''} resize-none text-base p-3`}
                    placeholder={`1x Sol Ring\n2x Counterspell\nFor specific art include set / CN\neg. Strionic Resonator (lcc)\nor Repurposing Bay (dft) 380`}
                    value={deckText}
                    onChange={(e) => setDeckText(e.target.value)}
                    onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && deckText.trim()) {
                            e.preventDefault();
                            handleSubmit();
                        }
                    }}
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

            {/* Advanced Search Modal */}
            {isAdvancedSearchOpen && (
                <AdvancedSearch
                    isOpen={isAdvancedSearchOpen}
                    onClose={() => setIsAdvancedSearchOpen(false)}
                    onSelectCard={handleAddCard}
                    keepOpenOnAdd={true}
                    initialSource={preferredArtSource}
                />
            )}

            {
                showClearConfirmModal && createPortal(
                    <div className="fixed inset-0 z-100 bg-gray-900/50 flex items-center justify-center">
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
