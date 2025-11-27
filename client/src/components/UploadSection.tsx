import { fetchEventSource } from "@microsoft/fetch-event-source";
import React, { useRef, useState } from "react";
import { db } from "../db";
import fullLogo from "@/assets/fullLogo.png";
import logo from "@/assets/logo.png";
import { API_BASE, LANGUAGE_OPTIONS } from "@/constants";
import {
  cardKey,
  extractCardInfo,
  parseDeckToInfos,
} from "@/helpers/CardInfoHelper";
import {
  getMpcImageUrl,
  inferCardNameFromFilename,
  parseMpcText,
  tryParseMpcSchemaXml,
} from "@/helpers/Mpc";
import { useCardsStore, useLoadingStore, useSettingsStore } from "@/store";
import type { CardOption, ScryfallCard } from "../../../shared/types";
import axios from "axios";
import { addCards, addCustomImage, addRemoteImage } from "@/helpers/dbUtils";
import {
  Button,
  HelperText,
  HR,
  List,
  ListItem,
  Select,
  Textarea,
  Tooltip,
} from "flowbite-react";
import { ExternalLink, HelpCircle } from "lucide-react";
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
  onToggle?: () => void;
  cardCount: number; // Passed from parent to avoid redundant DB query
};

export function UploadSection(props: Props) {
  const [deckText, setDeckText] = useState("");
  // Controller for fetches
  const fetchController = useRef<AbortController | null>(null);
  // Controller for background enrichment tasks
  const enrichmentController = useRef<AbortController | null>(null);

  const setLoadingTask = useLoadingStore((state) => state.setLoadingTask);
  const setLoadingMessage = useLoadingStore((state) => state.setLoadingMessage);

  const globalLanguage = useSettingsStore((s) => s.globalLanguage ?? "en");
  const setGlobalLanguage = useSettingsStore(
    (s) => s.setGlobalLanguage ?? (() => { })
  );

  const { cardCount } = props;


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
      });
    }

    if (cardsToAdd.length > 0) {
      await addCards(cardsToAdd);
      enrichCardsMetadata(cardsToAdd);
    }
  }

  const handleUploadMpcFill = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setLoadingTask("Uploading Images");

    try {
      const files = e.target.files;
      if (files && files.length) {
        await addUploadedFiles(files, { hasBakedBleed: true });
      }
    } finally {
      if (e.target) e.target.value = "";

      setLoadingTask(null);
    }
  };

  const handleUploadStandard = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setLoadingTask("Uploading Images");
    try {
      const files = e.target.files;
      if (files && files.length) {
        await addUploadedFiles(files, { hasBakedBleed: false });
      }
    } finally {
      if (e.target) e.target.value = "";
      setLoadingTask(null);
    }
  };

  const handleImportMpcXml = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      const raw = await readText(file);
      const schemaItems = tryParseMpcSchemaXml(raw);
      const items =
        schemaItems && schemaItems.length ? schemaItems : parseMpcText(raw);

      const cardsToAdd: Array<
        Omit<CardOption, "uuid" | "order"> & { imageId?: string }
      > = [];

      for (const it of items) {
        const qty = it.qty || 1;
        // Clean the name and extract set/number if present
        const rawName = it.name || (it.filename ? inferCardNameFromFilename(it.filename) : "Custom Art");
        const info = extractCardInfo(rawName);
        const name = info.name;

        const mpcUrl = getMpcImageUrl(it.frontId);
        const imageUrls = mpcUrl ? [mpcUrl] : [];

        // Add image once with the full quantity count
        const imageId = await addRemoteImage(imageUrls, qty);

        for (let i = 0; i < qty; i++) {
          cardsToAdd.push({
            name,
            set: info.set,
            number: info.number,
            imageId: imageId,
            isUserUpload: true,
            hasBakedBleed: true,
          });
        }
      }

      if (cardsToAdd.length > 0) {
        await addCards(cardsToAdd);
        useSettingsStore.getState().setSortBy("manual");
        // Enrich metadata in background
        enrichCardsMetadata(cardsToAdd);
      }
    } finally {
      if (e.target) e.target.value = "";
    }
  };

  const enrichCardsMetadata = async (cards: Partial<CardOption>[]) => {
    // Abort any previous enrichment task to avoid queue congestion
    if (enrichmentController.current) {
      enrichmentController.current.abort();
    }
    enrichmentController.current = new AbortController();
    const signal = enrichmentController.current.signal;

    const uniqueNames = new Set<string>();
    cards.forEach((c) => {
      if (c.name && c.name !== "Custom Art") {
        // Clean the name using extractCardInfo to handle [Set] {Number} and other tags
        const info = extractCardInfo(c.name);
        uniqueNames.add(info.name);
      }
    });

    if (uniqueNames.size === 0) return;

    const cardInfos: CardInfo[] = Array.from(uniqueNames).map((name) => ({
      name,
      quantity: 1,
    }));

    // We don't want to block the UI, so we don't await this fully or set global loading state
    // But we might want to show a small indicator or just let it happen.
    // For now, let's just run it.

    try {
      await fetchEventSource(`${API_BASE}/api/stream/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardQueries: cardInfos,
          language: globalLanguage,
        }),
        signal,
        onmessage: async (ev) => {
          if (ev.event === "card-found") {
            const card = JSON.parse(ev.data) as ScryfallCard;
            if (!card?.name) return;

            // Find all cards in DB with this name and update them
            // We need to be careful not to overwrite existing data if it's already there?
            // But here we are enriching, so we assume it's missing.

            // We can use a bulk update or iterate.
            // Since we don't have IDs of the cards we just added easily available (unless we query them back),
            // we can query by name.

            // Use a transaction to update all matching cards efficiently
            await db.transaction('rw', db.cards, async () => {
              const cardsToUpdate = await db.cards
                .where("name")
                .equalsIgnoreCase(card.name)
                .toArray();

              const updates: CardOption[] = [];
              for (const c of cardsToUpdate) {
                // Only update if missing metadata
                if (!c.colors || !c.cmc || !c.type_line || !c.rarity || !c.mana_cost) {
                  updates.push({
                    ...c,
                    colors: card.colors,
                    cmc: card.cmc,
                    type_line: card.type_line,
                    rarity: card.rarity,
                    mana_cost: card.mana_cost,
                  });
                }
              }

              if (updates.length > 0) {
                await db.cards.bulkPut(updates);
              }
            });
          }
        },
        onerror: (err) => {
          // Ignore abort errors
          if (err instanceof Error && err.name === 'AbortError') {
            throw err;
          }
          throw err; // Stop retrying
        }
      });
    } catch (e) {
      // Ignore abort errors
      if (e instanceof Error && e.name === 'AbortError') {
        return;
      }
    } finally {
      if (enrichmentController.current?.signal === signal) {
        enrichmentController.current = null;
      }
    }
  };

  const handleSubmit = async () => {
    if (fetchController.current) {
      fetchController.current.abort();
    }
    fetchController.current = new AbortController();
    const signal = fetchController.current.signal;

    try {
      const infos = parseDeckToInfos(deckText || "");
      if (!infos.length) return;

      setLoadingTask("Fetching cards");

      const uniqueMap = new Map<string, CardInfo>();
      for (const info of infos) uniqueMap.set(cardKey(info), info);
      const uniqueInfos = Array.from(uniqueMap.values());

      const optionByKey: Record<string, ScryfallCard> = {};

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
            // no-op
          } else if (ev.event === "card-found") {
            const card = JSON.parse(ev.data) as ScryfallCard;
            if (!card?.name) return;

            const k = cardKey({
              name: card.name,
              set: card.set,
              number: card.number,
            });
            optionByKey[k] = card;
            const nameOnlyKey = cardKey({ name: card.name });
            if (!optionByKey[nameOnlyKey]) optionByKey[nameOnlyKey] = card;
          } else if (ev.event === "done") {
            const cardsToAdd: (Omit<CardOption, "uuid" | "order"> & {
              imageId?: string;
            })[] = [];

            for (const info of infos) {
              const k = cardKey(info);
              const fallbackK = cardKey({ name: info.name });
              const card = optionByKey[k] ?? optionByKey[fallbackK];
              const quantity = info.quantity ?? 1;
              const imageId = await addRemoteImage(card?.imageUrls ?? [], quantity);
              for (let i = 0; i < quantity; i++) {
                cardsToAdd.push({
                  name: card?.name || info.name,
                  set: card?.set,
                  number: card?.number,
                  lang: card?.lang,
                  isUserUpload: false,
                  imageId: imageId,
                  colors: card?.colors,
                  cmc: card?.cmc,
                  type_line: card?.type_line,
                  rarity: card?.rarity,
                  mana_cost: card?.mana_cost,
                });
              }
            }

            if (cardsToAdd.length > 0) {
              await addCards(cardsToAdd);
              useSettingsStore.getState().setSortBy("manual");
            }

            setDeckText("");
          }
        },
        onclose: () => {
          setLoadingTask(null);
          fetchController.current = null;
        },
        onerror: (err) => {
          // The library handles retries, this is for fatal errors
          setLoadingTask(null);
          if (err.name !== "AbortError") {
            alert("An error occurred while fetching cards. Please try again.");
          }
          fetchController.current = null;
          throw err; // This will stop retries
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

    // Abort any running fetches
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
      // The server cache clear is now handled by the clearAllCardsAndImages action if needed
      // or can be removed if the server cache is no longer relevant for client-side clear.
      // For now, we'll keep the server call as it might be clearing other things.
      try {
        await axios.delete(`${API_BASE}/api/cards/images`, {
          timeout: 15000,
        });
      } catch (e) {
        console.warn(
          "[Clear] Server cache clear failed (UI already cleared):",
          e
        );
      }
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

  const { isCollapsed } = props;
  const toggleUploadPanel = useSettingsStore((state) => state.toggleUploadPanel);

  if (isCollapsed) {
    return (
      <div
        className="h-full flex flex-col bg-gray-100 dark:bg-gray-700 items-center py-4 gap-4 border-r border-gray-200 dark:border-gray-600"
        onDoubleClick={() => toggleUploadPanel()}
      >
        <Tooltip content="Proxxied" placement="right">
          <button
            onClick={() => {
              toggleUploadPanel();
            }}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <img src={logo} alt="Proxxied" className="size-8" />
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="w-full h-full dark:bg-gray-700 bg-gray-100 flex flex-col border-r border-gray-200 dark:border-gray-600">
      <div>
        <img src={fullLogo} alt="Proxxied Logo" className="w-full" />
      </div>

      <div className="flex-1 flex flex-col overflow-y-auto gap-6 px-4 pb-4 pt-4">
        <div className="flex flex-col gap-4">
          <div className="space-y-1">
            <h6 className="font-medium dark:text-white">
              Upload MPC Images (
              <a
                href="https://mpcfill.com"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-blue-600 dark:hover:text-blue-400"
              >
                MPC Autofill
                <ExternalLink className="inline-block size-4 ml-1" />
              </a>
              )
            </h6>

            <label
              htmlFor="upload-mpc"
              className="inline-block w-full text-center cursor-pointer rounded-md bg-gray-300 dark:bg-gray-600 px-4 py-2 text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500"
            >
              Choose Files
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

          <div className="space-y-1">
            <h6 className="font-medium dark:text-white">
              Import MPC Text (XML)
            </h6>

            <label
              htmlFor="import-mpc-xml"
              className="inline-block w-full text-center cursor-pointer rounded-md bg-gray-300 dark:bg-gray-600 px-4 py-2 text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500"
            >
              Choose File
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

          <div className="space-y-1">
            <h6 className="font-medium dark:text-white">Upload Other Images</h6>
            <label
              htmlFor="upload-standard"
              className="inline-block w-full text-center cursor-pointer rounded-md bg-gray-300 dark:bg-gray-600 px-4 py-2 text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500"
            >
              Choose Files
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
            <HelperText>
              You can upload images from mtgcardsmith, custom designs, etc.
            </HelperText>
          </div>
        </div>

        <HR className="my-0 dark:bg-gray-500" />

        <div className="space-y-4">
          <div className="space-y-1">
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
              className="h-64 resize-none"
              placeholder={`1x Sol Ring\n2x Counterspell\nFor specific art include set / CN\neg. Strionic Resonator (lcc)\nor Repurposing Bay (dft) 380`}
              value={deckText}
              onChange={(e) => setDeckText(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Button color="blue" onClick={handleSubmit}>
              Fetch Cards
            </Button>
            <Button
              color="red"
              onClick={handleClear}
              disabled={cardCount === 0}
            >
              Clear Cards
            </Button>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <h6 className="font-medium dark:text-white">Language</h6>
              <Tooltip content="Used for Scryfall lookups">
                <HelpCircle className="w-4 h-4 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 cursor-pointer" />
              </Tooltip>
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

          <div>
            <h6 className="font-medium dark:text-white">Tips:</h6>

            <List className="text-sm dark:text-white/60">
              <ListItem>To change a card art - click it</ListItem>
              <ListItem>
                To move a card - drag from the box at the top right
              </ListItem>
              <ListItem>
                To duplicate or delete a card - right click it
              </ListItem>
            </List>
          </div>
        </div>

        <HR className="my-0 dark:bg-gray-500" />
      </div>

      {showClearConfirmModal && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 flex items-center justify-center">
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
        </div>
      )}
    </div>
  );
}
