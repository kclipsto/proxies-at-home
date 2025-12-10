import { fetchEventSource } from "@microsoft/fetch-event-source";
import React, { useRef, useState } from "react";
import { db } from "../db";
import fullLogo from "@/assets/fullLogo.png";
import { API_BASE, LANGUAGE_OPTIONS } from "@/constants";
import {
  cardKey,
  parseDeckToInfos,
} from "@/helpers/CardInfoHelper";
import {
  inferCardNameFromFilename,
  processMpcImport,
} from "@/helpers/Mpc";
import { useCardsStore } from "@/store";
import { useLoadingStore } from "@/store/loading";
import { useSettingsStore } from "@/store/settings";
import type { CardOption, ScryfallCard } from "../../../shared/types";
import { addCards, addCustomImage, addRemoteImage } from "@/helpers/dbUtils";
import { undoableAddCards } from "@/helpers/undoableActions";
import { importStats } from "@/helpers/importStats";
import {
  Button,
  HR,
  Select,
  Textarea,
} from "flowbite-react";
import { ExternalLink, HelpCircle, Download, MousePointerClick, Move, Copy, Upload } from "lucide-react";
import { createPortal } from "react-dom";
import { AutoTooltip } from "./AutoTooltip";
import { PullToRefresh } from "./PullToRefresh";
import { AdvancedSearch } from "./AdvancedSearch";
import type { CardInfo } from "../../../shared/types";


async function readText(file: File): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result || ""));
    r.readAsText(file);
  });
}

type Props = {
  isCollapsed?: boolean;
  cardCount: number;
  mobile?: boolean;
  onUploadComplete?: () => void;
};

