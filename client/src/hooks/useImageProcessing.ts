
import { API_BASE } from "@/constants";
import { db } from "../db"; // Import the Dexie database instance
import { ImageProcessor, Priority } from "../helpers/imageProcessor";
import { useSettingsStore } from "../store";
import type { CardOption } from "../../../shared/types";
import { useCallback, useRef, useState } from "react";

export function useImageProcessing({
  unit,
  bleedEdgeWidth,
  imageProcessor,
}: {
  unit: "mm" | "in";
  bleedEdgeWidth: number;
  imageProcessor: ImageProcessor;
}) {
  const dpi = useSettingsStore((state) => state.dpi);
  const darkenNearBlack = useSettingsStore((state) => state.darkenNearBlack);

  const [loadingMap, setLoadingMap] = useState<
    Record<string, "idle" | "loading" | "error">
  >({});
  const inFlight = useRef<Record<string, Promise<void>>>({});

  const hydrated = useSettingsStore((state) => state.hasHydrated);

  async function getOriginalSrcForCard(
    card: CardOption
  ): Promise<string | undefined> {
    if (!card.imageId) return undefined;

    const imageRecord = await db.images.get(card.imageId);
    if (imageRecord?.originalBlob) {
      return URL.createObjectURL(imageRecord.originalBlob);
    }
    return imageRecord?.sourceUrl;
  }

  const ensureProcessed = useCallback(async (card: CardOption, priority: Priority = Priority.LOW): Promise<void> => {
    const { imageId } = card;
    if (!imageId) return;

    if (!hydrated) {
      return;
    }

    const existingRequest = inFlight.current[imageId];
    if (existingRequest) {
      return existingRequest;
    }

    const p = (async () => {
      // Double-check after acquiring slot (settings might have changed)
      const currentImage = await db.images.get(imageId);

      if (
        currentImage?.displayBlob &&
        currentImage?.displayBlobDarkened &&
        currentImage.exportDpi === dpi &&
        currentImage.exportBleedWidth === bleedEdgeWidth
      ) {
        return;
      }

      const src = await getOriginalSrcForCard(card);
      if (!src) return;
      setLoadingMap((m) => ({ ...m, [card.uuid]: "loading" }));
      try {
        const result = await imageProcessor.process({
          uuid: card.uuid,
          url: src,
          bleedEdgeWidth,
          unit,
          apiBase: API_BASE,
          isUserUpload: card.isUserUpload,
          hasBakedBleed: card.hasBakedBleed,
          dpi,
          darkenNearBlack,
        }, priority);

        if ("displayBlob" in result) {
          const {
            displayBlob,
            displayDpi,
            displayBleedWidth,
            exportBlob,
            exportDpi,
            exportBleedWidth,
            displayBlobDarkened,
            exportBlobDarkened,
          } = result;

          await db.images.update(imageId, {
            displayBlob,
            displayDpi,
            displayBleedWidth,
            exportBlob,
            exportDpi,
            exportBleedWidth,
            displayBlobDarkened,
            exportBlobDarkened,
          });
        } else {
          throw new Error(result.error);
        }

        setLoadingMap((m) => ({ ...m, [card.uuid]: "idle" }));
      } catch (e: unknown) {
        if (e instanceof Error && e.message !== "Cancelled" && e.message !== "Promoted to high priority") {
          console.error("ensureProcessed error for", card.name, e);
          setLoadingMap((m) => ({ ...m, [card.uuid]: "error" }));
        }
      } finally {
        if (src.startsWith("blob:")) URL.revokeObjectURL(src);
      }
    })().finally(() => {
      delete inFlight.current[imageId];
    });

    inFlight.current[imageId] = p;
    return p;
  }, [bleedEdgeWidth, unit, dpi, imageProcessor, darkenNearBlack, hydrated]);

  const reprocessSelectedImages = useCallback(
    async (cards: CardOption[], newBleedWidth: number
    ) => {
      const promises = cards.map(async (card) => {
        if (!card.imageId) return;

        const imageRecord = await db.images.get(card.imageId);
        if (!imageRecord) return;

        const src = imageRecord.originalBlob
          ? URL.createObjectURL(imageRecord.originalBlob)
          : imageRecord.sourceUrl;

        if (!src) return;
        try {
          const result = await imageProcessor.process({
            uuid: card.uuid,
            url: src,
            bleedEdgeWidth: newBleedWidth,
            unit,
            apiBase: API_BASE,
            isUserUpload: card.isUserUpload,
            hasBakedBleed: card.hasBakedBleed,
            dpi,
            darkenNearBlack,
          });

          if (src.startsWith("blob:")) URL.revokeObjectURL(src);

          if ("displayBlob" in result) {
            const {
              displayBlob,
              displayDpi,
              displayBleedWidth,
              exportBlob,
              exportDpi,
              exportBleedWidth,
              displayBlobDarkened,
              exportBlobDarkened,
            } = result;

            await db.images.update(card.imageId, {
              displayBlob,
              displayDpi,
              displayBleedWidth,
              exportBlob,
              exportDpi,
              exportBleedWidth,
              displayBlobDarkened,
              exportBlobDarkened,
            });
          } else {
            throw new Error(result.error);
          }
        } catch (e: unknown) {
          if (e instanceof Error && e.message !== "Cancelled") {
            console.error("reprocessSelectedImages error for", card.name, e);
          }
        }
      });

      await Promise.allSettled(promises);
    },
    [imageProcessor, unit, dpi, darkenNearBlack]
  );

  const cancelProcessing = useCallback(() => {
    imageProcessor.cancelAll();
    inFlight.current = {};
    setLoadingMap({});
  }, [imageProcessor]);

  return { loadingMap, ensureProcessed, reprocessSelectedImages, cancelProcessing };
}
