import { API_BASE } from "@/constants";
import { db } from "../db"; // Import the Dexie database instance
import { ImageProcessor, Priority } from "../helpers/imageProcessor";
import { useSettingsStore } from "../store";
import { importStats } from "../helpers/importStats";
import type { CardOption } from "../../../shared/types";
import { useCallback, useRef, useState } from "react";
import { getEffectiveBleedMode, getEffectiveExistingBleedMm, getExpectedBleedWidth, type GlobalSettings } from "../helpers/imageSpecs";

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
  // Note: Source-type bleed settings (withBleedMode, noBleedMode, etc.) are read
  // directly from useSettingsStore.getState() in usage to avoid stale closures

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
      if (priority === Priority.HIGH) {
        imageProcessor.promoteToHighPriority(imageId);
      }
      return existingRequest.then(() => {
        importStats.markCardProcessed(card.uuid);
        setLoadingMap((m) => ({ ...m, [card.uuid]: "idle" }));
      }, (e: unknown) => {
        importStats.markCardFailed(card.uuid);
        setLoadingMap((m) => ({ ...m, [card.uuid]: "error" }));
        throw e;
      });
    }

    const p = (async () => {
      // Double-check after acquiring slot (settings might have changed)
      const currentImage = await db.images.get(imageId);

      // Get fresh values from store for spec calculation
      const state = useSettingsStore.getState();
      const settings: GlobalSettings = {
        bleedEdgeWidth, // passed from hook props (already mm)
        bleedEdgeUnit: 'mm', // Already converted
        withBleedSourceAmount: state.withBleedSourceAmount,
        withBleedTargetMode: state.withBleedTargetMode,
        withBleedTargetAmount: state.withBleedTargetAmount,
        noBleedTargetMode: state.noBleedTargetMode,
        noBleedTargetAmount: state.noBleedTargetAmount,
      };

      const effectiveBleedMode = getEffectiveBleedMode(card, settings);
      const effectiveExistingBleedMm = getEffectiveExistingBleedMm(card, settings);
      // Use getExpectedBleedWidth for correct priority: per-card > type override > global
      const expectedBleedWidth = getExpectedBleedWidth(card, bleedEdgeWidth, settings, true);
      const effectiveBleedWidth = expectedBleedWidth;

      // Smart Cache Check: valid if width matches AND generation parameters match
      // If generatedHasBuiltInBleed is missing (legacy), we might reprocess once, which is safe.
      const hasBuiltInBleed = card.hasBuiltInBleed ?? (card as { hasBakedBleed?: boolean }).hasBakedBleed;
      if (
        currentImage?.displayBlob &&
        currentImage?.displayBlobDarkened &&
        currentImage.exportBleedWidth === expectedBleedWidth &&
        currentImage.generatedHasBuiltInBleed === hasBuiltInBleed &&
        currentImage.generatedBleedMode === effectiveBleedMode
      ) {
        importStats.markCacheHit(card.uuid);
        importStats.markCardProcessed(card.uuid);
        return;
      }
      importStats.markCacheMiss(card.uuid);

      const src = await getOriginalSrcForCard(card);
      if (!src) {
        setLoadingMap((m) => ({ ...m, [card.uuid]: "error" }));
        importStats.markCardFailed(card.uuid);
        return;
      }
      setLoadingMap((m) => ({ ...m, [card.uuid]: "loading" }));
      try {


        const result = await imageProcessor.process({
          uuid: card.uuid,
          url: src,
          bleedEdgeWidth: effectiveBleedWidth,
          unit,
          apiBase: API_BASE,
          isUserUpload: card.isUserUpload,
          hasBuiltInBleed: card.hasBuiltInBleed ?? (card as { hasBakedBleed?: boolean }).hasBakedBleed,
          bleedMode: effectiveBleedMode,
          existingBleedMm: effectiveExistingBleedMm,
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
            imageCacheHit,
          } = result;

          // Track persistent image cache hits (7-day raw image cache)
          if (imageCacheHit) {
            importStats.incrementPersistentCacheHit();
          }

          await db.images.update(imageId, {
            displayBlob,
            displayDpi,
            displayBleedWidth,
            exportBlob,
            exportDpi,
            exportBleedWidth,
            displayBlobDarkened,
            exportBlobDarkened,
            generatedHasBuiltInBleed: hasBuiltInBleed,
            generatedBleedMode: effectiveBleedMode,
          });
          importStats.markCardProcessed(card.uuid);
        } else {
          throw new Error(result.error);
        }

        setLoadingMap((m) => ({ ...m, [card.uuid]: "idle" }));
      } catch (e: unknown) {
        if (e instanceof Error && e.message !== "Cancelled" && e.message !== "Promoted to high priority") {
          console.error("ensureProcessed error for", card.name, e);
          setLoadingMap((m) => ({ ...m, [card.uuid]: "error" }));
          importStats.markCardFailed(card.uuid);
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
      // Cancel any ongoing process for these cards not supported by ImageProcessor yet
      // cards.forEach((card) => {
      //   if (!card.imageId) return;
      //   if (inFlight.current[card.imageId]) {
      //     imageProcessor.cancel(card.imageId);
      //     delete inFlight.current[card.imageId];
      //   }
      // });

      const promises = cards.map(async (card) => {
        if (!card.imageId) return;

        const imageRecord = await db.images.get(card.imageId);
        if (!imageRecord) return;

        const src = imageRecord.originalBlob
          ? URL.createObjectURL(imageRecord.originalBlob)
          : imageRecord.sourceUrl;

        if (!src) return;
        try {
          // Get fresh values from store for spec calculation
          const state = useSettingsStore.getState();
          const settings: GlobalSettings = {
            bleedEdgeWidth: newBleedWidth,
            bleedEdgeUnit: 'mm', // Already converted
            withBleedSourceAmount: state.withBleedSourceAmount,
            withBleedTargetMode: state.withBleedTargetMode,
            withBleedTargetAmount: state.withBleedTargetAmount,
            noBleedTargetMode: state.noBleedTargetMode,
            noBleedTargetAmount: state.noBleedTargetAmount,
          };

          // Get effective bleed mode from settings (same as ensureProcessed)
          const effectiveBleedMode = getEffectiveBleedMode(card, settings);
          const effectiveExistingBleedMm = getEffectiveExistingBleedMm(card, settings);

          // Use getExpectedBleedWidth for correct priority: per-card > type override > global
          const effectiveBleedWidth = getExpectedBleedWidth(card, newBleedWidth, settings, true);




          console.log(`[Processor] ${card.name}: mode=${effectiveBleedMode}, existingMm=${effectiveExistingBleedMm}, target=${effectiveBleedWidth}, hasBaked=${card.hasBuiltInBleed ?? (card as { hasBakedBleed?: boolean }).hasBakedBleed}, from=${card.isUserUpload ? 'upload' : 'mpc'}`);

          const result = await imageProcessor.process({
            uuid: card.uuid,
            url: src,
            bleedEdgeWidth: effectiveBleedWidth,
            unit,
            apiBase: API_BASE,
            isUserUpload: card.isUserUpload,
            hasBuiltInBleed: card.hasBuiltInBleed ?? (card as { hasBakedBleed?: boolean }).hasBakedBleed,
            bleedMode: effectiveBleedMode,
            existingBleedMm: effectiveExistingBleedMm,
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
              generatedHasBuiltInBleed: card.hasBuiltInBleed ?? (card as { hasBakedBleed?: boolean }).hasBakedBleed,
              generatedBleedMode: effectiveBleedMode,
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