export function UploadSection({ isCollapsed, cardCount, mobile, onUploadComplete }: Props) {
  const [deckText, setDeckText] = useState("");
  const fetchController = useRef<AbortController | null>(null);
  const enrichmentController = useRef<AbortController | null>(null);


  const setLoadingTask = useLoadingStore((state) => state.setLoadingTask);
  const setLoadingMessage = useLoadingStore((state) => state.setLoadingMessage);

  const globalLanguage = useSettingsStore((s) => s.globalLanguage ?? "en");


  const setGlobalLanguage = useSettingsStore(
    (s) => s.setGlobalLanguage ?? (() => { })
  );

  async function addUploadedFiles(
    files: FileList,
    opts: { hasBakedBleed: boolean }
  ) {
    const fileArray = Array.from(files);

    const cardsToAdd: Array<
      Omit<CardOption, "uuid" | "order"> & { imageId: string }
    > = [];

    for (const file of fileArray) {
      const suffix = opts.hasBakedBleed ? "-mpc" : "-std";
      const imageId = await addCustomImage(file, suffix);
      cardsToAdd.push({
        name: inferCardNameFromFilename(file.name) || `Custom Art`,
        imageId: imageId,
        isUserUpload: true,
        hasBakedBleed: opts.hasBakedBleed,
        needsEnrichment: true, // Try to fetch metadata based on inferred card name
      });
    }

    if (cardsToAdd.length > 0) {
      await undoableAddCards(cardsToAdd);
      onUploadComplete?.();
    }
  }

  const createFileUploadHandler = (hasBakedBleed: boolean) => async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileCount = e.target.files.length;
      const startTime = performance.now();
      console.log(`[Image Upload] Starting upload of ${fileCount} images`);

      setLoadingTask("Processing Images");
      try {
        await addUploadedFiles(e.target.files, { hasBakedBleed });
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
        console.log(`[Image Upload] Completed ${fileCount} images in ${elapsed}s`);
      } finally {
        setLoadingTask(null);
      }
    }
  };

  const handleUploadMpcFill = createFileUploadHandler(true);
  const handleUploadStandard = createFileUploadHandler(false);

  const handleImportMpcXml = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const startTime = performance.now();
    console.log(`[MPC XML Import] Starting import of ${file.name}`);

    setLoadingTask("Processing Images");
    try {
      const text = await readText(file);

      const result = await processMpcImport(text, (_current, _total, message) => {
        setLoadingTask("Fetching cards");
        setLoadingMessage(message);
      });

      if (result.success) {
        onUploadComplete?.();
      }

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

      if (result.success && result.count > 0) {
        console.log(`[MPC XML Import] Completed ${result.count} cards in ${elapsed}s`);
        useSettingsStore.getState().setSortBy("manual");
        onUploadComplete?.();
      } else if (result.error) {
        console.log(`[MPC XML Import] Failed after ${elapsed}s: ${result.error}`);
        alert(result.error);
      } else {
        console.log(`[MPC XML Import] No cards found after ${elapsed}s`);
        alert("No cards found in the file.");
      }
    } catch (err) {
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      console.error(`[MPC XML Import] Error after ${elapsed}s:`, err);
      alert("Failed to parse file.");
    } finally {
      setLoadingTask(null);
      if (e.target) e.target.value = "";
    }
  };

  const processCardFetch = async (infos: CardInfo[]) => {
    console.log(`[Deck Text Import] Starting fetch for ${infos.length} cards`);

    setLoadingTask("Fetching cards");
    setLoadingMessage("Connecting to Scryfall...");

    // Switch to preview immediately on mobile if requested
    onUploadComplete?.();

    // Abort previous fetch if any
    if (fetchController.current) {
      fetchController.current.abort();
    }
    fetchController.current = new AbortController();
    const signal = fetchController.current.signal;

    // Calculate total cards including quantities
    let totalCards = 0;
    for (const info of infos) {
      totalCards += info.quantity ?? 1;
    }

    // Start import stats tracking
    importStats.start(totalCards, undefined, { importType: 'scryfall' });
    importStats.markImageLoadStart();

    try {
      // Build a map of card queries to their quantities
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
            // Track failed cards
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

            // Find matching query entry to get quantity
            // Try exact match first, then fallbacks
            const exactKey = cardKey({ name: card.name, set: card.set, number: card.number });
            const setOnlyKey = card.set ? cardKey({ name: card.name, set: card.set }) : null;
            const nameOnlyKey = cardKey({ name: card.name });

            const entry = quantityByKey.get(exactKey)
              || (setOnlyKey && quantityByKey.get(setOnlyKey))
              || quantityByKey.get(nameOnlyKey);

            const quantity = entry?.quantity ?? 1;

            // Add image to DB
            const imageId = await addRemoteImage(card.imageUrls ?? [], quantity, card.prints);

            // Build card entries
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

            // Add cards immediately
            if (cardsToAdd.length > 0) {
              const added = await undoableAddCards(cardsToAdd);
              cardsAdded += added.length;
              const newUuids = added.map(c => c.uuid);
              addedCardUuids.push(...newUuids);
              // Register immediately so importStats can track processing
              importStats.registerPendingCards(newUuids);

              // Dismiss loading popup on first card so users see cards appearing
              if (cardsAdded === added.length) {
                setLoadingTask(null);
              }
            }
          } else if (ev.event === "done") {
            // Mark image load phase complete
            importStats.markImageLoadEnd();

            if (cardsAdded > 0) {
              useSettingsStore.getState().setSortBy("manual");
            }

            console.log(`[Deck Text Import] Added ${cardsAdded} cards, awaiting image processing...`);


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

  const clearAllCardsAndImages = useCardsStore(
    (state) => state.clearAllCardsAndImages
  );

  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);

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
      // Server cache is managed by LRU eviction - no need to clear on user action
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

  const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);

  const handleAddCard = async (cardName: string, set?: string, number?: string) => {
    await processCardFetch([{ name: cardName, set, number, quantity: 1 }]);
  };

  const toggleUploadPanel = useSettingsStore((state) => state.toggleUploadPanel);

  if (isCollapsed) {
    return (
      <div
        className={`h-full flex flex-col bg-gray-100 dark:bg-gray-700 items-center py-4 gap-4 border-r border-gray-200 dark:border-gray-600 ${mobile ? "mobile-scrollbar-hide" : "overflow-y-auto"} select-none`}
        onDoubleClick={() => toggleUploadPanel()}
      >
        <AutoTooltip content="Proxxied" placement="right" mobile={mobile}>
          <button
            onClick={() => {
              toggleUploadPanel();
            }}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <img src="/logo.svg" className="w-8 h-8" alt="Proxxied Logo" />
          </button>
        </AutoTooltip>
      </div>
    );
  }

  return (
    <div className={`w-full h-full dark:bg-gray-700 bg-gray-100 flex flex-col border-r border-gray-200 dark:border-gray-600`}>
      {!mobile && (
        <div>
          <img src={fullLogo} alt="Proxxied Logo" className="w-full" />
        </div>
      )}



      <PullToRefresh className={`flex-1 flex flex-col overflow-y-auto gap-6 px-4 pb-4 pt-4 ${mobile ? "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" : ""}`}>
        {mobile && (
          <div className={`flex justify-center mb-2 ${mobile ? 'landscape:hidden' : ''}`}>
            <img src={fullLogo} alt="Proxxied Logo" className="w-[80%] landscape:w-auto landscape:h-12" />
          </div>
        )}
        <div className={`flex flex-col ${mobile ? 'landscape:grid landscape:grid-cols-2 landscape:gap-6 landscape:h-full landscape:grid-rows-[1fr_auto]' : ''} gap-4`}>
          <div className={`flex flex-col gap-4 ${mobile ? 'landscape:gap-2 landscape:h-full landscape:justify-between' : ''}`}>
            <div className={`flex flex-col gap-4 ${mobile ? 'landscape:gap-2' : ''}`}>
              {/* Logo for Landscape */}
              <div className={`hidden ${mobile ? 'landscape:flex' : ''} justify-center mb-2`}>
                <img src={fullLogo} alt="Proxxied Logo" className={`w-[80%] ${mobile ? 'landscape:w-[50%]' : ''} h-auto`} />
              </div>

              <div className={`space-y-1 ${mobile ? '' : ''}`}>
                <h6 className="font-medium dark:text-white sr-only">Upload MPC Images</h6>

                <label
                  htmlFor="upload-mpc"
                  className={`inline-block w-full text-center cursor-pointer rounded-md bg-gray-300 dark:bg-gray-600 ${mobile ? 'px-4 py-4 landscape:py-3' : 'px-4 py-3'} text-base font-medium text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500 active:translate-y-[2px]`}
                >
                  Upload MPC Images
                </label>
                <input
                  id="upload-mpc"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUploadMpcFill}
                  onClick={(e) => ((e.target as HTMLInputElement).value = "")}
                  className="hidden"
                />
              </div>

              <div className={`space-y-1 ${mobile ? '' : ''}`}>
                <label
                  htmlFor="import-mpc-xml"
                  className={`inline-block w-full text-center cursor-pointer rounded-md bg-gray-300 dark:bg-gray-600 ${mobile ? 'px-4 py-4 landscape:py-3' : 'px-4 py-3'} text-base font-medium text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500 active:translate-y-[2px]`}
                >
                  Import MPC Text (XML)
                </label>
                <input
                  id="import-mpc-xml"
                  type="file"
                  accept=".xml,.txt,.csv,.log,text/xml,text/plain"
                  onChange={handleImportMpcXml}
                  onClick={(e) => ((e.target as HTMLInputElement).value = "")}
                  className="hidden"
                />
              </div>

              <div className={`space-y-1 ${mobile ? '' : ''}`}>
                <label
                  htmlFor="upload-standard"
                  className={`inline-block w-full text-center cursor-pointer rounded-md bg-gray-300 dark:bg-gray-600 ${mobile ? 'px-4 py-4 landscape:py-3' : 'px-4 py-3'} text-base font-medium text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500 active:translate-y-[2px]`}
                >
                  Upload Other Images
                </label>
                <input
                  id="upload-standard"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUploadStandard}
                  onClick={(e) => ((e.target as HTMLInputElement).value = "")}
                  className="hidden"
                />
              </div>
            </div>

            {/* Language Selector - Moved here for Landscape */}
            <div className={`space-y-1 hidden ${mobile ? 'landscape:block' : ''}`}>
              <div className="flex items-center justify-between">
                <h6 className="font-medium dark:text-white">Language</h6>
                <AutoTooltip content="Used for Scryfall lookups" mobile={mobile}>
                  <HelpCircle className="w-4 h-4 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 cursor-pointer" />
                </AutoTooltip>
              </div>

              <Select
                className="w-full rounded-md bg-gray-300 dark:bg-gray-600 mt-2 text-sm text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500"
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
          </div>

          <HR className={`my-0 dark:bg-gray-500 ${mobile ? 'landscape:hidden' : ''}`} />

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
          </div>

          {/* Tips - Full width at bottom */}
          <div className={`${mobile ? 'landscape:col-span-2' : ''} pb-4`}>
            <h6 className="font-medium dark:text-white mb-2">Tips:</h6>

            <div className={`text-sm dark:text-white/60 flex flex-col gap-2 ${mobile ? 'landscape:grid landscape:grid-cols-2' : ''}`}>
              <div className="flex items-center gap-2 bg-gray-300 dark:bg-gray-600 p-2 rounded-md h-full">
                <Download className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span>
                  Download images from{" "}
                  <a
                    href="https://mpcfill.com"
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    MPC Autofill
                    <ExternalLink className="inline-block size-3 ml-1" />
                  </a>
                </span>
              </div>
              <div className="flex items-center gap-2 bg-gray-300 dark:bg-gray-600 p-2 rounded-md h-full">
                <MousePointerClick className="w-4 h-4 shrink-0 text-purple-600 dark:text-purple-400" />
                <span>To change a card art - {mobile ? "tap" : "click"} it</span>
              </div>
              <div className="flex items-center gap-2 bg-gray-300 dark:bg-gray-600 p-2 rounded-md h-full">
                <Move className="w-4 h-4 shrink-0 text-green-600 dark:text-green-400" />
                <span>To move a card - {mobile ? "long press and drag" : "drag from the box at the top right"}</span>
              </div>
              <div className="flex items-center gap-2 bg-gray-300 dark:bg-gray-600 p-2 rounded-md h-full">
                <Copy className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>To duplicate or delete a card - {mobile ? "double tap" : "right click"} it</span>
              </div>
              <div className="flex items-center gap-2 bg-gray-300 dark:bg-gray-600 p-2 rounded-md h-full">
                <Upload className="w-4 h-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
                <span>You can upload images from mtgcardsmith, custom designs, etc.</span>
              </div>
            </div>
          </div>
        </div>
        <HR className="my-0 dark:bg-gray-500" />
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
      </PullToRefresh >
    </div >
  );
}
