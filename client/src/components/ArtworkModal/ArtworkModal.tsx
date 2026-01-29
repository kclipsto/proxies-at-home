import { changeCardArtwork, createLinkedBackCard } from "@/helpers/dbUtils";
import { parseImageIdFromUrl } from "@/helpers/imageHelper";
import {
  getMpcAutofillImageUrl,
  type MpcAutofillCard,
} from "@/helpers/mpcAutofillApi";
import {
  getImageSourceSync,
  isMpcSource,
  isCustomSource,
} from "@/helpers/imageSourceUtils";
import {
  getFaceNamesFromPrints,
  computeTabLabels,
  getCurrentCardFace,
  filterPrintsByFace,
} from "@/helpers/dfcHelpers";
import { undoableChangeCardback } from "@/helpers/undoableActions";
import { ArtworkBleedSettings } from "../CardEditorModal/ArtworkBleedSettings";
import { ResponsiveModal, ArtSourceToggle, TabBar } from "../common";
import { ArtworkTabContent } from "./ArtworkTabContent";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, Checkbox, Label } from "flowbite-react";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useArtworkModalStore } from "@/store/artworkModal";
import type { ScryfallCard, CardOption } from "../../../../shared/types";
import {
  ArrowLeft,
  X,
  Image,
  Settings,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Check,
} from "lucide-react";
import {
  fetchCardWithPrints,
  fetchCardBySetAndNumber,
} from "@/helpers/scryfallApi";
import { db } from "@/db";
import { AdvancedSearch } from "./AdvancedSearch";
import {
  getAllCardbacks,
  isCardbackId,
  type CardbackOption,
} from "@/helpers/cardbackLibrary";
import { useSettingsStore } from "@/store/settings";
import { useProjectStore } from "@/store";
import { useSelectionStore } from "@/store/selection";
import { useToastStore } from "@/store/toast";
import { useZoomShortcuts } from "@/hooks/useZoomShortcuts";
import { ImportOrchestrator } from "@/helpers/ImportOrchestrator";
import type { ImportIntent } from "@/helpers/importParsers";
import { handleAutoImportTokens } from "@/helpers/tokenImportHelper";
import { debugLog } from "@/helpers/debug";

