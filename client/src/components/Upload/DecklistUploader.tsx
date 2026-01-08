import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, Modal, ModalBody, ModalHeader, Textarea } from "flowbite-react";
import { ExternalLink, Sparkles } from "lucide-react";
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
    const tokenFetchController = useRef<AbortController | null>(null);

    const setLoadingTask = useLoadingStore((state) => state.setLoadingTask);

    const globalLanguage = useSettingsStore((s) => s.globalLanguage ?? "en");
    const preferredArtSource = useSettingsStore((s) => s.preferredArtSource);

    const clearAllCardsAndImages = useCardsStore((state) => state.clearAllCardsAndImages);

    const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
    const [showNoTokensModal, setShowNoTokensModal] = useState(false);
    const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);

    // Live query to check if there are any cards that need token fetching
    // Checks for:
    // 1. Cards with explicit needed tokens (needs_token === true)
    const hasTokensToFetch = useLiveQuery(async () => {
        const count = await db.cards.filter(c =>
            (c.needs_token === true)
        ).count();
        return count > 0;
    }, [], false);

    // --- Fetch Logic ---

    const processCardFetch = async (infos: CardInfo[], artSource?: 'scryfall' | 'mpc') => {
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
                artSource,
                onComplete: () => {
                    setDeckText("");
                    onUploadComplete?.();

                    // Check for auto-import tokens setting
                    if (useSettingsStore.getState().autoImportTokens) {
                        handleAddTokens(true);
                    }
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
        // Include specific print details if available (set/number) so backend can match exactly
        // Force artSource to 'scryfall' to prevent MPC override when user explicitly selected Scryfall art
        await processCardFetch([{
            name: cardName,
            quantity: 1,
            set: specificPrint?.set,
            number: specificPrint?.number
        }], 'scryfall');
    };

    // --- Token Import Logic ---

    /**
     * Normalize a card key for deduplication
     */
    const normalizeKey = (name: string, set?: string, number?: string) =>
        `${name.toLowerCase()}| ${(set || "").toLowerCase()}| ${number || ""} `;

    /**
     * Extract set/number from a Scryfall token URI
     * e.g., "https://api.scryfall.com/cards/t2xm/4" -> { set: "t2xm", number: "4" }
     */
    const extractTokenPrintFromUri = (uri?: string): { set?: string; number?: string } => {
        if (!uri) return {};
        try {
            const u = new URL(uri);
            const parts = u.pathname.split("/").filter(Boolean);
            // Look for "cards" segment and extract set/number
            const cardsIdx = parts.findIndex((p) => p === "cards");
            if (cardsIdx >= 0 && parts[cardsIdx + 1] && parts[cardsIdx + 2]) {
                return { set: parts[cardsIdx + 1], number: parts[cardsIdx + 2] };
            }
        } catch {
            // Ignore parsing errors
        }
        return {};
    };

    /**
     * Find tokens that are needed but not yet in the collection
     */
    const computeMissingTokens = async (): Promise<CardInfo[]> => {
        const cards = await db.cards.toArray();
        if (cards.length === 0) return [];

        const seenKeys = new Set<string>();
        const tokensToFetch: CardInfo[] = [];

        for (const card of cards) {
            // Skip token cards themselves to avoid chaining into their token_parts
            const setCode = card.set?.toLowerCase() || "";
            if (setCode.startsWith("t")) continue;
            if (card.type_line?.toLowerCase().includes("token")) continue;

            // Skip cards without token_parts
            if (!card.token_parts || card.token_parts.length === 0) continue;

            for (const token of card.token_parts) {
                if (!token.name) continue;

                const { set, number } = extractTokenPrintFromUri(token.uri);
                const keyWithPrint = normalizeKey(token.name, set, number);
                const keyNameOnly = normalizeKey(token.name);

                // Skip if already queued for fetch in this batch
                if (seenKeys.has(keyWithPrint) || seenKeys.has(keyNameOnly)) continue;

                seenKeys.add(keyWithPrint);
                seenKeys.add(keyNameOnly);
                tokensToFetch.push({ name: token.name, set, number, quantity: 1 });
            }
        }

        return tokensToFetch;
    };

    const handleAddTokens = async (silent: boolean = false) => {
        // Prevent overlapping token fetches
        if (tokenFetchController.current) {
            tokenFetchController.current.abort();
        }
        tokenFetchController.current = new AbortController();

        try {
            const cards = await db.cards.toArray();

            // Find cards that don't have token_parts yet (likely MPC imports)
            // These need to be looked up on Scryfall first
            const cardsNeedingTokenLookup = cards.filter(c =>
                c.token_parts === undefined &&
                !c.linkedFrontId && // Skip back cards
                !c.type_line?.toLowerCase().includes('token') // Skip tokens
            );

            // If we have cards without token_parts, fetch their token data from server
            if (cardsNeedingTokenLookup.length > 0) {
                const API_BASE = import.meta.env.VITE_API_BASE || '';
                const CHUNK_SIZE = 100;

                // Process in chunks to respect server limit
                for (let i = 0; i < cardsNeedingTokenLookup.length; i += CHUNK_SIZE) {
                    // Check abort signal between chunks
                    if (tokenFetchController.current?.signal.aborted) break;

                    const chunk = cardsNeedingTokenLookup.slice(i, i + CHUNK_SIZE);

                    try {
                        const response = await fetch(`${API_BASE}/api/cards/images/tokens`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                cards: chunk.map(c => ({
                                    name: c.name,
                                    set: c.set,
                                    number: c.number,
                                })),
                            }),
                            signal: tokenFetchController.current.signal,
                        });

                        if (response.ok) {
                            const tokenData = await response.json() as Array<{
                                name: string;
                                token_parts?: Array<{ id?: string; name: string; type_line?: string; uri?: string }>;
                            }>;

                            // Update cards in DB with token_parts
                            await db.transaction('rw', db.cards, async () => {
                                for (const data of tokenData) {
                                    // Update if we got a response (even empty array means "checked, none found")
                                    if (data.token_parts !== undefined) {
                                        // Find matching card(s) and update
                                        const matchingCards = chunk.filter(c =>
                                            c.name.toLowerCase() === data.name.toLowerCase()
                                        );
                                        for (const card of matchingCards) {
                                            await db.cards.update(card.uuid, {
                                                token_parts: data.token_parts,
                                                needs_token: data.token_parts!.length > 0,
                                            });
                                        }
                                    }
                                }
                            });
                        }
                    } catch (e) {
                        console.error("Token fetch chunk failed", e);
                        // Continue to next chunk even if one fails
                    }
                }
            }

            // Now compute missing tokens with updated data
            const tokensToFetch = await computeMissingTokens();

            if (tokensToFetch.length === 0) {
                if (!silent) {
                    setShowNoTokensModal(true);
                }
                return;
            }

            await streamCards({
                cardInfos: tokensToFetch,
                language: globalLanguage,
                importType: "scryfall",
                signal: tokenFetchController.current.signal,
                onComplete: () => {
                    onUploadComplete?.();
                },
                artSource: "scryfall", // Force Scryfall for tokens as requested (MPC tokens are often incorrect/missing)
            });
        } catch (err: unknown) {
            if (err instanceof Error && err.name !== "AbortError") {
                alert(err.message || "Something went wrong while fetching tokens.");
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

        if (fetchController.current) {
            fetchController.current.abort();
            fetchController.current = null;
        }
        if (enrichmentController.current) {
            enrichmentController.current.abort();
            enrichmentController.current = null;
        }
        if (tokenFetchController.current) {
            tokenFetchController.current.abort();
            tokenFetchController.current = null;
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
                <Button
                    color="indigo"
                    size="lg"
                    onClick={() => setIsAdvancedSearchOpen(true)}
                >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
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
