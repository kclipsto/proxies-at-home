import { useState, useRef } from "react";
import { TextInput } from "flowbite-react";
import { ExternalLink } from "lucide-react";
import { streamCards, type CardInfo } from "@/helpers/streamCards";
import { useSettingsStore } from "@/store";
import { useLoadingStore } from "@/store/loading";
import { AutoTooltip } from "../AutoTooltip";
import {
    extractArchidektDeckId,
    isArchidektUrl,
    fetchArchidektDeck,
    extractCardsFromDeck,
    getDeckSummary,
} from "@/helpers/archidektApi";

type Props = {
    mobile?: boolean;
    onUploadComplete?: () => void;
};

export function ArchidektImporter({ mobile, onUploadComplete }: Props) {
    const [deckUrl, setDeckUrl] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchController = useRef<AbortController | null>(null);

    const setLoadingTask = useLoadingStore((state) => state.setLoadingTask);
    const setLoadingMessage = useLoadingStore((state) => state.setLoadingMessage);
    const globalLanguage = useSettingsStore((s) => s.globalLanguage ?? "en");

    const isValidUrl = isArchidektUrl(deckUrl);

    const handleImport = async () => {
        const deckId = extractArchidektDeckId(deckUrl);
        if (!deckId) {
            setError("Invalid Archidekt URL. Please paste a valid deck link.");
            return;
        }

        setError(null);
        setIsLoading(true);
        setLoadingTask("Fetching cards");

        try {
            // Fetch deck data from Archidekt
            setLoadingMessage("Connecting to Archidekt...");
            const deck = await fetchArchidektDeck(deckId);

            const summary = getDeckSummary(deck);
            setLoadingMessage(`Found "${summary.name}" with ${summary.cardCount} cards`);

            // Extract cards from deck
            const archidektCards = extractCardsFromDeck(deck);

            if (archidektCards.length === 0) {
                setError("No cards found in deck. The deck may be empty.");
                setIsLoading(false);
                setLoadingTask(null);
                return;
            }

            // Convert to CardInfo format for the existing Scryfall stream
            const cardInfos: CardInfo[] = archidektCards.map((c) => ({
                name: c.name,
                set: c.set,
                number: c.number,
                quantity: c.quantity,
                category: c.category,
            }));

            // Use shared streaming logic
            await processCardFetch(cardInfos);

            // Clear input on success
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

    const processCardFetch = async (infos: CardInfo[]) => {
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
                importType: 'archidekt',
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
                <h6 className="font-medium dark:text-white">
                    Import from{" "}
                    <a
                        href="https://archidekt.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-blue-600 dark:hover:text-blue-400"
                    >
                        Archidekt
                        <ExternalLink className="inline-block size-3 ml-1" />
                    </a>
                </h6>
                <AutoTooltip
                    content="Paste an Archidekt deck URL to import all cards"
                    mobile={mobile}
                    tooltipClassName="w-[80%]"
                />
            </div>

            <div className={`flex flex-col gap-2 ${mobile ? 'landscape:gap-2' : ''}`}>
                <TextInput
                    type="text"
                    placeholder="https://archidekt.com/decks/..."
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
                    {isLoading ? "Importing..." : "Import from Archidekt"}
                </button>
            </div>

            {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
        </div>
    );
}
