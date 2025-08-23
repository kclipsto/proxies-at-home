import axios from "axios";
import { Button, Label, Textarea } from "flowbite-react";
import React, { useState } from "react";
import cardBack from "../assets/cardBack.png";
import fullLogo from "../assets/fullLogo.png";
import { API_BASE } from "../constants";
import {
  cardKey,
  parseDeckToInfos,
  type CardInfo,
} from "../helpers/CardInfoHelper";
import {
  addBleedEdge,
  getLocalBleedImageUrl,
  trimBleedEdge,
  urlToDataUrl,
} from "../helpers/ImageHelper";
import {
  getMpcImageUrl,
  inferCardNameFromFilename,
  parseMpcText,
  tryParseMpcSchemaXml,
} from "../helpers/Mpc";
import { useLoadingStore, useSettingsStore } from "../store";
import { useCardsStore } from "../store/cards";
import type { CardOption } from "../types/Card";

async function readText(file: File): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result || ""));
    r.readAsText(file);
  });
}

export function UploadSection() {
  const [deckText, setDeckText] = useState("");
  const bleedEdgeWidth = useSettingsStore((state) => state.bleedEdgeWidth);
  const cards = useCardsStore((state) => state.cards);

  const setLoadingTask = useLoadingStore((state) => state.setLoadingTask);
  const appendCards = useCardsStore((state) => state.appendCards);
  const setCards = useCardsStore((state) => state.setCards);
  const setSelectedImages = useCardsStore((state) => state.setSelectedImages);
  const appendSelectedImages = useCardsStore(
    (state) => state.appendSelectedImages
  );
  const setOriginalSelectedImages = useCardsStore(
    (state) => state.setOriginalSelectedImages
  );
  const appendOriginalSelectedImages = useCardsStore(
    (state) => state.appendOriginalSelectedImages
  );

  async function processToWithBleed(
    srcBase64: string,
    opts: { hasBakedBleed: boolean }
  ) {
    // If the image already includes extra border/bleed (MPC Fill), trim first.
    const trimmed = opts.hasBakedBleed
      ? await trimBleedEdge(srcBase64)
      : srcBase64;

    // Then add your consistent bleed
    const withBleedBase64 = await addBleedEdge(trimmed, bleedEdgeWidth);

    return { originalBase64: srcBase64, withBleedBase64 };
  }

  async function addUploadedFiles(
    files: FileList,
    opts: { hasBakedBleed: boolean }
  ) {
    const fileArray = Array.from(files);
    const startIndex = cards.length;

    const newCards: CardOption[] = fileArray.map((file, i) => ({
      name:
        inferCardNameFromFilename(file.name) ||
        `Custom Art ${startIndex + i + 1}`,
      imageUrls: [],
      uuid: crypto.randomUUID(),
      isUserUpload: true,
      hasBakedBleed: opts.hasBakedBleed,
    }));

    appendCards(newCards);

    const originalsUpdate: Record<string, string> = {};
    const processedUpdate: Record<string, string> = {};

    await Promise.all(
      fileArray.map(async (file, i) => {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

        const { originalBase64, withBleedBase64 } = await processToWithBleed(
          base64,
          opts
        );

        const id = newCards[i].uuid;
        originalsUpdate[id] = originalBase64;
        processedUpdate[id] = withBleedBase64;
      })
    );

    appendOriginalSelectedImages(originalsUpdate);
    appendSelectedImages(processedUpdate);
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
      if (!files || !files.length) return;

      const fileArray = Array.from(files);
      const startIndex = cards.length;

      const newCards: CardOption[] = fileArray.map((_, i) => ({
        name: `Custom Art ${startIndex + i + 1}`,
        imageUrls: [],
        uuid: crypto.randomUUID(),
        isUserUpload: true,
        hasBakedBleed: false,
      }));

      console.log(newCards);

      appendCards(newCards);

      const base64s = await Promise.all(
        fileArray.map(
          (file) =>
            new Promise<string>((resolve) => {
              const r = new FileReader();
              r.onloadend = () => resolve(r.result as string);
              r.readAsDataURL(file);
            })
        )
      );

      console.log(base64s);
      const newOriginals: Record<string, string> = {};
      const processed: Record<string, string> = {};

      newCards.forEach((c, i) => {
        newOriginals[c.uuid] = base64s[i];
      });

      for (const [uuid, b64] of Object.entries(newOriginals)) {
        console.log(b64);
        const bleedImage = await addBleedEdge(b64);
        console.log(bleedImage);
        processed[uuid] = bleedImage;
      }

      appendOriginalSelectedImages(newOriginals);
      appendSelectedImages(processed);
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

      const newCards: CardOption[] = [];
      const newOriginals: Record<string, string> = {};

      for (const it of items) {
        for (let i = 0; i < (it.qty || 1); i++) {
          const uuid = crypto.randomUUID();
          const name =
            it.name ||
            (it.filename
              ? inferCardNameFromFilename(it.filename)
              : "Custom Art");

          newCards.push({
            uuid,
            name,
            imageUrls: [],
            isUserUpload: true,
            hasBakedBleed: true,
          });

          const mpcUrl = getMpcImageUrl(it.frontId);
          if (mpcUrl) {
            newOriginals[uuid] = mpcUrl;
          }
        }
      }

      appendCards(newCards);
      if (Object.keys(newOriginals).length) {
        appendOriginalSelectedImages(newOriginals);
      }
    } finally {
      if (e.target) e.target.value = "";
    }
  };

  const handleSubmit = async () => {
    setLoadingTask("Fetching cards");

    const infos = parseDeckToInfos(deckText);

    const uniqueMap = new Map<string, CardInfo>();
    for (const ci of infos) uniqueMap.set(cardKey(ci), ci);
    const uniqueInfos = Array.from(uniqueMap.values());

    const uniqueNames = Array.from(new Set(uniqueInfos.map((ci) => ci.name)));

    await axios.delete(`${API_BASE}/api/cards/images`);

    const response = await axios.post<CardOption[]>(
      `${API_BASE}/api/cards/images`,
      {
        cardQueries: uniqueInfos,
        cardNames: uniqueNames,
        cardArt: "art",
      }
    );

    const optionByKey: Record<string, CardOption> = {};
    for (const opt of response.data) {
      const k = `${opt.name.toLowerCase()}|${opt.set ?? ""}|${opt.number ?? ""}`;
      optionByKey[k] = opt;
      const nameOnlyKey = `${opt.name.toLowerCase()}||`;
      if (!optionByKey[nameOnlyKey]) optionByKey[nameOnlyKey] = opt;
    }

    const expandedCards: CardOption[] = infos.map((ci) => {
      const k = cardKey(ci);
      const fallbackK = `${ci.name.toLowerCase()}||`;
      const card = optionByKey[k] ?? optionByKey[fallbackK];
      return {
        ...card,
        uuid: crypto.randomUUID(),
      };
    });

    appendCards(expandedCards);

    const newOriginals: Record<string, string> = {};
    for (const card of expandedCards) {
      if (card?.imageUrls?.length > 0) {
        newOriginals[card.uuid] = card.imageUrls[0];
      }
    }
    appendOriginalSelectedImages(newOriginals);

    setLoadingTask("Processing Images");

    const processed: Record<string, string> = {};
    for (const [uuid, url] of Object.entries(newOriginals)) {
      const proxiedUrl = getLocalBleedImageUrl(url);
      const bleedImage = await addBleedEdge(proxiedUrl, bleedEdgeWidth);
      processed[uuid] = bleedImage;
    }

    appendSelectedImages(processed);
    setLoadingTask(null);
    setDeckText("");
  };

  const handleClear = async () => {
    setLoadingTask("Clearing Images");

    await axios.delete(`${API_BASE}/api/cards/images`);
    setCards([]);
    setSelectedImages({});
    setOriginalSelectedImages({});

    setLoadingTask(null);
  };

  const addCardBackPage = async () => {
    setLoadingTask("Uploading Images");

    try {
      const base64 = await urlToDataUrl(cardBack);
      const trimmed = await trimBleedEdge(base64);
      const withBleed = await addBleedEdge(trimmed, bleedEdgeWidth);

      const newCards: CardOption[] = Array.from({ length: 9 }).map(() => ({
        uuid: crypto.randomUUID(),
        name: "Default Card Back",
        imageUrls: [],
        isUserUpload: true,
      }));

      appendCards(newCards);

      appendOriginalSelectedImages(
        newCards.reduce(
          (acc, c) => {
            acc[c.uuid] = base64;
            return acc;
          },
          {} as Record<string, string>
        )
      );
      appendSelectedImages(
        newCards.reduce(
          (acc, c) => {
            acc[c.uuid] = withBleed;
            return acc;
          },
          {} as Record<string, string>
        )
      );
    } finally {
      setLoadingTask(null);
    }
  };

  return (
    <div className="w-1/5 dark:bg-gray-700 bg-gray-100 flex flex-col">
      <img src={fullLogo} alt="Proxxied Logo" />

      <div className="flex-1 overflow-y-auto space-y-4 px-4 pb-4">
        <div className="space-y-2">
          {/* MPC Fill */}
          <Label className="block text-gray-700 dark:text-gray-300">
            Upload MPC Images (
            <a
              href="https://mpcfill.com"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-blue-600 dark:hover:text-blue-400"
            >
              MPC Autofill
            </a>
            )
          </Label>

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

          <Label className="block text-gray-700 dark:text-gray-300">
            Import MPC Text (XML)
          </Label>
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

          {/* Standard */}
          <Label className="block text-gray-700 dark:text-gray-300">
            Upload Other Images (mtgcardsmith, custom designs, etc.)
          </Label>
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
        </div>
        <Label className="block text-gray-700 dark:text-gray-300">
          Add Cards (
          <a
            href="https://scryfall.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-blue-600 dark:hover:text-blue-400"
          >
            Scryfall
          </a>
          )
        </Label>
        <Textarea
          className="h-64"
          placeholder={`1x Sol Ring
2x Counterspell
For specific art include set / CN
eg. Strionic Resonator (lcc)
or Repurposing Bay (dft) 380`}
          value={deckText}
          onChange={(e) => setDeckText(e.target.value)}
        />
        <Button className="bg-blue-800 w-full" onClick={handleSubmit}>
          Fetch Cards
        </Button>
        <Button
          className="bg-red-700 hover:bg-red-700 w-full"
          onClick={handleClear}
        >
          Clear Cards
        </Button>
        <Label className="block text-gray-700 dark:text-gray-300">Tips:</Label>
        <Label className="block text-gray-700 dark:text-gray-300">
          To change a card art - click it
        </Label>
        <Label className="block text-gray-700 dark:text-gray-300">
          To move a card - drag from the box at the top right
        </Label>
        <Label className="block text-gray-700 dark:text-gray-300">
          To duplicate or delete a card - right click it
        </Label>
        <Button
          className="bg-purple-700 w-full mt-[2rem]"
          onClick={addCardBackPage}
        >
          Add Card Backs
        </Button>
      </div>
    </div>
  );
}
