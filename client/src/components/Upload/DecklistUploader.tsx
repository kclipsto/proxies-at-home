import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, Modal, ModalBody, ModalHeader, Textarea } from "flowbite-react";
import { ExternalLink, Search, Sparkles } from "lucide-react";
import { parseDeckList } from "@/helpers/importParsers";
import type { ImportIntent } from "@/helpers/importParsers";
import { addRemoteImage } from "@/helpers/dbUtils";
import { db } from "@/db";
import { useCardsStore, useSettingsStore, useProjectStore } from "@/store";
import { useLoadingStore } from "@/store/loading";
import { AdvancedSearch } from "../ArtworkModal";
import { handleAutoImportTokens } from "@/helpers/tokenImportHelper";
import { useToastStore } from "@/store/toast";
import { useCardImport } from "@/hooks/useCardImport";

type Props = {
    mobile?: boolean;
    cardCount: number;
    onUploadComplete?: () => void;
};

export function DecklistUploader({ mobile, cardCount, onUploadComplete }: Props) {
    const [deckText, setDeckText] = useState("");
    const tokenFetchController = useRef<AbortController | null>(null);

    const setLoadingTask = useLoadingStore((state) => state.setLoadingTask);
    const preferredArtSource = useSettingsStore((s) => s.preferredArtSource);
    const clearAllCardsAndImages = useCardsStore((state) => state.clearAllCardsAndImages);
    const { processCards, cancel: cancelCardFetch } = useCardImport({
        onComplete: () => {
            setDeckText("");
            onUploadComplete?.();
        }
    });

    const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
    const [showNoTokensModal, setShowNoTokensModal] = useState(false);
    const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);

    // Check if we have cards that need tokens but don't have them
    const currentProjectId = useProjectStore((state) => state.currentProjectId);
    const hasTokensToFetch = useLiveQuery(async () => {
        if (!currentProjectId) return false;
        const cards = await db.cards
            .where('projectId').equals(currentProjectId)
            .filter(c => !!c.needs_token)
            .toArray();
        return cards.length > 0;
    }, [currentProjectId]);

    const handleSubmit = async () => {
        const text = deckText.trim();
        if (!text) return;

        const intents = parseDeckList(text);

        const enrichedIntents = intents.map(i => ({
            ...i,
            sourcePreference: i.sourcePreference || preferredArtSource
        }));

        if (!enrichedIntents.length) return;
        onUploadComplete?.();
        await processCards(enrichedIntents);
    };

    const handleAddCard = async (cardName: string, mpcImageUrl?: string, specificPrint?: { set: string; number: string }) => {
        // If MPC image URL is provided, add the card directly without Scryfall lookup
        if (mpcImageUrl) {
            onUploadComplete?.();

            // Extract base card name from MPC name (e.g., "Forest (Ukiyo)" -> "Forest")
            const baseNameMatch = cardName.match(/^([^(]+)/);
            const baseName = baseNameMatch ? baseNameMatch[1].trim() : cardName;

            // Add the image directly
            const imageId = await addRemoteImage([mpcImageUrl], 1);

            // Add the card with the image and mark for enrichment
            const intent: ImportIntent = {
                name: baseName,
                quantity: 1,
                localImageId: imageId,
                isToken: false,
                sourcePreference: 'manual'
            };

            await processCards([intent]);
            useSettingsStore.getState().setSortBy("manual");
            return;
        }

        const intent: ImportIntent = {
            name: cardName,
            quantity: 1,
            set: specificPrint?.set,
            number: specificPrint?.number,
            isToken: false,
            sourcePreference: 'scryfall' // Force Scryfall
        };

        await processCards([intent]);
    };

    // --- Token Import Logic ---

    const handleAddTokens = async (silent: boolean = false) => {
        // Prevent overlapping token fetches
        if (tokenFetchController.current) {
            tokenFetchController.current.abort();
        }
        tokenFetchController.current = new AbortController();

        try {
            await handleAutoImportTokens({
                silent,
                signal: tokenFetchController.current.signal,
                onComplete: () => {
                    onUploadComplete?.();
                },
                onNoTokens: () => {
                    if (!silent) {
                        setShowNoTokensModal(true);
                    }
                }
            });
        } catch (err: unknown) {
            if (err instanceof Error && err.name !== "AbortError") {
                useToastStore.getState().showErrorToast(err.message || "Something went wrong while fetching tokens.");
            }
        } finally {
            tokenFetchController.current = null;
        }
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

        // Cancel any active card fetching
        cancelCardFetch();

        if (tokenFetchController.current) {
            tokenFetchController.current.abort();
            tokenFetchController.current = null;
        }

        try {
            await clearAllCardsAndImages();
        } catch (err: unknown) {
            if (err instanceof Error) {
                useToastStore.getState().showErrorToast(err.message || "Failed to clear images.");
            } else {
                useToastStore.getState().showErrorToast("An unknown error occurred while clearing images.");
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
                <Button
                    color="indigo"
                    size="lg"
                    onClick={() => setIsAdvancedSearchOpen(true)}
                >
                    <Search className="w-5 h-5 mr-2" />
                    Advanced Search
                </Button>
                <Button
                    color="purple"
                    size="lg"
                    onClick={() => handleAddTokens()}
                    disabled={!hasTokensToFetch}
                >
                    <Sparkles className="w-5 h-5 mr-2" />
                    Add Associated Tokens
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

            {/* No Tokens Found Modal */}
            <Modal
                show={showNoTokensModal}
                onClose={() => setShowNoTokensModal(false)}
                size="md"
                dismissible
            >
                <ModalHeader>No Tokens Found</ModalHeader>
                <ModalBody>
                    <p className="text-base text-gray-500 dark:text-gray-400">
                        No new tokens were found. Either your cards don&apos;t have associated tokens, or all tokens are already in your collection.
                    </p>
                    <div className="flex justify-end mt-4">
                        <Button
                            color="gray"
                            onClick={() => setShowNoTokensModal(false)}
                        >
                            OK
                        </Button>
                    </div>
                </ModalBody>
            </Modal>

            {/* Clear Confirm Modal */}
            {showClearConfirmModal && createPortal(
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
            )}
        </div>
    );
}
