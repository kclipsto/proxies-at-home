import { useState, useRef } from "react";
import { TextInput } from "flowbite-react";
import { streamCards, type CardInfo } from "@/helpers/streamCards";
import { useSettingsStore } from "@/store";
import { useLoadingStore } from "@/store/loading";
import { AutoTooltip } from "../common";
import {
    extractArchidektDeckId,
    isArchidektUrl,
    fetchArchidektDeck,
    extractCardsFromDeck as extractArchidektCards,
    getDeckSummary as getArchidektSummary,
} from "@/helpers/archidektApi";
import {
    extractMoxfieldDeckId,
    isMoxfieldUrl,
    fetchMoxfieldDeck,
    extractCardsFromDeck as extractMoxfieldCards,
    getDeckSummary as getMoxfieldSummary,
} from "@/helpers/moxfieldApi";

type DeckSource = "archidekt" | "moxfield" | null;

type Props = {
    mobile?: boolean;
    onUploadComplete?: () => void;
};

/**
 * Normalize category to title case for consistent filtering.
 * Works for both standard categories and custom user-defined ones.
 */
function normalizeCategory(category: string): string {
    if (!category) return "Mainboard";
    return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
}

/**
 * Detect which deck builder site the URL is from
 */
function detectSource(url: string): DeckSource {
    if (isArchidektUrl(url)) return "archidekt";
    if (isMoxfieldUrl(url)) return "moxfield";
    return null;
}

export function DeckBuilderImporter({ mobile, onUploadComplete }: Props) {
    const [deckUrl, setDeckUrl] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchController = useRef<AbortController | null>(null);

    const setLoadingTask = useLoadingStore((state) => state.setLoadingTask);
    const setLoadingMessage = useLoadingStore((state) => state.setLoadingMessage);
    const globalLanguage = useSettingsStore((s) => s.globalLanguage ?? "en");

    const source = detectSource(deckUrl);
    const isValidUrl = source !== null;

    const handleImport = async () => {
        setError(null);
        setIsLoading(true);
        setLoadingTask("Fetching cards");

        try {
            let cardInfos: CardInfo[] = [];

            if (source === "archidekt") {
                const deckId = extractArchidektDeckId(deckUrl);
                if (!deckId) {
                    setError("Invalid Archidekt URL. Please paste a valid deck link.");
                    return;
                }

                setLoadingMessage("Connecting to Archidekt...");
                const deck = await fetchArchidektDeck(deckId);
                const summary = getArchidektSummary(deck);
                setLoadingMessage(`Found "${summary.name}" with ${summary.cardCount} cards`);

                const cards = extractArchidektCards(deck);
                cardInfos = cards.map((c) => ({
                    name: c.name,
                    set: c.set,
                    number: c.number,
                    quantity: c.quantity,
                    category: normalizeCategory(c.category),
                    isToken: c.isToken,
                }));
            } else if (source === "moxfield") {
                const deckId = extractMoxfieldDeckId(deckUrl);
                if (!deckId) {
                    setError("Invalid Moxfield URL. Please paste a valid deck link.");
                    return;
                }

                setLoadingMessage("Connecting to Moxfield...");
                const deck = await fetchMoxfieldDeck(deckId);
                const summary = getMoxfieldSummary(deck);
                setLoadingMessage(`Found "${summary.name}" with ${summary.cardCount} cards`);

                const cards = extractMoxfieldCards(deck);
                cardInfos = cards.map((c) => ({
                    name: c.name,
                    set: c.set,
                    number: c.number,
                    quantity: c.quantity,
                    category: normalizeCategory(c.category),
                    isToken: c.isToken,
                }));
            } else {
                setError("Invalid URL. Please paste an Archidekt or Moxfield deck link.");
                return;
            }

            if (cardInfos.length === 0) {
                setError("No cards found in deck. The deck may be empty.");
                setIsLoading(false);
                setLoadingTask(null);
                return;
            }

            await processCardFetch(cardInfos, source);
            setDeckUrl("");
            onUploadComplete?.();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to fetch deck";
            setError(message);
            setLoadingTask(null);
        } finally {
            setIsLoading(false);
        }
    };

    const processCardFetch = async (infos: CardInfo[], importSource: DeckSource) => {
        setLoadingTask("Fetching cards");
        setLoadingMessage("Connecting to Scryfall...");

        if (fetchController.current) {
            fetchController.current.abort();
        }
        fetchController.current = new AbortController();

        try {
            await streamCards({
                cardInfos: infos,
                language: globalLanguage,
                importType: importSource || 'scryfall',
                signal: fetchController.current.signal,
                onProgress: (processed, total) => setLoadingMessage(`(${processed} / ${total})`),
                onFirstCard: () => setLoadingTask(null),
            });
        } catch (err: unknown) {
            if (err instanceof Error && err.name !== "AbortError") {
                setLoadingTask(null);
                setError(err.message || "Something went wrong while fetching cards.");
            } else if (!(err instanceof Error)) {
                setLoadingTask(null);
                setError("An unknown error occurred while fetching cards.");
            }
        } finally {
            fetchController.current = null;
        }
    };

    return (
        <div className={`${mobile ? "landscape:space-y-1 space-y-2" : "space-y-4 mb-2"}`}>
            <div className={`flex items-center justify-between ${mobile ? 'landscape:hidden' : ''}`}>
                <h6 className="font-medium dark:text-white">Import Deck</h6>
                <AutoTooltip
                    content={
                        <span>
                            Paste a deck URL from{" "}
                            <a href="https://archidekt.com" target="_blank" rel="noreferrer" className="underline">Archidekt</a>
                            {" "}or{" "}
                            <a href="https://moxfield.com" target="_blank" rel="noreferrer" className="underline">Moxfield</a>
                            {" "}to import cards with categories
                        </span>
                    }
                    mobile={mobile}
                    tooltipClassName="w-[80%]"
                />
            </div>

            <div className={`flex flex-col gap-2 ${mobile ? 'landscape:gap-2' : ''}`}>
                <TextInput
                    type="text"
                    placeholder="Paste Archidekt or Moxfield deck URL..."
                    value={deckUrl}
                    onChange={(e) => {
                        setDeckUrl(e.target.value);
                        setError(null);
                    }}
                    disabled={isLoading}
                    className={`w-full ${mobile ? 'landscape:text-sm' : ''}`}
                    color={error ? "failure" : undefined}
                />
                <button
                    type="button"
                    onClick={handleImport}
                    disabled={isLoading || !isValidUrl}
                    className={`inline-block w-full text-center cursor-pointer rounded-md bg-blue-700 dark:bg-blue-600 ${mobile ? 'px-4 py-4 landscape:py-3' : 'px-4 py-3'} text-base font-medium text-white hover:bg-blue-800 dark:hover:bg-blue-700 active:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0`}
                >
                    {isLoading ? "Importing..." : "Import Deck"}
                </button>
            </div>

            {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
        </div>
    );
}
