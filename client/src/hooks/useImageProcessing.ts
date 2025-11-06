import { API_BASE } from "@/constants";
import { imageProcessor } from "../helpers/imageProcessor";
import { useCardsStore } from "../store";
import type { CardOption } from "../types/Card";
import { useRef, useState } from "react";

export function useImageProcessing({
  unit,
  bleedEdgeWidth,
}: {
  unit: "mm" | "in";
  bleedEdgeWidth: number;
}) {
  const selectedImages = useCardsStore((state) => state.selectedImages);
  const originalSelectedImages = useCardsStore(
    (state) => state.originalSelectedImages
  );
  const appendSelectedImages = useCardsStore(
    (state) => state.appendSelectedImages
  );
  const appendOriginalSelectedImages = useCardsStore(
    (state) => state.appendOriginalSelectedImages
  );

  const [loadingMap, setLoadingMap] = useState<
    Record<string, "idle" | "loading" | "error">
  >({});
  const inFlight = useRef<Record<string, Promise<void>>>({});

  function getOriginalSrcForCard(card: CardOption): string | undefined {
    const o = originalSelectedImages[card.uuid];
    if (o) return o;
    if (card.imageUrls?.length) {
      return card.imageUrls[0];
    }
    return undefined;
  }

  async function ensureProcessed(card: CardOption): Promise<void> {
    const uuid = card.uuid;
    if (selectedImages[uuid]) return;

    const existing = inFlight.current[uuid];
    if (existing) return existing;

    const p = (async () => {
      const src = getOriginalSrcForCard(card);
      if (!src) return;

      setLoadingMap((m) => ({ ...m, [uuid]: "loading" }));
      try {
        const { processedBlob, error } = await imageProcessor.process({
          uuid,
          url: src,
          bleedEdgeWidth,
          unit,
          apiBase: API_BASE,
          isUserUpload: card.isUserUpload,
          hasBakedBleed: card.hasBakedBleed,
        });

        if (error) {
          throw new Error(error);
        }

        const objectUrl = URL.createObjectURL(processedBlob);
        appendSelectedImages({ [uuid]: objectUrl });

        if (!originalSelectedImages[uuid]) {
          appendOriginalSelectedImages({ [uuid]: src });
        }
        setLoadingMap((m) => ({ ...m, [uuid]: "idle" }));
      } catch (e) {
        console.error("ensureProcessed error for", card.name, e);
        setLoadingMap((m) => ({ ...m, [uuid]: "error" }));
      } finally {
        delete inFlight.current[uuid];
      }
    })();

    inFlight.current[uuid] = p;
    return p;
  }

  async function reprocessSelectedImages(
    cards: CardOption[],
    newBleedWidth: number
  ) {
    const updated: Record<string, string> = {};
    
    const promises = cards.map(async (card) => {
      const uuid = card.uuid;
      const original = originalSelectedImages[uuid];
      
      if (!original) return;
      
      try {
        const { processedBlob, error } = await imageProcessor.process({
            uuid,
            url: original,
            bleedEdgeWidth: newBleedWidth,
            unit,
            apiBase: API_BASE,
            isUserUpload: card.isUserUpload,
            hasBakedBleed: card.hasBakedBleed,
        });

        if (error) {
            throw new Error(error);
        }

        const objectUrl = URL.createObjectURL(processedBlob);
        updated[uuid] = objectUrl;
      } catch (e) {
        console.error("reprocessSelectedImages error for", card.name, e);
      }
    });

    await Promise.allSettled(promises);
    
    if (Object.keys(updated).length > 0) {
      appendSelectedImages(updated);
    }
  }

  return { loadingMap, ensureProcessed, reprocessSelectedImages };
}
