import { changeCardArtwork } from "@/helpers/dbUtils";
import { useLiveQuery } from "dexie-react-hooks";
import axios from "axios";
import {
  Button,
  Checkbox,
  Label,
  Modal,
  ModalBody,
  ModalHeader,
  TextInput,
} from "flowbite-react";
import { useState, useEffect } from "react";
import { API_BASE } from "../constants";
import { db } from "../db";
import { useArtworkModalStore } from "../store";
import type { ScryfallCard } from "../../../shared/types";
import { ArrowLeft } from "lucide-react";

export function ArtworkModal() {
  const [isGettingMore, setIsGettingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [applyToAll, setApplyToAll] = useState(false);
  const [previewCardData, setPreviewCardData] = useState<ScryfallCard | null>(
    null
  );

  const isModalOpen = useArtworkModalStore((state) => state.open);
  const modalCard = useArtworkModalStore((state) => state.card);
  const closeModal = useArtworkModalStore((state) => state.closeModal);

  // Reset local state when the modal is closed or the underlying card changes
  useEffect(() => {
    if (!isModalOpen) {
      setPreviewCardData(null);
      setSearchQuery("");
      setApplyToAll(false);
    }
  }, [isModalOpen]);

  const imageObject =
    useLiveQuery(
      () => (modalCard?.imageId ? db.images.get(modalCard.imageId) : undefined),
      [modalCard?.imageId]
    ) || null;

  const displayData = {
    name: previewCardData?.name || modalCard?.name,
    imageUrls: previewCardData?.imageUrls || imageObject?.imageUrls,
    id: previewCardData?.imageUrls?.[0] || imageObject?.id,
  };

  async function getMorePrints() {
    if (!displayData.name || !displayData.id) return;
    setIsGettingMore(true);
    try {
      const res = await axios.post<ScryfallCard[]>(
        `${API_BASE}/api/cards/images`,
        { cardNames: [displayData.name], cardArt: "prints" }
      );

      const urls = res.data?.[0]?.imageUrls ?? [];
      if (previewCardData) {
        setPreviewCardData({ ...previewCardData, imageUrls: urls });
      } else {
        await db.images.update(displayData.id, { imageUrls: urls });
      }
    } finally {
      setIsGettingMore(false);
    }
  }

  async function handleSelectArtwork(newImageUrl: string) {
    if (!modalCard?.imageId) return;

    const isReplacing = !!previewCardData;
    const newImageId = newImageUrl.includes("scryfall") ? newImageUrl.split("?")[0] : newImageUrl.split("id=")[1];

    await changeCardArtwork(
      modalCard.imageId,
      newImageId,
      modalCard,
      applyToAll,
      isReplacing ? previewCardData.name : undefined
    );

    closeModal();
  }

  async function handleSearch() {
    const name = searchQuery.trim();
    if (!name) return;

    const res = await axios.post<ScryfallCard[]>(
      `${API_BASE}/api/cards/images`,
      { cardNames: [name] }
    );

    const newCardData = res.data?.[0];
    if (newCardData) {
      setPreviewCardData(newCardData);
    }
  }

  return (
    <Modal show={isModalOpen} onClose={closeModal} size="4xl">
      <ModalHeader>
        {previewCardData && (
          <Button
            size="xs"
            className="mr-2"
            onClick={() => setPreviewCardData(null)}
          >
            <ArrowLeft className="size-4" />
          </Button>
        )}
        Select Artwork for {displayData.name}
      </ModalHeader>
      <ModalBody>
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-700 py-4">
          <div className="flex gap-2 mb-4">
            <TextInput
              className="flex-grow"
              type="text"
              placeholder="Replace with a different card..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSearch();
                }
              }}
            />
            <Button onClick={handleSearch}>Search</Button>
          </div>
          {modalCard && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="apply-to-all"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
              />
              <Label htmlFor="apply-to-all">
                Apply to all cards named "{modalCard?.name}"
              </Label>
            </div>
          )}
        </div>

        {modalCard && (
          <>
            <div className="grid grid-cols-3 md:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto pt-4">
              {(displayData.imageUrls ?? []).map((pngUrl, i) => (
                <img
                  key={i}
                  src={pngUrl}
                  loading="lazy"
                  className={`w-full cursor-pointer border-4 ${
                    displayData.id === pngUrl
                      ? "border-green-500"
                      : "border-transparent"
                  }`}
                  onClick={() => handleSelectArtwork(pngUrl)}
                />
              ))}
            </div>

            <Button
              className="w-full mt-4"
              color="blue"
              onClick={getMorePrints}
              disabled={isGettingMore}
            >
              {isGettingMore ? "Loading prints..." : "Get All Prints"}
            </Button>
          </>
        )}
      </ModalBody>
    </Modal>
  );
}
