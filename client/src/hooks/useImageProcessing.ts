import { useRef, useState } from "react";
import {
  addBleedEdge,
  getLocalBleedImageUrl,
  trimBleedEdge,
  urlToDataUrl,
} from "../helpers/ImageHelper";
import { useCardsStore } from "../store";
import type { CardOption } from "../types/Card";

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
  const setSelectedImages = useCardsStore((state) => state.setSelectedImages);
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
      return getLocalBleedImageUrl(card.imageUrls[0]);
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
        let base: string;
        if (/^data:image\//i.test(src)) {
          base = card.hasBakedBleed ? await trimBleedEdge(src) : src;
        } else {
          const dataUrl = await urlToDataUrl(src);
          base = card.hasBakedBleed ? await trimBleedEdge(dataUrl) : dataUrl;
        }
        const withBleed = await addBleedEdge(base, bleedEdgeWidth, {
          unit,
          bleedEdgeWidth,
        });
        appendSelectedImages({ [uuid]: withBleed });
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
    for (const card of cards) {
      const uuid = card.uuid;
      if (card.isUserUpload) {
        const original = originalSelectedImages[uuid];
        if (!original && selectedImages[uuid]) {
          updated[uuid] = await addBleedEdge(
            selectedImages[uuid],
            newBleedWidth,
            { unit, bleedEdgeWidth: newBleedWidth }
          );
          continue;
        }
        if (original) {
          const base = card.hasBakedBleed
            ? await trimBleedEdge(original)
            : original;
          updated[uuid] = await addBleedEdge(base, newBleedWidth, {
            unit,
            bleedEdgeWidth: newBleedWidth,
          });
        }
      } else if (originalSelectedImages[uuid]) {
        const proxiedUrl = getLocalBleedImageUrl(originalSelectedImages[uuid]);
        updated[uuid] = await addBleedEdge(proxiedUrl, newBleedWidth, {
          unit,
          bleedEdgeWidth: newBleedWidth,
        });
      }
    }
    setSelectedImages(updated);
  }

  return { loadingMap, ensureProcessed, reprocessSelectedImages };
}