export function ArtworkModal() {
  const [isSearching, setIsSearching] = useState(false);
  const [applyToAll, setApplyToAll] = useState(false);
  const [previewCardData, setPreviewCardData] = useState<ScryfallCard | null>(
    null
  );
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedFace, setSelectedFace] = useState<"front" | "back">(
    () => useArtworkModalStore.getState().initialFace
  );
  const [activeTab, setActiveTab] = useState<"artwork" | "settings">(
    () => useArtworkModalStore.getState().initialTab
  );
  const [cardbackOptions, setCardbackOptions] = useState<CardbackOption[]>([]);
  const [showCardbackLibrary, setShowCardbackLibrary] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingDeleteName, setPendingDeleteName] = useState<string>("");
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [artSource, setArtSource] = useState<"scryfall" | "mpc">("scryfall");
  const [mpcFiltersCollapsed, setMpcFiltersCollapsed] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [selectedArtState, setSelectedArtState] = useState<{
    cardUuid: string;
    artId: string;
  } | null>(null);
  const [lastOpenCardUuid, setLastOpenCardUuid] = useState<string | undefined>(
    undefined
  );

  const isModalOpen = useArtworkModalStore((state) => state.open);
  const modalCard = useArtworkModalStore((state) => state.card);
  const modalIndex = useArtworkModalStore((state) => state.index);
  const allCards = useArtworkModalStore((state) => state.allCards);
  const initialTab = useArtworkModalStore((state) => state.initialTab);
  const initialFace = useArtworkModalStore((state) => state.initialFace);
  const initialArtSource = useArtworkModalStore(
    (state) => state.initialArtSource
  );
  const initialOpenAdvancedSearch = useArtworkModalStore(
    (state) => state.initialOpenAdvancedSearch
  );
  const closeModal = useArtworkModalStore((state) => state.closeModal);
  const goToNextCard = useArtworkModalStore((state) => state.goToNextCard);
  const goToPrevCard = useArtworkModalStore((state) => state.goToPrevCard);

  const canGoPrev = modalIndex !== null && allCards.length > 1;
  const canGoNext = modalIndex !== null && allCards.length > 1;

  const defaultCardbackId = useSettingsStore(
    (state) => state.defaultCardbackId
  );
  const setDefaultCardbackId = useSettingsStore(
    (state) => state.setDefaultCardbackId
  );

  if (isModalOpen && modalCard?.uuid !== lastOpenCardUuid) {
    setLastOpenCardUuid(modalCard?.uuid);

    setPreviewCardData(null);
    setApplyToAll(false);
    setIsSearchOpen(initialOpenAdvancedSearch); // Auto-open for failed lookups
    setShowCardbackLibrary(false);
    setActiveTab(initialTab);
    setSelectedFace(initialFace);
    let newSource = useSettingsStore.getState().preferredArtSource;
    if (initialArtSource) {
      newSource = initialArtSource;
    } else if (modalCard?.imageId) {
      const detectedSource = getImageSourceSync(modalCard.imageId);
      if (isMpcSource(detectedSource)) {
        newSource = "mpc";
      } else if (isCustomSource(detectedSource)) {
        newSource = useSettingsStore.getState().preferredArtSource;
      } else {
        newSource = "scryfall";
      }
    }
    setArtSource(newSource);
  }

  useEffect(() => {
    if (!isModalOpen) {
      setLastOpenCardUuid(undefined);
    }
  }, [isModalOpen]);

  const setSelectedArtId = (artId: string) => {
    if (modalCard?.uuid) {
      setSelectedArtState({ cardUuid: modalCard.uuid, artId });
    }
  };
  const setAppliedImageUrl = setSelectedArtId;
  const setAppliedMpcCardId = (mpcId: string) => {
    const url = getMpcAutofillImageUrl(mpcId);
    if (url) setSelectedArtId(url);
  };

  useEffect(() => {
    if (
      isModalOpen &&
      modalCard &&
      !modalCard.imageId &&
      !previewCardData &&
      !isSearching
    ) {
      void handleSearch(modalCard.name, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen, modalCard?.imageId]);
  useEffect(() => {
    if (selectedFace === "back" && isModalOpen) {
      getAllCardbacks().then((options) => {
        setCardbackOptions(options);
      });
    }
  }, [selectedFace, isModalOpen, showCardbackLibrary]);

  // Auto-apply first print when previewCardData changes (from search)
  // This runs AFTER state has updated, avoiding race condition
  useEffect(() => {
    if (previewCardData?.imageUrls?.[0] && activeCard) {
      debugLog(
        "[ArtworkModal] auto-apply: previewCardData changed, applying first print:",
        previewCardData.imageUrls[0]?.substring(0, 80)
      );
      void handleSelectArtwork(previewCardData.imageUrls[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewCardData]);

  const linkedBackCard = useLiveQuery(
    () =>
      modalCard?.linkedBackId
        ? db.cards.get(modalCard.linkedBackId)
        : undefined,
    [modalCard?.linkedBackId]
  );
  const autoMpcSetForBackCardId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (selectedFace === "back" && linkedBackCard?.imageId) {
      if (autoMpcSetForBackCardId.current !== linkedBackCard.imageId) {
        const detectedSource = getImageSourceSync(linkedBackCard.imageId);
        if (isMpcSource(detectedSource)) {
          setArtSource("mpc");
          autoMpcSetForBackCardId.current = linkedBackCard.imageId;
        }
      }
    }
  }, [selectedFace, linkedBackCard?.imageId]);

  const activeCard =
    selectedFace === "back" && linkedBackCard ? linkedBackCard : modalCard;
  const handleSaveName = useCallback(async () => {
    if (!editedName.trim() || !activeCard) return;

    const newName = editedName.trim();
    await db.cards.update(activeCard.uuid, { name: newName });

    if (activeCard.uuid === modalCard?.uuid) {
      const updated = await db.cards.get(activeCard.uuid);
      if (updated) {
        useArtworkModalStore.getState().updateCard(updated);
      }
    }
    setIsEditingName(false);
  }, [editedName, activeCard, modalCard]);

  const imageObject =
    useLiveQuery(async () => {
      if (!activeCard?.imageId) return undefined;
      if (isCardbackId(activeCard.imageId)) {
        return await db.cardbacks.get(activeCard.imageId);
      }
      return await db.images.get(activeCard.imageId);
    }, [activeCard?.imageId]) || null;

  const [processedDisplayUrl, setProcessedDisplayUrl] = useState<string | null>(
    null
  );
  useEffect(() => {
    if (imageObject?.displayBlob) {
      const url = URL.createObjectURL(imageObject.displayBlob);
      setProcessedDisplayUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setProcessedDisplayUrl(null);
    }
  }, [imageObject?.displayBlob]);

  const cardImageId = activeCard?.imageId;
  const selectedArtId =
    selectedArtState && selectedArtState.cardUuid === activeCard?.uuid
      ? selectedArtState.artId
      : null;

  const effectiveArtId = selectedArtId ?? cardImageId;

  const displayData = useMemo(() => {
    return {
      name: previewCardData?.name || activeCard?.name,
      imageUrls:
        previewCardData?.imageUrls ||
        (imageObject && "imageUrls" in imageObject
          ? imageObject.imageUrls
          : undefined),
      prints: previewCardData?.prints,
      id: previewCardData?.imageUrls?.[0] || imageObject?.id,
      selectedArtId: previewCardData?.imageUrls?.[0] || effectiveArtId,
      processedDisplayUrl:
        !previewCardData && effectiveArtId === cardImageId
          ? processedDisplayUrl
          : null,
    };
  }, [
    previewCardData,
    activeCard,
    imageObject,
    effectiveArtId,
    cardImageId,
    processedDisplayUrl,
  ]);

  const faceNames = useMemo(
    () => getFaceNamesFromPrints(displayData.prints),
    [displayData.prints]
  );
  const isDFC = faceNames.length > 1;
  const dfcFrontFaceName = faceNames[0] || null;
  const dfcBackFaceName = faceNames[1] || null;

  const isUsingCardbackLibrary = linkedBackCard?.imageId
    ? isCardbackId(linkedBackCard.imageId)
    : false;
  const showCardbackButton =
    selectedFace === "back" &&
    !isDFC &&
    linkedBackCard &&
    !isUsingCardbackLibrary &&
    !showCardbackLibrary;

  const isCustomUpload = isCustomSource(
    getImageSourceSync(activeCard?.imageId)
  );

  const tabLabels = useMemo(
    () =>
      computeTabLabels(faceNames, modalCard?.name || "", linkedBackCard?.name),
    [faceNames, modalCard?.name, linkedBackCard?.name]
  );

  const hasAutoSelectedFace = useRef(false);

  const currentCardFace = useMemo(
    () =>
      getCurrentCardFace(
        isDFC,
        modalCard?.name || "",
        dfcBackFaceName || undefined
      ),
    [isDFC, dfcBackFaceName, modalCard?.name]
  );

  useEffect(() => {
    if (
      isModalOpen &&
      isDFC &&
      !hasAutoSelectedFace.current &&
      initialFace !== "back"
    ) {
      setSelectedFace(currentCardFace);
      hasAutoSelectedFace.current = true;
    }
  }, [isModalOpen, isDFC, currentCardFace, initialFace]);

  useEffect(() => {
    if (!isModalOpen) {
      hasAutoSelectedFace.current = false;
    }
  }, [isModalOpen]);

  const filteredPrints = useMemo(
    () =>
      filterPrintsByFace(
        displayData.prints,
        selectedFace,
        dfcFrontFaceName || undefined,
        dfcBackFaceName || undefined
      ),
    [displayData.prints, selectedFace, dfcFrontFaceName, dfcBackFaceName]
  );

  const filteredImageUrls = useMemo(() => {
    if (!isDFC) return displayData.imageUrls;
    const printUrls = new Set(filteredPrints?.map((p) => p.imageUrl));
    return displayData.imageUrls?.filter((url) => printUrls.has(url));
  }, [isDFC, displayData.imageUrls, filteredPrints]);

  type ArtApplicationConfig = {
    targetImageId: string;
    cardName?: string;
    needsEnrichment?: boolean;
    hasBuiltInBleed?: boolean;
    cardMetadata?: Parameters<typeof changeCardArtwork>[6];
    previewImageUrls?: string[];
  };

  const applyArtworkToCards = useCallback(
    async (config: ArtApplicationConfig) => {
      const {
        targetImageId,
        cardName,
        needsEnrichment,
        hasBuiltInBleed,
        cardMetadata,
        previewImageUrls,
      } = config;
      const targetCard = activeCard;
      if (!targetCard) return;

      const selectedCards = useSelectionStore.getState().selectedCards;
      const isMultiSelect =
        selectedCards.size > 1 &&
        modalCard &&
        selectedCards.has(modalCard.uuid);

      if (isMultiSelect && selectedFace === "front") {
        const selectedUuids = Array.from(selectedCards);
        const cardsToUpdate = await db.cards.bulkGet(selectedUuids);

        for (const cardToUpdate of cardsToUpdate) {
          if (cardToUpdate && !cardToUpdate.linkedFrontId) {
            await changeCardArtwork(
              cardToUpdate.imageId,
              targetImageId,
              cardToUpdate,
              false,
              cardName,
              previewImageUrls,
              cardMetadata,
              hasBuiltInBleed
            );

            if (needsEnrichment) {
              await db.cards.update(cardToUpdate.uuid, {
                needsEnrichment: true,
              });
            }
          }
        }
        if (modalCard && selectedCards.has(modalCard.uuid)) {
          const updated = await db.cards.get(modalCard.uuid);
          if (updated) useArtworkModalStore.getState().updateCard(updated);
        }
      } else {
        await changeCardArtwork(
          targetCard.imageId,
          targetImageId,
          targetCard,
          applyToAll,
          cardName,
          previewImageUrls,
          cardMetadata,
          hasBuiltInBleed
        );

        if (needsEnrichment) {
          await db.cards.update(targetCard.uuid, { needsEnrichment: true });
        }

        if (selectedFace === "front" || !linkedBackCard) {
          const updated = await db.cards.get(targetCard.uuid);
          if (updated) useArtworkModalStore.getState().updateCard(updated);
        }
      }

      if (modalCard?.uuid) {
        useSelectionStore
          .getState()
          .setFlipped([modalCard.uuid], selectedFace === "back");
      }

      // Check for missing tokens after applying new art/identity
      handleAutoImportTokens({ silent: true });

      // Clear preview state so the modal reflects the updated card
      setPreviewCardData(null);

      const toastId = useToastStore.getState().addToast({
        type: "success",
        message: "Art applied successfully",
        dismissible: false,
      });
      setTimeout(() => useToastStore.getState().removeToast(toastId), 2000);
    },
    [activeCard, modalCard, selectedFace, applyToAll, linkedBackCard]
  );

  async function handleSelectArtwork(
    newImageUrl: string,
    newCardName?: string,
    specificPrint?: { set: string; number: string }
  ) {
    if (!activeCard) return;

    debugLog("[ArtworkModal] handleSelectArtwork:", {
      newImageUrl: newImageUrl?.substring(0, 80),
      newCardName,
      specificPrint,
      activeCardName: activeCard.name,
      previewCardDataName: previewCardData?.name,
      displayDataPrints: displayData.prints?.length,
      artSource,
    });

    setAppliedImageUrl(newImageUrl);

    const isReplacing = !!previewCardData;
    const newImageId = parseImageIdFromUrl(newImageUrl);

    const selectedPrint = displayData.prints?.find(
      (p) => p.imageUrl === newImageUrl
    );

    const newFaceName = selectedPrint?.faceName;
    // If we have an explicit newCardName (from search selection), use it.
    // Otherwise fallback to faceName or activeCard.name logic.
    const shouldUpdateName =
      (!!newCardName && newCardName !== activeCard.name) ||
      (isDFC && newFaceName && newFaceName !== activeCard.name);

    let intent: ImportIntent;

    if (specificPrint) {
      // Priority 1: Specific print from search result (includes set/number)
      intent = {
        name: newCardName || activeCard.name,
        set: specificPrint.set,
        number: specificPrint.number,
        quantity: 1,
        isToken: activeCard.isToken || false,
      };
    } else if (selectedPrint) {
      // Priority 2: Selected print from "Prints" tab
      intent = {
        name: activeCard.name,
        set: selectedPrint.set,
        number: selectedPrint.number,
        quantity: 1,
        isToken: activeCard.isToken || false,
      };
    } else if (previewCardData) {
      // Priority 3: Preview data (fallback)
      intent = {
        name: previewCardData.name,
        set: previewCardData.set,
        number: previewCardData.number,
        quantity: 1,
        isToken: activeCard.isToken || false,
      };
    } else {
      intent = {
        name: activeCard.name,
        quantity: 1,
        isToken: activeCard.isToken || false,
      };
    }

    try {
      const projectId =
        activeCard.projectId || useProjectStore.getState().currentProjectId!;
      const { cardsToAdd, backCardTasks } = await ImportOrchestrator.resolve(
        intent,
        projectId
      );
      const resolved = cardsToAdd[0];

      if (resolved) {
        const cardMetadata: Parameters<typeof changeCardArtwork>[6] = {
          set: resolved.set,
          number: resolved.number,
          rarity: resolved.rarity,
          lang: resolved.lang,
          colors: resolved.colors,
          cmc: resolved.cmc,
          type_line: resolved.type_line,
          mana_cost: resolved.mana_cost,
          token_parts: resolved.token_parts,
          needs_token: resolved.needs_token,
          isToken: resolved.isToken,
        };

        const newName =
          newCardName || (shouldUpdateName ? newFaceName : resolved.name);

        await applyArtworkToCards({
          targetImageId: newImageId,
          cardName: newName,
          cardMetadata,
          previewImageUrls:
            isReplacing && resolved.imageId ? [resolved.imageId] : undefined,
        });

        // Handle DFC back face linking
        if (
          backCardTasks &&
          backCardTasks.length > 0 &&
          selectedFace === "front" &&
          modalCard
        ) {
          const backTask = backCardTasks[0];

          if (modalCard.linkedBackId) {
            // Update existing back card's image and name
            await db.cards.update(modalCard.linkedBackId, {
              imageId: backTask.backImageId,
              name: backTask.backName,
              hasBuiltInBleed:
                (backTask as { hasBleed?: boolean }).hasBleed ?? false,
              usesDefaultCardback: false,
            });
          } else {
            // Create new linked back card
            await createLinkedBackCard(
              modalCard.uuid,
              backTask.backImageId,
              backTask.backName,
              {
                hasBuiltInBleed:
                  (backTask as { hasBleed?: boolean }).hasBleed ?? false,
              }
            );
          }
        }
      }
    } catch (e) {
      console.error("Failed to resolve artwork selection:", e);
    }
  }

  /**
   * Handle MPC Autofill art selection
   * Uses ImportOrchestrator to resolve details/enrichment needs
   */
  async function handleSelectMpcArt(card: MpcAutofillCard) {
    debugLog("[ArtworkModal] handleSelectMpcArt:", {
      cardIdentifier: card.identifier,
      cardName: card.name,
      activeCardName: activeCard?.name,
      activeCardUuid: activeCard?.uuid,
    });

    if (!activeCard) {
      debugLog(
        "[ArtworkModal] handleSelectMpcArt: no activeCard, returning early"
      );
      return;
    }

    setAppliedMpcCardId(card.identifier);

    const intent: ImportIntent = {
      name: card.name, // Use the NEW card name from search, not activeCard.name
      mpcId: card.identifier,
      sourcePreference: "mpc",
      quantity: 1,
      isToken: activeCard.isToken || false,
    };

    debugLog("[ArtworkModal] handleSelectMpcArt intent:", intent);

    try {
      const projectId =
        activeCard.projectId || useProjectStore.getState().currentProjectId!;
      const { cardsToAdd, backCardTasks } = await ImportOrchestrator.resolve(
        intent,
        projectId
      );
      const resolved = cardsToAdd[0];

      debugLog("[ArtworkModal] handleSelectMpcArt resolved:", {
        resolvedName: resolved?.name,
        resolvedImageId: resolved?.imageId,
        cardsToAddLength: cardsToAdd.length,
        backCardTasksLength: backCardTasks?.length,
      });

      if (resolved && resolved.imageId) {
        await applyArtworkToCards({
          targetImageId: resolved.imageId,
          cardName: resolved.name,
          hasBuiltInBleed: resolved.hasBuiltInBleed,
          needsEnrichment: resolved.needsEnrichment,
          cardMetadata: {
            isToken: resolved.isToken,
            token_parts: resolved.token_parts,
            needs_token: resolved.needs_token,
            set: resolved.set,
            number: resolved.number,
            rarity: resolved.rarity,
            lang: resolved.lang,
            colors: resolved.colors,
            cmc: resolved.cmc,
            type_line: resolved.type_line,
            mana_cost: resolved.mana_cost,
          },
        });

        // Handle DFC back face linking
        if (
          backCardTasks &&
          backCardTasks.length > 0 &&
          selectedFace === "front" &&
          modalCard
        ) {
          const backTask = backCardTasks[0];

          if (modalCard.linkedBackId) {
            // Update existing back card's image and name
            await db.cards.update(modalCard.linkedBackId, {
              imageId: backTask.backImageId,
              name: backTask.backName,
              hasBuiltInBleed:
                (backTask as { hasBleed?: boolean }).hasBleed ?? false,
              usesDefaultCardback: false,
            });
          } else {
            // Create new linked back card
            await createLinkedBackCard(
              modalCard.uuid,
              backTask.backImageId,
              backTask.backName,
              {
                hasBuiltInBleed:
                  (backTask as { hasBleed?: boolean }).hasBleed ?? false,
              }
            );
          }
        }

        debugLog(
          "[ArtworkModal] handleSelectMpcArt: applyArtworkToCards completed"
        );
      } else {
        debugLog(
          "[ArtworkModal] handleSelectMpcArt: no resolved card or imageId"
        );
      }
    } catch (e) {
      debugLog("Failed to resolve MPC selection:", e);
    }
  }

  async function handleSearch(
    name: string,
    exact: boolean = false,
    specificPrint?: { set: string; number: string }
  ) {
    if (!name && !specificPrint) return;

    debugLog("[ArtworkModal] handleSearch:", {
      name,
      exact,
      specificPrint,
      artSource,
    });

    setIsSearching(true);
    try {
      let cardWithPrints: ScryfallCard | null = null;
      if (specificPrint) {
        cardWithPrints = await fetchCardBySetAndNumber(
          specificPrint.set,
          specificPrint.number
        );
      } else {
        cardWithPrints = await fetchCardWithPrints(name, exact, true);
      }

      debugLog("[ArtworkModal] handleSearch result:", {
        name: cardWithPrints?.name,
        imageUrlsCount: cardWithPrints?.imageUrls?.length,
        printsCount: cardWithPrints?.prints?.length,
        firstImageUrl: cardWithPrints?.imageUrls?.[0]?.substring(0, 80),
      });

      if (cardWithPrints) {
        setPreviewCardData(cardWithPrints);
        // Note: Don't auto-apply here - state race condition causes displayData to be stale
        // User will select a print from the modal, or we need to apply via a separate mechanism
      } else {
        debugLog("No cards found for query:", name);
      }
    } catch (e) {
      debugLog("Search failed:", e);
    } finally {
      setIsSearching(false);
    }
  }

  /**
   * Handles selecting a cardback. Uses undoableChangeCardback for undo/redo.
   */
  async function handleSelectCardback(
    cardbackId: string,
    cardbackName: string
  ) {
    if (!modalCard) return;
    const cardback = cardbackOptions.find((cb) => cb.id === cardbackId);
    const hasBleed = cardback?.hasBuiltInBleed ?? true;

    const selectedCards = useSelectionStore.getState().selectedCards;
    const isMultiSelect =
      selectedCards.size > 1 && selectedCards.has(modalCard.uuid);
    let frontCardUuids: string[];

    if (applyToAll) {
      const allFrontCards = await db.cards
        .filter((c) => !c.linkedFrontId)
        .toArray();
      frontCardUuids = allFrontCards.map((c) => c.uuid);
    } else if (isMultiSelect) {
      const selectedUuids = Array.from(selectedCards);
      const cardsToUpdate = await db.cards.bulkGet(selectedUuids);
      frontCardUuids = cardsToUpdate
        .filter((c): c is CardOption => c !== undefined && !c.linkedFrontId)
        .map((c) => c.uuid);
    } else {
      frontCardUuids = [modalCard.uuid];
    }
    await undoableChangeCardback(
      frontCardUuids,
      cardbackId,
      cardbackName,
      hasBleed
    );

    if (modalCard?.uuid) {
      useSelectionStore
        .getState()
        .setFlipped([modalCard.uuid], selectedFace === "back");
    }

    closeModal();
  }

  /**
   * Sets a cardback as default and updates all existing cards to use it.
   */
  async function handleSetAsDefaultCardback(
    cardbackId: string,
    cardbackName: string
  ) {
    const oldDefaultCardbackId = defaultCardbackId;
    setDefaultCardbackId(cardbackId);

    const cardback = cardbackOptions.find((cb) => cb.id === cardbackId);
    const hasBleed = cardback?.hasBuiltInBleed ?? false;

    const frontCardsWithoutBacks = await db.cards
      .filter((c) => !c.linkedFrontId && !c.linkedBackId)
      .toArray();

    for (const frontCard of frontCardsWithoutBacks) {
      await createLinkedBackCard(frontCard.uuid, cardbackId, cardbackName, {
        hasBuiltInBleed: hasBleed,
        usesDefaultCardback: true,
      });
    }

    if (oldDefaultCardbackId !== cardbackId) {
      const linkedBackCardsUsingDefault = await db.cards
        .filter((c) => !!c.linkedFrontId && c.usesDefaultCardback === true)
        .toArray();

      for (const backCard of linkedBackCardsUsingDefault) {
        await changeCardArtwork(
          backCard.imageId,
          cardbackId,
          backCard,
          false, // don't apply to all
          cardbackName,
          undefined,
          undefined,
          hasBleed
        );
      }
    }

    closeModal();
  }

  /**
   * Called by CardbackLibrary when user requests to delete a cardback.
   * Opens confirmation dialog.
   */
  function handleRequestDelete(cardbackId: string, cardbackName: string) {
    setPendingDeleteId(cardbackId);
    setPendingDeleteName(cardbackName);
  }

  /**
   * Executes the actual cardback deletion.
   */
  async function handleExecuteDelete(cardbackId: string) {
    // Check if we're deleting the current default
    const isDeletingDefault = cardbackId === defaultCardbackId;

    // Determine the new default: first builtin if deleting current default
    const fallbackDefault =
      cardbackOptions.find(
        (cb) => cb.id !== cardbackId && cb.source === "builtin"
      ) || cardbackOptions.find((cb) => cb.id !== cardbackId);

    if (isDeletingDefault && fallbackDefault) {
      // Set new default cardback
      await handleSetAsDefaultCardback(
        fallbackDefault.id,
        fallbackDefault.name
      );
    }

    // The cardback to reassign cards to
    const newCardback = isDeletingDefault
      ? fallbackDefault
      : cardbackOptions.find((cb) => cb.id === defaultCardbackId);

    if (newCardback) {
      // Find all cards (back cards) that use this cardback image
      const cardsUsingCardback = await db.cards
        .filter(
          (card) =>
            card.imageId === cardbackId && card.linkedFrontId !== undefined
        )
        .toArray();

      if (cardsUsingCardback.length > 0) {
        // Update all affected back cards to use the new cardback
        await Promise.all(
          cardsUsingCardback.map(async (backCard) => {
            await db.cards.update(backCard.uuid, {
              imageId: newCardback.id,
              name: newCardback.name,
              usesDefaultCardback: true,
              needsEnrichment: false,
              hasBuiltInBleed: newCardback.hasBuiltInBleed,
            });
          })
        );
      }
    }

    // Delete from cardbacks table
    await db.cardbacks.delete(cardbackId);

    // Refresh cardback options
    getAllCardbacks().then(setCardbackOptions);
  }

  /**
   * Confirms the delete after user interaction.
   */
  async function confirmDelete() {
    if (!pendingDeleteId) return;

    // Save "don't show again" preference
    if (dontShowAgain) {
      localStorage.setItem("cardback-delete-confirm-disabled", "true");
    }

    await handleExecuteDelete(pendingDeleteId);
    setPendingDeleteId(null);
    setDontShowAgain(false);
  }

  function cancelDelete() {
    setPendingDeleteId(null);
    setDontShowAgain(false);
  }

  const contentRef = useRef<HTMLDivElement>(null);

  const [zoomLevel, setZoomLevel] = useState(1);

  useZoomShortcuts({
    setZoom: setZoomLevel,
    isOpen: isModalOpen && activeTab === "artwork",
    minZoom: 0.5,
    maxZoom: 3,
  });
  const gridRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoomLevel);
  useEffect(() => {
    zoomRef.current = zoomLevel;
  }, [zoomLevel]);

  useEffect(() => {
    const container = gridRef.current;
    if (!container) return;

    let initialDistance = 0;
    let initialZoom = 1;

    const getDistance = (touches: TouchList) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.stopPropagation();
        initialDistance = getDistance(e.touches);
        initialZoom = zoomRef.current;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault(); // Prevent default browser zoom
        e.stopPropagation();
        const currentDistance = getDistance(e.touches);
        if (initialDistance > 0) {
          const scale = currentDistance / initialDistance;
          const newZoom = Math.min(Math.max(0.5, initialZoom * scale), 3);
          setZoomLevel(newZoom);
        }
      }
    };

    container.addEventListener("touchstart", handleTouchStart, {
      passive: false,
      capture: true,
    });
    container.addEventListener("touchmove", handleTouchMove, {
      passive: false,
      capture: true,
    });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart, {
        capture: true,
      });
      container.removeEventListener("touchmove", handleTouchMove, {
        capture: true,
      });
    };
  }, []);

  const handleGoToNextCard = useCallback(() => {
    goToNextCard();
  }, [goToNextCard]);

  const handleGoToPrevCard = useCallback(() => {
    goToPrevCard();
  }, [goToPrevCard]);

  useEffect(() => {
    if (!isModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;

      if (e.key === "ArrowLeft" && canGoPrev) {
        e.preventDefault();
        handleGoToPrevCard();
      } else if (e.key === "ArrowRight" && canGoNext) {
        e.preventDefault();
        handleGoToNextCard();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    isModalOpen,
    canGoPrev,
    canGoNext,
    handleGoToPrevCard,
    handleGoToNextCard,
  ]);

  return (
    <>
      {/* Navigation arrows - positioned on sides of screen outside modal */}
      {isModalOpen && (
        <>
          {canGoPrev && (
            <button
              onClick={handleGoToPrevCard}
              className="fixed left-2 top-1/2 -translate-y-1/2 z-100001 p-3 rounded-full bg-black/30 hover:bg-black/70 text-white/60 hover:text-white transition-all duration-200"
              title="Previous card (Ctrl+←)"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}
          {canGoNext && (
            <button
              onClick={handleGoToNextCard}
              className="fixed right-2 top-1/2 -translate-y-1/2 z-100001 p-3 rounded-full bg-black/30 hover:bg-black/70 text-white/60 hover:text-white transition-all duration-200"
              title="Next card (Ctrl+→)"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}
        </>
      )}
      <ResponsiveModal
        isOpen={isModalOpen}
        onClose={pendingDeleteId ? () => {} : closeModal}
        mobileLandscapeSidebar
        header={
          <div className="landscape-sidebar-header border-b border-gray-200 dark:border-gray-600 max-lg:portrait:hidden">
            <button
              onClick={closeModal}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors lg:order-last"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="landscape-sidebar-row">
              {(previewCardData || showCardbackLibrary) && (
                <Button
                  size="sm"
                  onClick={() =>
                    previewCardData
                      ? setPreviewCardData(null)
                      : setShowCardbackLibrary(false)
                  }
                  className="max-lg:landscape:w-full"
                >
                  <ArrowLeft className="size-5" />
                </Button>
              )}
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white hidden lg:flex items-center gap-2">
                {showCardbackLibrary ? (
                  "Choose Cardback"
                ) : isEditingName ? (
                  <>
                    <span>Select Artwork for</span>
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSaveName();
                        } else if (e.key === "Escape") {
                          setIsEditingName(false);
                        }
                      }}
                      className="px-2 py-1 text-lg font-semibold border rounded bg-white dark:bg-gray-800 dark:border-gray-600"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveName}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                      title="Save name"
                    >
                      <Check className="w-4 h-4 text-green-600" />
                    </button>
                  </>
                ) : (
                  <>
                    {`Select Artwork for ${displayData.name}`}
                    {isCustomUpload && (
                      <button
                        onClick={() => {
                          setEditedName(displayData.name || "");
                          setIsEditingName(true);
                        }}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                        title="Edit card name"
                      >
                        <Pencil className="w-4 h-4 text-gray-500" />
                      </button>
                    )}
                    {modalIndex !== null && allCards.length > 1 && (
                      <span className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 whitespace-nowrap text-xs flex items-center overflow-hidden">
                        <span className="h-full flex items-center px-2 text-gray-900 dark:text-white">
                          {modalIndex + 1}
                        </span>
                        <span className="w-px h-full bg-gray-300 dark:bg-gray-500" />
                        <span className="h-full flex items-center px-2 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-600">
                          {allCards.length}
                        </span>
                      </span>
                    )}
                  </>
                )}
              </h3>
            </div>
            <div className="landscape-spacer" />

            {activeTab === "artwork" && !showCardbackLibrary && (
              <div className="hidden max-lg:landscape:block">
                <ArtSourceToggle
                  value={artSource}
                  onChange={setArtSource}
                  vertical
                  reversed
                />
              </div>
            )}
          </div>
        }
      >
        <div
          ref={contentRef}
          className="flex-1 flex flex-col overflow-hidden max-lg:landscape:overflow-auto min-h-0"
        >
          {!showCardbackLibrary && (
            <div className="hidden lg:block max-lg:portrait:block">
              <div className="flex items-start justify-between">
                <div className="flex-1 overflow-hidden">
                  <TabBar
                    tabs={[
                      { id: "front" as const, label: tabLabels.front },
                      { id: "back" as const, label: tabLabels.back },
                    ]}
                    activeTab={selectedFace}
                    onTabChange={setSelectedFace}
                    variant="primary"
                  />
                </div>
                <div className="lg:hidden p-2">
                  <button
                    onClick={closeModal}
                    className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors max-lg:landscape:order-first"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <TabBar
                tabs={[
                  {
                    id: "artwork" as const,
                    label: "Artwork",
                    icon: <Image className="w-5 h-5" />,
                  },
                  {
                    id: "settings" as const,
                    label: "Settings",
                    icon: <Settings className="w-5 h-5" />,
                  },
                  ...(showCardbackButton
                    ? [
                        {
                          id: "cardback" as const,
                          label: "Use Cardback",
                          icon: (
                            <svg
                              className="h-5 w-4"
                              viewBox="0 0 50 70"
                              fill="none"
                            >
                              <rect
                                x="0"
                                y="0"
                                width="50"
                                height="70"
                                rx="4"
                                fill="#1a1a1a"
                              />
                              <rect
                                x="3"
                                y="3"
                                width="44"
                                height="64"
                                rx="2"
                                fill="#8B6914"
                              />
                              <ellipse
                                cx="25"
                                cy="35"
                                rx="17"
                                ry="24"
                                fill="#4A5899"
                              />
                              <ellipse
                                cx="25"
                                cy="35"
                                rx="14"
                                ry="20"
                                fill="#C4956A"
                              />
                            </svg>
                          ),
                        },
                      ]
                    : []),
                ]}
                activeTab={activeTab}
                onTabChange={(tab) => {
                  if (tab === "cardback") {
                    setShowCardbackLibrary(true);
                  } else {
                    setActiveTab(tab as "artwork" | "settings");
                  }
                }}
                variant="secondary"
              />
            </div>
          )}

          {activeTab === "artwork" && (
            <ArtworkTabContent
              modalCard={modalCard}
              linkedBackCard={linkedBackCard}
              selectedFace={selectedFace}
              isDFC={isDFC}
              previewCardData={previewCardData}
              showCardbackLibrary={showCardbackLibrary}
              setShowCardbackLibrary={setShowCardbackLibrary}
              applyToAll={applyToAll}
              setApplyToAll={setApplyToAll}
              tabLabels={tabLabels}
              cardbackOptions={cardbackOptions}
              setCardbackOptions={setCardbackOptions}
              defaultCardbackId={defaultCardbackId}
              filteredImageUrls={filteredImageUrls}
              displayData={displayData}
              zoomLevel={zoomLevel}
              onOpenSearch={() => setIsSearchOpen(true)}
              onSelectCardback={handleSelectCardback}
              onSetAsDefaultCardback={handleSetAsDefaultCardback}
              onSelectArtwork={handleSelectArtwork}
              onSelectMpcArt={handleSelectMpcArt}
              onClose={closeModal}
              onRequestDelete={handleRequestDelete}
              onExecuteDelete={handleExecuteDelete}
              artSource={artSource}
              setArtSource={setArtSource}
              mpcFiltersCollapsed={mpcFiltersCollapsed}
              onMpcFiltersCollapsedChange={setMpcFiltersCollapsed}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              setSelectedFace={setSelectedFace}
              setZoomLevel={setZoomLevel}
            />
          )}

          {/* Settings Tab Content */}
          {activeTab === "settings" && modalCard && (
            <div className="flex flex-col flex-1 min-h-0 rounded-b-2xl overflow-hidden">
              <ArtworkBleedSettings selectedFace={selectedFace} />
            </div>
          )}
        </div>
      </ResponsiveModal>
      <AdvancedSearch
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectCard={(name, mpcImageUrl, specificPrint) => {
          debugLog("[ArtworkModal] onSelectCard:", {
            name,
            mpcImageUrl: mpcImageUrl?.substring(0, 80),
            specificPrint,
            currentArtSource: artSource,
          });
          if (mpcImageUrl) {
            // MPC path: apply MPC art directly
            debugLog(
              "[ArtworkModal] onSelectCard: MPC path - calling handleSelectMpcArt"
            );
            const identifier = mpcImageUrl.split("id=")[1] || "";
            handleSelectMpcArt({
              identifier,
              name,
              smallThumbnailUrl: "",
              mediumThumbnailUrl: "",
              dpi: 0,
              tags: [],
              sourceName: "",
              source: "",
              extension: "",
              size: 0,
            });
          } else {
            // Scryfall path: fetch card data and update modal preview
            debugLog(
              "[ArtworkModal] onSelectCard: Scryfall path - calling handleSearch"
            );
            handleSearch(name, true, specificPrint);
          }
        }}
        initialSource={artSource}
      />
      {pendingDeleteId &&
        createPortal(
          <div
            className="fixed inset-0 z-[20000] bg-gray-900/50 flex items-center justify-center"
            onClick={(e) => {
              e.stopPropagation();
              if (e.target === e.currentTarget) {
                cancelDelete();
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              className="bg-white dark:bg-gray-800 p-6 rounded shadow-md w-96 text-center"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="mb-4 text-lg font-semibold text-gray-800 dark:text-white">
                Delete Cardback?
              </div>
              <div className="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">
                Are you sure you want to delete "{pendingDeleteName}"?
                {pendingDeleteId === defaultCardbackId && (
                  <span className="block mt-2 font-medium text-amber-600 dark:text-amber-400">
                    This is your default cardback. A new default will be
                    assigned.
                  </span>
                )}
              </div>
              <div className="flex items-center justify-center gap-2 mb-5">
                <Checkbox
                  id="dont-show-again"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                />
                <Label
                  htmlFor="dont-show-again"
                  className="text-sm text-gray-500 dark:text-gray-400"
                >
                  Don't show this again
                </Label>
              </div>
              <div className="flex justify-center gap-4">
                <Button
                  color="failure"
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={confirmDelete}
                >
                  Yes, delete
                </Button>
                <Button color="gray" onClick={cancelDelete}>
                  No, cancel
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
