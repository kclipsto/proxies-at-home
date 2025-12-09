import { changeCardArtwork } from "@/helpers/dbUtils";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Button,
  Checkbox,
  Label,
  Modal,
  ModalBody,
  ModalHeader,
} from "flowbite-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { API_BASE } from "../constants";
import { useArtworkModalStore } from "@/store/artworkModal";
import type { ScryfallCard } from "../../../shared/types";
import { ArrowLeft, ArrowRightLeft } from "lucide-react";
import { fetchCardWithPrints } from "@/helpers/scryfallApi";
import { db } from "../db";
import { AdvancedSearch } from "./AdvancedSearch";
import { Search } from "lucide-react";

export function ArtworkModal() {
  const [isGettingMore, setIsGettingMore] = useState(false);
  const [applyToAll, setApplyToAll] = useState(false);
  const [previewCardData, setPreviewCardData] = useState<ScryfallCard | null>(
    null
  );
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedFace, setSelectedFace] = useState<string | null>(null); // For DFC tabs

  const isModalOpen = useArtworkModalStore((state) => state.open);
  const modalCard = useArtworkModalStore((state) => state.card);
  const closeModal = useArtworkModalStore((state) => state.closeModal);

  // Reset local state when the modal is closed or the underlying card changes
  useEffect(() => {
    if (!isModalOpen) {
      setPreviewCardData(null);
      setApplyToAll(false);
      setIsSearchOpen(false);
      setSelectedFace(null);
    }
  }, [isModalOpen]);

  // Auto-search for placeholder cards (no imageId)
  useEffect(() => {
    if (isModalOpen && modalCard && !modalCard.imageId && !previewCardData && !isGettingMore) {
      void handleSearch(modalCard.name, false);
    }
  }, [isModalOpen, modalCard?.imageId]);

  const imageObject =
    useLiveQuery(
      () => (modalCard?.imageId ? db.images.get(modalCard.imageId) : undefined),
      [modalCard?.imageId]
    ) || null;

  // Create object URL for the processed display blob if available
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

  const displayData = {
    name: previewCardData?.name || modalCard?.name,
    imageUrls: previewCardData?.imageUrls || imageObject?.imageUrls,
    prints: previewCardData?.prints || imageObject?.prints,
    id: previewCardData?.imageUrls?.[0] || imageObject?.id,
    processedDisplayUrl: !previewCardData ? processedDisplayUrl : null,
  };

  // Detect DFC: check if prints have multiple unique face names
  const faceNames = useMemo(() => {
    const names = new Set<string>();
    displayData.prints?.forEach(p => {
      if (p.faceName) names.add(p.faceName);
    });
    return Array.from(names);
  }, [displayData.prints]);

  const isDFC = faceNames.length > 1;

  // Track if we've already auto-selected a face (to avoid resetting on "Get All Prints")
  const hasAutoSelectedFace = useRef(false);

  // Determine which face the current card belongs to based on card name
  const currentCardFace = useMemo(() => {
    if (!isDFC || !modalCard?.name) return null;
    // Check if the card's name matches any face name
    const matchedFace = faceNames.find(
      faceName => faceName.toLowerCase() === modalCard.name.toLowerCase()
    );
    return matchedFace || faceNames[0]; // Default to first face if no match
  }, [isDFC, faceNames, modalCard?.name]);

  // Auto-select the correct face tab when DFC is detected (only once per modal open)
  useEffect(() => {
    if (isDFC && faceNames.length > 0 && !hasAutoSelectedFace.current) {
      // Set to the current card's face, or first face if not determined
      setSelectedFace(currentCardFace || faceNames[0]);
      hasAutoSelectedFace.current = true;
    } else if (!isDFC) {
      setSelectedFace(null);
      hasAutoSelectedFace.current = false;
    }
  }, [isDFC, faceNames, currentCardFace]);

  // Reset hasAutoSelectedFace when modal closes
  useEffect(() => {
    if (!isModalOpen) {
      hasAutoSelectedFace.current = false;
    }
  }, [isModalOpen]);

  // Filter prints/imageUrls by selected face for DFCs
  const filteredPrints = useMemo(() => {
    if (!isDFC || !selectedFace) return displayData.prints;
    return displayData.prints?.filter(p => p.faceName === selectedFace);
  }, [isDFC, selectedFace, displayData.prints]);

  const filteredImageUrls = useMemo(() => {
    if (!isDFC || !selectedFace) return displayData.imageUrls;
    // Get imageUrls that match the filtered prints
    const printUrls = new Set(filteredPrints?.map(p => p.imageUrl));
    return displayData.imageUrls?.filter(url => printUrls.has(url));
  }, [isDFC, selectedFace, displayData.imageUrls, filteredPrints]);

  // Fallback: Auto-fetch prints for legacy images that don't have prints data yet
  // New imports will already have prints stored during the initial fetch
  const shouldAutoFetchPrints = isModalOpen &&
    displayData.name &&
    displayData.id &&
    displayData.imageUrls &&
    displayData.imageUrls.length > 0 &&
    !displayData.prints;

  useEffect(() => {
    if (shouldAutoFetchPrints && !isGettingMore) {
      console.log("[ArtworkModal] Auto-fetching prints (legacy fallback) for:", displayData.name);
      void getMorePrints();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoFetchPrints]);

  async function getMorePrints() {
    if (!displayData.name || !displayData.id) return;
    setIsGettingMore(true);
    console.log("[ArtworkModal] getMorePrints called for:", displayData.name);

    const collectedUrls: string[] = [];
    const collectedPrints: Array<{ imageUrl: string; set: string; number: string; rarity?: string }> = [];

    try {
      const response = await fetch(`${API_BASE}/api/stream/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardQueries: [{ name: displayData.name }],
          cardArt: "prints",
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to fetch prints");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: print-found")) {
            // Next line should be data
            continue;
          }
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6)) as ScryfallCard;
              if (data.imageUrls?.[0]) {
                collectedUrls.push(data.imageUrls[0]);
                collectedPrints.push({
                  imageUrl: data.imageUrls[0],
                  set: data.set || "",
                  number: data.number || "",
                  rarity: data.rarity,
                });

                // Update UI progressively
                if (previewCardData) {
                  setPreviewCardData(prev => prev ? {
                    ...prev,
                    imageUrls: [...collectedUrls],
                    prints: [...collectedPrints],
                  } : null);
                }
              }
            } catch {
              // Skip non-JSON lines
            }
          }
        }
      }

      console.log("[ArtworkModal] getMorePrints complete:", {
        urlsCount: collectedUrls.length,
        printsCount: collectedPrints.length,
      });

      // Final update
      if (previewCardData) {
        setPreviewCardData({ ...previewCardData, imageUrls: collectedUrls, prints: collectedPrints });
      } else {
        await db.images.update(displayData.id, { imageUrls: collectedUrls, prints: collectedPrints });
      }
    } catch (err) {
      console.error("[ArtworkModal] getMorePrints error:", err);
    } finally {
      setIsGettingMore(false);
    }
  }

  async function handleSelectArtwork(newImageUrl: string) {
    if (!modalCard) return;

    const isReplacing = !!previewCardData;
    const newImageId = newImageUrl.includes("scryfall") ? newImageUrl.split("?")[0] : newImageUrl.split("id=")[1];

    // Look up per-print metadata from the selected URL
    const selectedPrint = displayData.prints?.find(p => p.imageUrl === newImageUrl);

    // For DFCs, use the face name if selecting a different face
    const newFaceName = selectedPrint?.faceName;
    const shouldUpdateName = isDFC && newFaceName && newFaceName !== modalCard.name;

    console.log("[ArtworkModal] handleSelectArtwork:", {
      newImageUrl,
      newImageId,
      isReplacing,
      hasPrints: !!displayData.prints,
      printsCount: displayData.prints?.length ?? 0,
      selectedPrint,
      newFaceName,
      shouldUpdateName,
    });

    // Build metadata from print info or from previewCardData (if replacing card entirely)
    let cardMetadata: Parameters<typeof changeCardArtwork>[6];
    if (selectedPrint) {
      // We have per-print metadata - use it for set/number/rarity
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
      console.log("[ArtworkModal] Using selectedPrint metadata:", cardMetadata);
    } else if (isReplacing && previewCardData) {
      // Fallback to previewCardData (searched card without per-print data)
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
      console.log("[ArtworkModal] Using previewCardData metadata:", cardMetadata);
    } else {
      console.log("[ArtworkModal] No metadata available - selectedPrint:", selectedPrint, "isReplacing:", isReplacing);
    }

    // Determine new name: prioritize face name for DFCs, then previewCardData name for replacements
    const newName = shouldUpdateName ? newFaceName : (isReplacing ? previewCardData?.name : undefined);

    await changeCardArtwork(
      modalCard.imageId,
      newImageId,
      modalCard,
      applyToAll,
      newName,
      isReplacing ? previewCardData?.imageUrls : undefined,
      cardMetadata
    );

    closeModal();
  }

  async function handleSearch(name: string, exact: boolean = false) {
    if (!name) return;

    setIsGettingMore(true);
    try {
      const cardWithPrints = await fetchCardWithPrints(name, exact, false);
      if (cardWithPrints) {
        setPreviewCardData(cardWithPrints);
      } else {
        console.warn("No cards found for query:", name);
      }
    } catch (e) {
      console.error("Search failed:", e);
    } finally {
      setIsGettingMore(false);
    }
  }

  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (isModalOpen && contentRef.current) {
        if (!contentRef.current.contains(e.target as Node)) {
          // Only close if AdvancedSearch is NOT open
          // We can't easily check if the click was inside AdvancedSearch portal here,
          // but AdvancedSearch has its own backdrop click handler.
          // However, if we click AdvancedSearch backdrop, this might trigger.
          // Let's rely on AdvancedSearch being a portal with higher Z-index.
          // But wait, if we click outside ArtworkModal content, we want to close ArtworkModal.
          // If AdvancedSearch is open, we probably shouldn't close ArtworkModal.
          if (!isSearchOpen) {
            e.preventDefault();
            e.stopPropagation();
            closeModal();
          }
        }
      }
    };

    if (isModalOpen) {
      window.addEventListener("click", handler, true);
    }

    return () => window.removeEventListener("click", handler, true);
  }, [isModalOpen, closeModal, isSearchOpen]);

  const [zoomLevel, setZoomLevel] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);

  // Handle Pinch-to-Zoom on Grid
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

  return (
    <>
      <Modal show={isModalOpen} onClose={closeModal} size="4xl" dismissible>
        <div ref={contentRef}>
          <ModalHeader>
            {previewCardData && (
              <Button
                size="sm"
                className="mr-2"
                onClick={() => setPreviewCardData(null)}
              >
                <ArrowLeft className="size-5" />
              </Button>
            )}
            Select Artwork for {displayData.name}
          </ModalHeader>
          <ModalBody className="overflow-hidden p-0">
            <div className="flex flex-col h-[70vh]">
              <div className="flex-none bg-white dark:bg-gray-700 p-6 pb-0 z-10">
                <div className="mb-4">
                  <Button
                    color="blue"
                    className="w-full"
                    onClick={() => setIsSearchOpen(true)}
                  >
                    <Search className="mr-2 h-4 w-4" />
                    Search for a different card...
                  </Button>
                </div>
                {modalCard && (
                  <div className="flex items-center gap-2 mb-4">
                    <Checkbox
                      id="apply-to-all"
                      checked={applyToAll}
                      onChange={(e) => setApplyToAll(e.target.checked)}
                      className="size-5"
                    />
                    <Label htmlFor="apply-to-all" className="text-base">
                      Apply to all cards named "{modalCard?.name}"
                    </Label>
                  </div>
                )}

                {/* DFC Face Tabs */}
                {isDFC && faceNames.length > 1 && (
                  <div className="flex gap-2 mb-4">
                    {faceNames.map((faceName) => (
                      <button
                        key={faceName}
                        onClick={() => setSelectedFace(faceName)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedFace === faceName
                          ? "bg-blue-600 text-white"
                          : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
                          }`}
                      >
                        {faceName}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {modalCard && (
                <div
                  className="flex-grow overflow-y-auto p-6 pt-0"
                  style={{ touchAction: "pan-x pan-y" }}
                  ref={gridRef}
                >
                  <div
                    className="grid grid-cols-2 md:grid-cols-3 gap-4"
                    style={{ zoom: zoomLevel }}
                  >
                    {(filteredImageUrls ?? displayData.imageUrls ?? []).map((pngUrl, i) => {
                      const isSelected = displayData.id === pngUrl;
                      // Use processed blob for selected artwork to show bleed/darkening
                      const imageSrc = isSelected && displayData.processedDisplayUrl
                        ? displayData.processedDisplayUrl
                        : pngUrl;
                      return (
                        <img
                          key={i}
                          src={imageSrc}
                          loading="lazy"
                          className={`w-full cursor-pointer border-4 rounded-xl ${isSelected
                            ? "border-green-500"
                            : "border-transparent"
                            }`}
                          onClick={() => handleSelectArtwork(pngUrl)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {modalCard && (
                <div className="flex-none p-6 pt-4 bg-white dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 z-10">
                  <Button
                    className="w-full"
                    color="blue"
                    size="xl"
                    onClick={getMorePrints}
                    disabled={isGettingMore}
                  >
                    {isGettingMore ? "Loading prints..." : "Get All Prints"}
                  </Button>
                </div>
              )}
            </div>
          </ModalBody>
        </div>
      </Modal>
      <AdvancedSearch
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectCard={(name) => handleSearch(name, true)}
        title="Select Card"
        actionIcon={<ArrowRightLeft className="w-6 h-6" />}
      />
    </>
  );
}
