import axios from "axios";
import {
  Button,
  Modal,
  ModalBody,
  ModalHeader,
  TextInput,
} from "flowbite-react";
import { useState } from "react";
import LoadingOverlay from "../components/LoadingOverlay";
import { PageSettingsControls } from "../components/PageSettingsControls";
import { PageView } from "../components/PageView";
import { UploadSection } from "../components/UploadSection";
import { API_BASE } from "../constants";
import {
  addBleedEdge,
  getLocalBleedImageUrl,
  pngToNormal,
} from "../helpers/ImageHelper";
import type { CardOption } from "../types/Card";

export type LoadingTask =
  | "Fetching cards"
  | "Processing Images"
  | "Generating PDF"
  | "Uploading Images"
  | "Clearing Images"
  | null;

export default function ProxyBuilderPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [cards, setCards] = useState<CardOption[]>([]);
  const [originalSelectedImages, setOriginalSelectedImages] = useState<
    Record<string, string>
  >({});
  const [selectedImages, setSelectedImages] = useState<Record<string, string>>(
    {}
  );
  const [isGettingMore, setIsGettingMore] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalCard, setModalCard] = useState<CardOption | null>(null);
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingTask, setLoadingTask] = useState<LoadingTask>(null);



  async function getMoreCards() {
    if (!modalCard) return;
    setIsGettingMore(true);
    try {
      const res = await axios.post<CardOption[]>(
        `${API_BASE}/api/cards/images`,
        { cardNames: [modalCard.name], cardArt: "prints" }
      );

      const urls = res.data?.[0]?.imageUrls ?? [];
      setModalCard((prev) => (prev ? { ...prev, imageUrls: urls } : prev));
    } finally {
      setIsGettingMore(false);
    }
  }

  return (
    <>
      <h1 className="sr-only">Proxxied — MTG Proxy Builder and Print</h1>

      {isLoading && loadingTask && <LoadingOverlay task={loadingTask} />}

      <div className="flex flex-row h-screen justify-between overflow-hidden">
        <Modal
          show={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          size="4xl"
        >
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
                  const proxiedUrl = getLocalBleedImageUrl(
                    newCard.imageUrls[0]
                  );
                  const processed = await addBleedEdge(proxiedUrl);

                  setCards((prev) => {
                    const updated = [...prev];
                    updated[modalIndex] = {
                      uuid: newUuid,
                      name: newCard.name,
                      imageUrls: newCard.imageUrls,
                      isUserUpload: false,
                    };
                    return updated;
                  });

                  setModalCard({
                    uuid: newUuid,
                    name: newCard.name,
                    imageUrls: newCard.imageUrls,
                    isUserUpload: false,
                  });

                  setSelectedImages((prev) => ({
                    ...prev,
                    [newUuid]: processed,
                  }));
                  setOriginalSelectedImages((prev) => ({
                    ...prev,
                    [newUuid]: newCard.imageUrls[0],
                  }));

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

                          setSelectedImages((prev) => ({
                            ...prev,
                            [modalCard.uuid]: processed,
                          }));

                          setOriginalSelectedImages((prev) => ({
                            ...prev,
                            [modalCard.uuid]: pngUrl,
                          }));

                          setIsModalOpen(false);
                        }}
                      />
                    );
                  })}
                </div>
                <Button
                  className="bg-blue-800 w-full"
                  onClick={getMoreCards}
                  disabled={isGettingMore}
                >
                  {isGettingMore ? "Loading prints..." : "Get All Prints"}
                </Button>
              </>
            )}
          </ModalBody>
        </Modal>

        <UploadSection
          cards={cards}
          setCards={setCards}
          setLoadingTask={setLoadingTask}
          setIsLoading={setIsLoading}
          setOriginalSelectedImages={setOriginalSelectedImages}
          setSelectedImages={setSelectedImages}
        />

        <PageView
          cards={cards}
          setCards={setCards}
          selectedImages={selectedImages}
          setSelectedImages={setSelectedImages}
          originalSelectedImages={originalSelectedImages}
          setOriginalSelectedImages={setOriginalSelectedImages}
          setModalCard={setModalCard}
          setModalIndex={setModalIndex}
          setIsModalOpen={setIsModalOpen}
        />

        <PageSettingsControls
          cards={cards}
          originalSelectedImages={originalSelectedImages}
          setOriginalSelectedImages={setOriginalSelectedImages}
          selectedImages={selectedImages}
          setSelectedImages={setSelectedImages}
          setLoadingTask={setLoadingTask}
          setIsLoading={setIsLoading}
        />
      </div>
    </>
  );
}
