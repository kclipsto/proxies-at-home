import { API_BASE } from "@/constants";
import { db } from "../db"; // Import the Dexie database instance
import { ImageProcessor } from "../helpers/imageProcessor";
import { useSettingsStore } from "../store";
import type { CardOption } from "../types/Card";
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

  const [loadingMap, setLoadingMap] = useState<
    Record<string, "idle" | "loading" | "error">
  >({});
  const inFlight = useRef<Record<string, Promise<void>>>({});

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

  const ensureProcessed = useCallback(async (card: CardOption): Promise<void> => {
    const { imageId } = card;
    if (!imageId) return;

    const existingImage = await db.images.get(imageId);
    if (existingImage?.displayBlob) return;

    const existingRequest = inFlight.current[imageId];
    if (existingRequest) return existingRequest;

    const p = (async () => {
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
        });

        if ("displayBlob" in result) {
          const {
            displayBlob,
            displayDpi,
            displayBleedWidth,
            exportBlob,
            exportDpi,
            exportBleedWidth,
          } = result;

          await db.images.update(imageId, {
            displayBlob,
            displayDpi,
            displayBleedWidth,
            exportBlob,
            exportDpi,
            exportBleedWidth,
          });
        } else {
          throw new Error(result.error);
        }

        setLoadingMap((m) => ({ ...m, [card.uuid]: "idle" }));
      } catch (e) {
        console.error("ensureProcessed error for", card.name, e);
        setLoadingMap((m) => ({ ...m, [card.uuid]: "error" }));
      } finally {
        if (src.startsWith("blob:")) URL.revokeObjectURL(src);
      }
    })().finally(() => {
      delete inFlight.current[imageId];
    });

    inFlight.current[imageId] = p;
    return p;
  }, [bleedEdgeWidth, unit, dpi, imageProcessor]);

  const reprocessSelectedImages = useCallback(
    async (cards: CardOption[], newBleedWidth: number) => {
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
            } = result;

            await db.images.update(card.imageId, {
              displayBlob,
              displayDpi,
              displayBleedWidth,
              exportBlob,
              exportDpi,
              exportBleedWidth,
            });
          } else {
            throw new Error(result.error);
          }
        } catch (e) {
          console.error("reprocessSelectedImages error for", card.name, e);
        }
      });

      await Promise.allSettled(promises);
    },
    [imageProcessor, unit, dpi]
  );

  return { loadingMap, ensureProcessed, reprocessSelectedImages };
}
