import axios from "axios";
import {
  Button,
  Modal,
  ModalBody,
  ModalHeader,
  TextInput,
} from "flowbite-react";
import { useState } from "react";
import { API_BASE } from "../constants";
import {
  addBleedEdge,
  getLocalBleedImageUrl,
  pngToNormal,
} from "../helpers/ImageHelper";
import { useArtworkModalStore } from "../store";
import { useCardsStore } from "../store/cards";
import type { CardOption } from "../types/Card";

export function ArtworkModal() {
  const [isGettingMore, setIsGettingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const isModalOpen = useArtworkModalStore((state) => state.open);

  const modalCard = useArtworkModalStore((state) => state.card);
  const modalIndex = useArtworkModalStore((state) => state.index);
  const closeArtworkModal = useArtworkModalStore((state) => state.closeModal);
  const updateArtworkCard = useArtworkModalStore((state) => state.updateCard);

  const updateCard = useCardsStore((state) => state.updateCard);
  const originalSelectedImages = useCardsStore(
    (state) => state.originalSelectedImages
  );
  const appendSelectedImages = useCardsStore(
    (state) => state.appendSelectedImages
  );
  const appendOriginalSelectedImages = useCardsStore(
    (state) => state.appendOriginalSelectedImages
  );

  async function getMoreCards() {
    if (!modalCard) return;
    setIsGettingMore(true);
    try {
      const res = await axios.post<CardOption[]>(
        `${API_BASE}/api/cards/images`,
        { cardNames: [modalCard.name], cardArt: "prints" }
      );

      const urls = res.data?.[0]?.imageUrls ?? [];
      updateArtworkCard({ imageUrls: urls });
    } finally {
      setIsGettingMore(false);
    }
  }

  return (
    <Modal show={isModalOpen} onClose={() => closeArtworkModal()} size="4xl">
      <ModalHeader>Select Artwork</ModalHeader>
      <ModalBody>
        <div className="mb-4">
          <TextInput
            type="text"
            placeholder="Replace with a different card..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              e.stopPropagation();

              const name = searchQuery.trim();
              if (!name || modalIndex === null) return;

              const res = await axios.post<CardOption[]>(
                `${API_BASE}/api/cards/images`,
                { cardNames: [name] } // unique:art default happens server-side
              );

              if (!res.data.length) return;

              const newCard = res.data[0]; // shape: { name, imageUrls }
              if (!newCard.imageUrls?.length) return;

              const newUuid = crypto.randomUUID();
              const proxiedUrl = getLocalBleedImageUrl(newCard.imageUrls[0]);
              const processed = await addBleedEdge(proxiedUrl);

              updateCard(modalIndex, {
                uuid: newUuid,
                name: newCard.name,
                imageUrls: newCard.imageUrls,
                isUserUpload: false,
              });

              updateArtworkCard({
                uuid: newUuid,
                name: newCard.name,
                imageUrls: newCard.imageUrls,
                isUserUpload: false,
              });

              appendSelectedImages({
                [newUuid]: processed,
              });
              appendOriginalSelectedImages({
                [newUuid]: newCard.imageUrls[0],
              });

              setSearchQuery("");
            }}
          />
        </div>
        {modalCard && (
          <>
            <div className="grid grid-cols-3 md:grid-cols-3 gap-4">
              {modalCard.imageUrls.map((pngUrl, i) => {
                const thumbUrl = pngToNormal(pngUrl);
                return (
                  <img
                    key={i}
                    src={thumbUrl}
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = pngUrl;
                    }} // fallback
                    className={`w-full cursor-pointer border-4 ${
                      originalSelectedImages[modalCard.uuid] === pngUrl
                        ? "border-green-500"
                        : "border-transparent"
                    }`}
                    onClick={async () => {
                      const proxiedUrl = getLocalBleedImageUrl(pngUrl);
                      const processed = await addBleedEdge(proxiedUrl);

                      appendSelectedImages({
                        [modalCard.uuid]: processed,
                      });

                      appendOriginalSelectedImages({
                        [modalCard.uuid]: pngUrl,
                      });

                      closeArtworkModal();
                    }}
                  />
                );
              })}
            </div>
            <Button
              className="w-full"
              color="blue"
              onClick={getMoreCards}
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
