import { changeCardArtwork, createLinkedBackCard } from "@/helpers/dbUtils";
import { parseImageIdFromUrl } from "@/helpers/imageHelper";
import { getMpcAutofillImageUrl, type MpcAutofillCard } from "@/helpers/mpcAutofillApi";
import { getImageSourceSync, isMpcSource } from "@/helpers/imageSourceUtils";
import { parseMpcCardLogic } from "@/helpers/mpcImportIntegration";
import { getFaceNamesFromPrints, computeTabLabels, getCurrentCardFace, filterPrintsByFace } from "@/helpers/dfcHelpers";
import { undoableChangeCardback } from "@/helpers/undoableActions";
import { ArtworkBleedSettings } from '../CardEditorModal/ArtworkBleedSettings';
import { ResponsiveModal, ArtSourceToggle, TabBar } from "../common";
import { ArtworkTabContent } from "./ArtworkTabContent";
import { useLiveQuery } from "dexie-react-hooks";
import {
    Button,
    Checkbox,
    Label,
} from "flowbite-react";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useArtworkModalStore } from "@/store/artworkModal";
import type { ScryfallCard, CardOption } from "../../../../shared/types";
import { ArrowLeft, X, Image, Settings, ChevronLeft, ChevronRight } from "lucide-react";
import { fetchCardWithPrints, fetchCardBySetAndNumber } from "@/helpers/scryfallApi";
import { db } from "@/db";
import { AdvancedSearch } from "./AdvancedSearch";
import { getAllCardbacks, isCardbackId, type CardbackOption } from "@/helpers/cardbackLibrary";
import { useSettingsStore } from "@/store/settings";
import { useSelectionStore } from "@/store/selection";
import { useToastStore } from "@/store/toast";
import { useZoomShortcuts } from "@/hooks/useZoomShortcuts";


export function ArtworkModal() {
    const [isSearching, setIsSearching] = useState(false);
    const [applyToAll, setApplyToAll] = useState(false);
    const [previewCardData, setPreviewCardData] = useState<ScryfallCard | null>(null);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [selectedFace, setSelectedFace] = useState<'front' | 'back'>(() => useArtworkModalStore.getState().initialFace);
    const [activeTab, setActiveTab] = useState<'artwork' | 'settings'>(() => useArtworkModalStore.getState().initialTab);
    const [cardbackOptions, setCardbackOptions] = useState<CardbackOption[]>([]);
    const [showCardbackLibrary, setShowCardbackLibrary] = useState(false);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [pendingDeleteName, setPendingDeleteName] = useState<string>("");
    const [dontShowAgain, setDontShowAgain] = useState(false);
    const [artSource, setArtSource] = useState<'scryfall' | 'mpc'>('scryfall');
    const [mpcFiltersCollapsed, setMpcFiltersCollapsed] = useState(true);

    // User's art selection (reset on card change) - single source of truth
    // This is the URL/ID of the currently selected art (either Scryfall URL or MPC proxied URL)
    const [selectedArtId, setSelectedArtId] = useState<string | null>(null);
    const [lastOpenCardUuid, setLastOpenCardUuid] = useState<string | undefined>(undefined);

    const isModalOpen = useArtworkModalStore((state) => state.open);
    const modalCard = useArtworkModalStore((state) => state.card);
    const modalIndex = useArtworkModalStore((state) => state.index);
    const allCards = useArtworkModalStore((state) => state.allCards);
    const initialTab = useArtworkModalStore((state) => state.initialTab);
    const initialFace = useArtworkModalStore((state) => state.initialFace);
    const initialArtSource = useArtworkModalStore((state) => state.initialArtSource);
    const closeModal = useArtworkModalStore((state) => state.closeModal);
    const goToNextCard = useArtworkModalStore((state) => state.goToNextCard);
    const goToPrevCard = useArtworkModalStore((state) => state.goToPrevCard);

    // With circular navigation, prev/next are available when there are multiple cards
    const canGoPrev = modalIndex !== null && allCards.length > 1;
    const canGoNext = modalIndex !== null && allCards.length > 1;

    const defaultCardbackId = useSettingsStore((state) => state.defaultCardbackId);
    const setDefaultCardbackId = useSettingsStore((state) => state.setDefaultCardbackId);

    // --- ATOMIC STATE RESET ON NAVIGATION ---
    if (isModalOpen && modalCard?.uuid !== lastOpenCardUuid) {
        setLastOpenCardUuid(modalCard?.uuid);

        // Reset ALL transient states for the new card:
        setPreviewCardData(null);
        setApplyToAll(false);
        setIsSearchOpen(false);
        setShowCardbackLibrary(false);
        setSelectedArtId(null);

        // Re-initialize view preferences
        setActiveTab(initialTab);
        setSelectedFace(initialFace);
        // Determine initial art source from card's imageId
        let newSource = useSettingsStore.getState().preferredArtSource;
        if (initialArtSource) {
            newSource = initialArtSource;
        } else if (modalCard?.imageId) {
            // Use explicit source tracking with fallback to inference
            const detectedSource = getImageSourceSync(modalCard.imageId);
            newSource = isMpcSource(detectedSource) ? 'mpc' : 'scryfall';
        }
        setArtSource(newSource);
    }

    // Reset lastOpenCardUuid when modal closes
    useEffect(() => {
        if (!isModalOpen) {
            setLastOpenCardUuid(undefined);
        }
    }, [isModalOpen]);

    const setAppliedImageUrl = setSelectedArtId;
    const setAppliedMpcCardId = (mpcId: string) => {
        // Convert MPC ID to full URL for consistent storage
        setSelectedArtId(getMpcAutofillImageUrl(mpcId));
    };

    // Auto-search for placeholder cards (no imageId)
    useEffect(() => {
        if (isModalOpen && modalCard && !modalCard.imageId && !previewCardData && !isSearching) {
            void handleSearch(modalCard.name, false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isModalOpen, modalCard?.imageId]);

    // Fetch cardback options when Back tab is selected
    useEffect(() => {
        if (selectedFace === 'back') {
            console.log("[ArtworkModal] 'back' face selected. Fetching cardback options...");
            getAllCardbacks().then(options => {
                console.log(`[ArtworkModal] Fetched ${options.length} cardback options.`);
                setCardbackOptions(options);
            });
        }
        // No cleanup needed - caching is global in cardbackLibrary.ts
    }, [selectedFace]);

    // Fetch linked back card if it exists
    const linkedBackCard = useLiveQuery(
        () => (modalCard?.linkedBackId ? db.cards.get(modalCard.linkedBackId) : undefined),
        [modalCard?.linkedBackId]
    );

    const activeCard = selectedFace === 'back' && linkedBackCard ? linkedBackCard : modalCard;

    // Determine which table to query based on imageId prefix
    const imageObject =
        useLiveQuery(
            async () => {
                if (!activeCard?.imageId) return undefined;
                if (isCardbackId(activeCard.imageId)) {
                    return await db.cardbacks.get(activeCard.imageId);
                }
                return await db.images.get(activeCard.imageId);
            },
            [activeCard?.imageId]
        ) || null;

    const [processedDisplayUrl, setProcessedDisplayUrl] = useState<string | null>(null);
    useEffect(() => {
        if (imageObject?.displayBlob) {
            const url = URL.createObjectURL(imageObject.displayBlob);
            setProcessedDisplayUrl(url);
            return () => URL.revokeObjectURL(url);
        } else {
            setProcessedDisplayUrl(null);
        }
    }, [imageObject?.displayBlob]);

    // SIMPLE: Get the card's image source directly from modalCard.imageId
    const cardImageId = modalCard?.imageId;

    // SIMPLE: The selected art is either user's click or canvas card
    // selectedArtId is a URL (Scryfall or MPC proxied) - single source of truth
    const effectiveArtId = selectedArtId ?? cardImageId;

    const displayData = useMemo(() => {
        return {
            name: previewCardData?.name || activeCard?.name,
            imageUrls: previewCardData?.imageUrls || (imageObject && 'imageUrls' in imageObject ? imageObject.imageUrls : undefined),
            prints: previewCardData?.prints || (imageObject && 'prints' in imageObject ? imageObject.prints : undefined),
            id: previewCardData?.imageUrls?.[0] || imageObject?.id,
            // Single selectedArtId replaces initialScryfallId + selectedId
            selectedArtId: previewCardData?.imageUrls?.[0] || effectiveArtId,
            processedDisplayUrl: (!previewCardData && effectiveArtId === cardImageId) ? processedDisplayUrl : null,
        };
    }, [previewCardData, activeCard, imageObject, effectiveArtId, cardImageId, processedDisplayUrl]);

    const faceNames = useMemo(() => getFaceNamesFromPrints(displayData.prints), [displayData.prints]);
    const isDFC = faceNames.length > 1;
    const dfcFrontFaceName = faceNames[0] || null;
    const dfcBackFaceName = faceNames[1] || null;

    const tabLabels = useMemo(
        () => computeTabLabels(faceNames, modalCard?.name || '', linkedBackCard?.name),
        [faceNames, modalCard?.name, linkedBackCard?.name]
    );

    const hasAutoSelectedFace = useRef(false);

    const currentCardFace = useMemo(
        () => getCurrentCardFace(isDFC, modalCard?.name || '', dfcBackFaceName || undefined),
        [isDFC, dfcBackFaceName, modalCard?.name]
    );

    // Auto-select the correct face tab when modal opens for DFC cards ONLY
    // (Non-DFC cards with linked backs use initialFace from the store, set by PageView)
    // Skip auto-selection if user explicitly opened modal on the back face (initialFace='back')
    useEffect(() => {
        if (isModalOpen && isDFC && !hasAutoSelectedFace.current && initialFace !== 'back') {
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
        () => filterPrintsByFace(displayData.prints, selectedFace, dfcFrontFaceName || undefined, dfcBackFaceName || undefined),
        [displayData.prints, selectedFace, dfcFrontFaceName, dfcBackFaceName]
    );

    const filteredImageUrls = useMemo(() => {
        if (!isDFC) return displayData.imageUrls;
        // Get imageUrls that match the filtered prints
        const printUrls = new Set(filteredPrints?.map(p => p.imageUrl));
        return displayData.imageUrls?.filter(url => printUrls.has(url));
    }, [isDFC, displayData.imageUrls, filteredPrints]);

    type ArtApplicationConfig = {
        targetImageId: string;
        cardName?: string;
        needsEnrichment?: boolean;
        hasBuiltInBleed?: boolean;
        cardMetadata?: Parameters<typeof changeCardArtwork>[6];
        previewImageUrls?: string[];
    };

    const applyArtworkToCards = useCallback(async (config: ArtApplicationConfig) => {
        const { targetImageId, cardName, needsEnrichment, hasBuiltInBleed, cardMetadata, previewImageUrls } = config;
        const targetCard = activeCard;
        if (!targetCard) return;

        const selectedCards = useSelectionStore.getState().selectedCards;
        const isMultiSelect = selectedCards.size > 1 && modalCard && selectedCards.has(modalCard.uuid);

        if (isMultiSelect && selectedFace === 'front') {
            const selectedUuids = Array.from(selectedCards);
            const cardsToUpdate = await db.cards.bulkGet(selectedUuids);

            for (const cardToUpdate of cardsToUpdate) {
                if (cardToUpdate && !cardToUpdate.linkedFrontId) {
                    await changeCardArtwork(
                        cardToUpdate.imageId,
                        targetImageId,
                        cardToUpdate,
                        false, // Don't use applyToAll by name for individual updates in loop
                        cardName,
                        previewImageUrls,
                        cardMetadata,
                        hasBuiltInBleed
                    );

                    if (needsEnrichment) {
                        await db.cards.update(cardToUpdate.uuid, { needsEnrichment: true });
                    }
                }
            }
            // Sync current card if it was part of the update
            if (modalCard && selectedCards.has(modalCard.uuid)) {
                const updated = await db.cards.get(modalCard.uuid);
                if (updated) useArtworkModalStore.getState().updateCard(updated);
            }
        } else {
            // Single card or back face
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

            // Sync store
            const updated = await db.cards.get(targetCard.uuid);
            if (updated) useArtworkModalStore.getState().updateCard(updated);
        }

        // Auto-flip card to show the face that was just edited
        if (modalCard?.uuid) {
            useSelectionStore.getState().setFlipped([modalCard.uuid], selectedFace === 'back');
        }

        // Show success toast
        const toastId = useToastStore.getState().addToast({
            type: 'success',
            message: 'Art applied successfully',
            dismissible: false,
        });
        // Auto-dismiss after 2 seconds
        setTimeout(() => useToastStore.getState().removeToast(toastId), 2000);
    }, [activeCard, modalCard, selectedFace, applyToAll]);

    async function handleSelectArtwork(newImageUrl: string) {
        if (!activeCard) return;

        setAppliedImageUrl(newImageUrl);

        const isReplacing = !!previewCardData;
        const newImageId = parseImageIdFromUrl(newImageUrl);

        // Look up per-print metadata from the selected URL
        const selectedPrint = displayData.prints?.find(p => p.imageUrl === newImageUrl);

        const newFaceName = selectedPrint?.faceName;
        const shouldUpdateName = isDFC && newFaceName && newFaceName !== activeCard.name;

        // Build metadata from print info or from previewCardData (if replacing card entirely)
        let cardMetadata: Parameters<typeof changeCardArtwork>[6];
        if (selectedPrint) {
            cardMetadata = {
                set: selectedPrint.set,
                number: selectedPrint.number,
                rarity: selectedPrint.rarity,
                lang: selectedPrint.lang,
                // Colors, cmc, type_line, mana_cost are the same across all prints, so use from previewCardData if available
                ...(previewCardData ? {
                    colors: previewCardData.colors,
                    cmc: previewCardData.cmc,
                    type_line: previewCardData.type_line,
                    mana_cost: previewCardData.mana_cost,
                } : {}),
            };

        } else if (isReplacing && previewCardData) {
            cardMetadata = {
                set: previewCardData.set,
                number: previewCardData.number,
                colors: previewCardData.colors,
                cmc: previewCardData.cmc,
                type_line: previewCardData.type_line,
                rarity: previewCardData.rarity,
                mana_cost: previewCardData.mana_cost,
                lang: previewCardData.lang,
            };
        }

        const newName = shouldUpdateName ? newFaceName : (isReplacing ? previewCardData?.name : undefined);

        await applyArtworkToCards({
            targetImageId: newImageId,
            cardName: newName,
            cardMetadata,
            previewImageUrls: isReplacing ? previewCardData?.imageUrls : undefined
        });

        // Exit preview mode since we've applied the selection
    }

    /**
     * Handle MPC Autofill art selection
     * Sets needsEnrichment: true to fetch metadata from Scryfall after
     */
    async function handleSelectMpcArt(card: MpcAutofillCard) {
        if (!activeCard) return;

        setAppliedMpcCardId(card.identifier);

        const mpcImageUrl = getMpcAutofillImageUrl(card.identifier);
        if (!mpcImageUrl) return;

        // Parse URL to get bare Drive ID (consistent with MPC XML imports)
        // This ensures image deduplication and ref counting work correctly
        const imageId = parseImageIdFromUrl(mpcImageUrl);

        // Extract base card name from MPC name (e.g., "Forest (Unstable Adam Paquette)" -> "Forest")
        // If the name contains parentheses, take only the part before them
        const { name: cardName, hasBuiltInBleed, needsEnrichment } = parseMpcCardLogic(card, activeCard.name);

        await applyArtworkToCards({
            targetImageId: imageId,
            cardName,
            hasBuiltInBleed,
            needsEnrichment
        });
    }

    async function handleSearch(name: string, exact: boolean = false, specificPrint?: { set: string; number: string }) {
        // Prevent clearing if name is empty but we have a specific print (unlikely, but robust)
        if (!name && !specificPrint) return;

        setIsSearching(true);
        try {
            let cardWithPrints: ScryfallCard | null = null;
            if (specificPrint) {
                cardWithPrints = await fetchCardBySetAndNumber(specificPrint.set, specificPrint.number);
            } else {
                cardWithPrints = await fetchCardWithPrints(name, exact, false);
            }

            if (cardWithPrints) {
                setPreviewCardData(cardWithPrints);
            } else {
                console.warn("No cards found for query:", name);
            }
        } catch (e) {
            console.error("Search failed:", e);
        } finally {
            setIsSearching(false);
        }
    }

    /**
     * Handles selecting a cardback. Uses undoableChangeCardback for undo/redo.
     */
    async function handleSelectCardback(cardbackId: string, cardbackName: string) {
        if (!modalCard) return;
        const cardback = cardbackOptions.find(cb => cb.id === cardbackId);
        const hasBleed = cardback?.hasBuiltInBleed ?? true;

        const selectedCards = useSelectionStore.getState().selectedCards;
        const isMultiSelect = selectedCards.size > 1 && selectedCards.has(modalCard.uuid);
        let frontCardUuids: string[];

        if (applyToAll) {
            // Get all front cards (cards without linkedFrontId)
            const allFrontCards = await db.cards
                .filter(c => !c.linkedFrontId)
                .toArray();
            frontCardUuids = allFrontCards.map(c => c.uuid);
        } else if (isMultiSelect) {
            // Get selected front cards
            const selectedUuids = Array.from(selectedCards);
            const cardsToUpdate = await db.cards.bulkGet(selectedUuids);
            frontCardUuids = cardsToUpdate
                .filter((c): c is CardOption => c !== undefined && !c.linkedFrontId)
                .map(c => c.uuid);
        } else {
            frontCardUuids = [modalCard.uuid];
        }
        await undoableChangeCardback(frontCardUuids, cardbackId, cardbackName, hasBleed);

        // Auto-flip card to show the face that was just edited
        if (modalCard?.uuid) {
            useSelectionStore.getState().setFlipped([modalCard.uuid], selectedFace === 'back');
        }

        closeModal();
    }

    /**
     * Sets a cardback as default and updates all existing cards to use it.
     */
    async function handleSetAsDefaultCardback(cardbackId: string, cardbackName: string) {
        const oldDefaultCardbackId = defaultCardbackId;
        setDefaultCardbackId(cardbackId);

        // 3. Find the new cardback to get its bleed info
        const cardback = cardbackOptions.find(cb => cb.id === cardbackId);
        const hasBleed = cardback?.hasBuiltInBleed ?? false;

        const frontCardsWithoutBacks = await db.cards
            .filter(c => !c.linkedFrontId && !c.linkedBackId)
            .toArray();

        for (const frontCard of frontCardsWithoutBacks) {
            await createLinkedBackCard(frontCard.uuid, cardbackId, cardbackName, {
                hasBuiltInBleed: hasBleed,
                usesDefaultCardback: true,
            });
        }

        if (oldDefaultCardbackId !== cardbackId) {
            const linkedBackCardsUsingDefault = await db.cards
                .filter(c => !!c.linkedFrontId && c.usesDefaultCardback === true)
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
        const fallbackDefault = cardbackOptions.find(cb =>
            cb.id !== cardbackId && cb.source === 'builtin'
        ) || cardbackOptions.find(cb => cb.id !== cardbackId);

        if (isDeletingDefault && fallbackDefault) {
            // Set new default cardback
            await handleSetAsDefaultCardback(fallbackDefault.id, fallbackDefault.name);
        }

        // The cardback to reassign cards to
        const newCardback = isDeletingDefault
            ? fallbackDefault
            : cardbackOptions.find(cb => cb.id === defaultCardbackId);

        if (newCardback) {
            // Find all cards (back cards) that use this cardback image
            const cardsUsingCardback = await db.cards
                .filter(card => card.imageId === cardbackId && card.linkedFrontId !== undefined)
                .toArray();

            if (cardsUsingCardback.length > 0) {
                // Update all affected back cards to use the new cardback
                await Promise.all(cardsUsingCardback.map(async (backCard) => {
                    await db.cards.update(backCard.uuid, {
                        imageId: newCardback.id,
                        name: newCardback.name,
                        usesDefaultCardback: true,
                        needsEnrichment: false,
                        hasBuiltInBleed: newCardback.hasBuiltInBleed,
                    });
                }));
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
    // Note: headerRef removed - no longer needed since we removed the click-outside handler
    // ResponsiveModal handles backdrop clicks correctly

    const [zoomLevel, setZoomLevel] = useState(1);

    useZoomShortcuts({
        setZoom: setZoomLevel,
        isOpen: isModalOpen && activeTab === 'artwork',
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

        container.addEventListener("touchstart", handleTouchStart, { passive: false, capture: true });
        container.addEventListener("touchmove", handleTouchMove, { passive: false, capture: true });

        return () => {
            container.removeEventListener("touchstart", handleTouchStart, { capture: true });
            container.removeEventListener("touchmove", handleTouchMove, { capture: true });
        };
    }, []);

    // Wrapper navigation functions that reset local state atomically with navigation
    // This prevents visible intermediate render states during card transitions
    const handleGoToNextCard = useCallback(() => {
        // Navigate to next card (highlight reset handled by useLayoutEffect)
        goToNextCard();
    }, [goToNextCard]);

    const handleGoToPrevCard = useCallback(() => {
        // Navigate to previous card
        goToPrevCard();
    }, [goToPrevCard]);

    // Keyboard navigation: Ctrl+Left/Right arrows to navigate between cards
    useEffect(() => {
        if (!isModalOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;

            if (e.key === 'ArrowLeft' && canGoPrev) {
                e.preventDefault();
                handleGoToPrevCard();
            } else if (e.key === 'ArrowRight' && canGoNext) {
                e.preventDefault();
                handleGoToNextCard();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isModalOpen, canGoPrev, canGoNext, handleGoToPrevCard, handleGoToNextCard]);

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
                onClose={pendingDeleteId ? () => { } : closeModal}
                mobileLandscapeSidebar
                header={
                    // Header container:
                    // - Hidden on Mobile Portrait (uses inline controls in body)
                    // - Sidebar on Mobile Landscape
                    // - Visible on Desktop
                    <div className="landscape-sidebar-header border-b border-gray-200 dark:border-gray-600 max-lg:portrait:hidden">
                        {/* Close button - Top on mobile landscape, Right on desktop */}
                        <button
                            onClick={closeModal}
                            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors lg:order-last"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        {/* Row 1: Title and back button */}
                        <div className="landscape-sidebar-row">
                            {/* Back button for preview/cardback modes */}
                            {(previewCardData || showCardbackLibrary) && (
                                <Button
                                    size="sm"
                                    onClick={() => previewCardData ? setPreviewCardData(null) : setShowCardbackLibrary(false)}
                                    className="max-lg:landscape:w-full"
                                >
                                    <ArrowLeft className="size-5" />
                                </Button>
                            )}
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white hidden lg:block">
                                {showCardbackLibrary
                                    ? 'Choose Cardback'
                                    : `Select Artwork for ${displayData.name}${(modalIndex !== null && allCards.length > 1)
                                        ? ` (${modalIndex + 1}/${allCards.length})`
                                        : ''
                                    }`
                                }
                            </h3>
                        </div>
                        {/* Spacer push to bottom */}
                        <div className="landscape-spacer" />

                        {/* Source Toggle (Scryfall/MPC) - Mobile landscape sidebar */}
                        {/* Order reversed for vertical mode since sideways-lr reads bottom-to-top */}
                        {activeTab === 'artwork' && !showCardbackLibrary && (
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
                <div ref={contentRef} className="flex-1 flex flex-col overflow-hidden max-lg:landscape:overflow-auto min-h-0">
                    {/* TabBars - Desktop OR Mobile Portrait (hidden only on mobile landscape) */}
                    {!showCardbackLibrary && (
                        <div className="hidden lg:block max-lg:portrait:block">
                            {/* Flex container for TabBar and Close Button (Mobile Portrait) */}
                            <div className="flex items-start justify-between">
                                <div className="flex-1 overflow-x-auto">
                                    <TabBar
                                        tabs={[
                                            { id: 'front' as const, label: tabLabels.front },
                                            { id: 'back' as const, label: tabLabels.back },
                                        ]}
                                        activeTab={selectedFace}
                                        onTabChange={setSelectedFace}
                                        variant="primary"
                                    />
                                </div>
                                {/* Close button - Mobile Portrait only (inline with tabs) */}
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
                                    { id: 'artwork' as const, label: 'Artwork', icon: <Image className="w-5 h-5" /> },
                                    { id: 'settings' as const, label: 'Settings', icon: <Settings className="w-5 h-5" /> },
                                ]}
                                activeTab={activeTab}
                                onTabChange={setActiveTab}
                                variant="secondary"
                            />
                        </div>
                    )}

                    {/* Content area */}
                    {activeTab === 'artwork' && (
                        <ArtworkTabContent
                            key={modalCard?.uuid ?? 'empty'}
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
                    {activeTab === 'settings' && modalCard && (
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
                    if (mpcImageUrl) {
                        // Extract identifier from MPC URL and use handleSelectMpcArt
                        const identifier = mpcImageUrl.split('id=')[1] || '';
                        setArtSource('mpc');
                        handleSelectMpcArt({
                            identifier,
                            name,
                            smallThumbnailUrl: '',
                            mediumThumbnailUrl: '',
                            dpi: 0,
                            tags: [],
                            sourceName: '',
                            source: '',
                            extension: '',
                            size: 0,
                        });
                    } else {
                        setArtSource('scryfall');
                        handleSearch(name, true, specificPrint);
                    }
                }}
                initialSource={artSource}
            />
            {/* Delete Cardback Confirmation Dialog - rendered outside Modal */}
            {pendingDeleteId && (
                <div
                    className="fixed inset-0 z-100 bg-gray-900/50 flex items-center justify-center"
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
                                    This is your default cardback. A new default will be assigned.
                                </span>
                            )}
                        </div>
                        <div className="flex items-center justify-center gap-2 mb-5">
                            <Checkbox
                                id="dont-show-again"
                                checked={dontShowAgain}
                                onChange={(e) => setDontShowAgain(e.target.checked)}
                            />
                            <Label htmlFor="dont-show-again" className="text-sm text-gray-500 dark:text-gray-400">
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
                </div>
            )}
        </>
    );
}
