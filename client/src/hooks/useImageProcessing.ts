import { API_BASE } from "@/constants";
import { db, type Image, type Cardback } from "../db"; // Import the Dexie database instance
import { ImageProcessor, Priority } from "../helpers/imageProcessor";
import { useSettingsStore } from "../store";
import { markCardProcessed, markCardFailed } from "../helpers/ImportSession";
import type { CardOption } from "../../../shared/types";
import { useCallback, useRef, useState } from "react";
import { getEffectiveBleedMode, getEffectiveExistingBleedMm, getExpectedBleedWidth, getHasBuiltInBleed, type GlobalSettings } from "../helpers/imageSpecs";
import { isCardbackId } from "../helpers/cardbackLibrary";

/** Creates a GlobalSettings object from the current store state */
function getGlobalSettings(bleedWidth: number): GlobalSettings {
  const state = useSettingsStore.getState();
  return {
    bleedEdgeWidth: bleedWidth,
    bleedEdgeUnit: 'mm',
    withBleedSourceAmount: state.withBleedSourceAmount,
    withBleedTargetMode: state.withBleedTargetMode,
    withBleedTargetAmount: state.withBleedTargetAmount,
    noBleedTargetMode: state.noBleedTargetMode,
    noBleedTargetAmount: state.noBleedTargetAmount,
  };
}

/**
 * Gets the image or cardback record for a card.
 * Uses the imageId prefix to determine which table to query.
 */
async function getImageOrCardback(_card: CardOption, imageId: string): Promise<Image | Cardback | undefined> {
  if (isCardbackId(imageId)) {
    return await db.cardbacks.get(imageId);
  }
  return await db.images.get(imageId);
}

/**
 * Updates the image or cardback record for a card.
 * Uses the imageId prefix to determine which table to update.
 */
async function updateImageOrCardback(_card: CardOption, imageId: string, updates: Partial<Image | Cardback>): Promise<void> {
  if (isCardbackId(imageId)) {
    await db.cardbacks.update(imageId, updates);
  } else {
    await db.images.update(imageId, updates);
  }
}

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
  // Note: darkenMode is no longer needed here since all modes are pre-generated
  // Source-type bleed settings (withBleedMode, noBleedMode, etc.) are read
  // directly from useSettingsStore.getState() in usage to avoid stale closures

  // Key by imageId for deduplication - multiple cards can share same image
  const [imageLoadingMap, setImageLoadingMap] = useState<
    Record<string, "idle" | "loading" | "error">
  >({});
  const inFlight = useRef<Record<string, Promise<boolean>>>({});
  // Track images that have been successfully processed in this session
  // to avoid repeated processing attempts
  const processedImageIds = useRef<Set<string>>(new Set());

  const hydrated = useSettingsStore((state) => state.hasHydrated);

  async function getOriginalSrcForCard(
    card: CardOption
  ): Promise<string | undefined> {
    if (!card.imageId) return undefined;

    const imageRecord = await getImageOrCardback(card, card.imageId);
    if (imageRecord?.originalBlob) {
      return URL.createObjectURL(imageRecord.originalBlob);
    }
    return imageRecord?.sourceUrl;
  }

  const ensureProcessed = useCallback(async (card: CardOption, priority: Priority = Priority.LOW): Promise<void> => {
    const { imageId } = card;
    if (!imageId) {
      // Cards without images can't be processed - mark as processed to clear from pending
      markCardProcessed(card.uuid, false);
      return;
    }

    // Special case: blank cardback has no image to process - just mark as done
    if (imageId === 'cardback_builtin_blank') {
      markCardProcessed(card.uuid, false);
      processedImageIds.current.add(imageId);
      return;
    }

    if (!hydrated) {
      // If not hydrated yet, we can't process. Mark as processed anyway so stats are accurate.
      // The card will be reprocessed when the effect runs again after hydration.
      return;
    }

    // Fast path: skip if this image was already processed successfully
    // But first check if the image's settings were invalidated
    if (processedImageIds.current.has(imageId)) {
      // Check if settings were invalidated by looking at the image record
      const cachedImage = await getImageOrCardback(card, imageId);
      const settingsInvalidated = cachedImage?.generatedHasBuiltInBleed === undefined;
      if (!settingsInvalidated) {
        markCardProcessed(card.uuid, true);
        return;
      }
      // Settings were invalidated, remove from cache and continue to reprocess
      processedImageIds.current.delete(imageId);
    }

    const existingRequest = inFlight.current[imageId];
    if (existingRequest) {
      if (priority === Priority.HIGH) {
        imageProcessor.promoteToHighPriority(imageId);
      }
      return existingRequest.then((wasCacheHit) => {
        // Track cache hit for this duplicate card
        markCardProcessed(card.uuid, wasCacheHit);
        // Loading state is already set by imageId - no need to update again
      }, (e: unknown) => {
        markCardFailed(card.uuid);
        // Error state is already set by imageId - no need to update again
        throw e;
      });
    }

    const p = (async (): Promise<boolean> => {
      try {
        // Double-check after acquiring slot (settings might have changed)
        const currentImage = await getImageOrCardback(card, imageId);

        const settings = getGlobalSettings(bleedEdgeWidth);

        const effectiveBleedMode = getEffectiveBleedMode(card, settings);
        const effectiveExistingBleedMm = getEffectiveExistingBleedMm(card, settings);
        // Use getExpectedBleedWidth for correct priority: per-card > type override > global
        const expectedBleedWidth = getExpectedBleedWidth(card, bleedEdgeWidth, settings);
        const effectiveBleedWidth = expectedBleedWidth;

        // Smart Cache Check: valid if width matches AND generation parameters match
        // If generatedHasBuiltInBleed is missing (legacy), we might reprocess once, which is safe.
        // Always use card.hasBuiltInBleed - each back card stores its own settings
        const hasBuiltInBleed = getHasBuiltInBleed(card);
        if (
          currentImage?.displayBlob &&
          currentImage?.displayBlobDarkened &&
          currentImage.exportBleedWidth === expectedBleedWidth &&
          currentImage.generatedHasBuiltInBleed === hasBuiltInBleed &&
          currentImage.generatedBleedMode === effectiveBleedMode
        ) {
          // Smart cache hit - already processed with correct settings
          processedImageIds.current.add(imageId);
          markCardProcessed(card.uuid, true);
          return true; // Cache hit (processed blob)
        }

        const src = await getOriginalSrcForCard(card);
        if (!src) {
          setImageLoadingMap((m) => ({ ...m, [imageId]: "error" }));
          markCardFailed(card.uuid);
          return false;
        }
        setImageLoadingMap((m) => ({ ...m, [imageId]: "loading" }));

        try {
          const result = await imageProcessor.process({
            uuid: card.uuid,
            url: src,
            bleedEdgeWidth: effectiveBleedWidth,
            unit,
            apiBase: API_BASE,
            isUserUpload: card.isUserUpload,
            hasBuiltInBleed,
            bleedMode: effectiveBleedMode,
            existingBleedMm: effectiveExistingBleedMm,
            dpi,
          }, priority);

          if ("displayBlob" in result) {
            const {
              displayBlob,
              displayDpi,
              displayBleedWidth,
              exportBlob,
              exportDpi,
              exportBleedWidth,
              // Per-mode blobs
              displayBlobDarkenAll,
              exportBlobDarkenAll,
              displayBlobContrastEdges,
              exportBlobContrastEdges,
              displayBlobContrastFull,
              exportBlobContrastFull,
              // Legacy
              displayBlobDarkened,
              exportBlobDarkened,
              // For Card Editor live preview
              baseDisplayBlob,
              baseExportBlob,
              imageCacheHit,
            } = result;

            await updateImageOrCardback(card, imageId, {
              displayBlob,
              displayDpi,
              displayBleedWidth,
              exportBlob,
              exportDpi,
              exportBleedWidth,
              // Per-mode blobs
              displayBlobDarkenAll,
              exportBlobDarkenAll,
              displayBlobContrastEdges,
              exportBlobContrastEdges,
              displayBlobContrastFull,
              exportBlobContrastFull,
              // Legacy
              displayBlobDarkened,
              exportBlobDarkened,
              // For Card Editor live preview
              baseDisplayBlob,
              baseExportBlob,
              generatedHasBuiltInBleed: hasBuiltInBleed,
              generatedBleedMode: effectiveBleedMode,
            });

            // Mark as processed for this session
            processedImageIds.current.add(imageId);

            // Track as processed with cache hit status
            markCardProcessed(card.uuid, !!imageCacheHit);
            setImageLoadingMap((m) => ({ ...m, [imageId]: "idle" }));
            return !!imageCacheHit;
          } else {
            throw new Error(result.error);
          }
        } catch (e: unknown) {
          const isExpectedError = e instanceof Error && (e.message === "Cancelled" || e.message === "Promoted to high priority");

          if (!isExpectedError) {
            console.error("ensureProcessed error for", card.name, e);
            setImageLoadingMap((m) => ({ ...m, [imageId]: "error" }));
            markCardFailed(card.uuid);
          } else {
            // Stop spinner for cancelled/promoted requests
            setImageLoadingMap((m) => ({ ...m, [imageId]: "idle" }));
            markCardFailed(card.uuid);
          }
          return false;
        } finally {
          if (src.startsWith("blob:")) URL.revokeObjectURL(src);
        }
      } catch (e) {
        console.error("Unexpected error in ensureProcessed wrapper", e);
        return false;
      }
    })();

    p.finally(() => {
      delete inFlight.current[imageId];
    });

    inFlight.current[imageId] = p;
    return p.then(() => { });
  }, [bleedEdgeWidth, unit, dpi, imageProcessor, hydrated]);

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

        const imageRecord = await getImageOrCardback(card, card.imageId);
        if (!imageRecord) return;

        // Get image source: prefer originalBlob, fall back to sourceUrl only if it's a valid URL
        let src: string | undefined;
        if (imageRecord.originalBlob) {
          src = URL.createObjectURL(imageRecord.originalBlob);
        } else if (imageRecord.sourceUrl && (
          imageRecord.sourceUrl.startsWith('http://') ||
          imageRecord.sourceUrl.startsWith('https://') ||
          imageRecord.sourceUrl.startsWith('blob:') ||
          imageRecord.sourceUrl.startsWith('/')
        )) {
          src = imageRecord.sourceUrl;
        }

        if (!src) return;
        try {
          const settings = getGlobalSettings(newBleedWidth);

          // Get effective bleed mode from settings (same as ensureProcessed)
          const effectiveBleedMode = getEffectiveBleedMode(card, settings);
          const effectiveExistingBleedMm = getEffectiveExistingBleedMm(card, settings);

          // Use getExpectedBleedWidth for correct priority: per-card > type override > global
          const effectiveBleedWidth = getExpectedBleedWidth(card, newBleedWidth, settings);

          const result = await imageProcessor.process({
            uuid: card.uuid,
            url: src,
            bleedEdgeWidth: effectiveBleedWidth,
            unit,
            apiBase: API_BASE,
            isUserUpload: card.isUserUpload,
            hasBuiltInBleed: getHasBuiltInBleed(card),
            bleedMode: effectiveBleedMode,
            existingBleedMm: effectiveExistingBleedMm,
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
              // Per-mode blobs
              displayBlobDarkenAll,
              exportBlobDarkenAll,
              displayBlobContrastEdges,
              exportBlobContrastEdges,
              displayBlobContrastFull,
              exportBlobContrastFull,
              // Legacy
              displayBlobDarkened,
              exportBlobDarkened,
              // For Card Editor live preview
              baseDisplayBlob,
              baseExportBlob,
            } = result;

            await updateImageOrCardback(card, card.imageId, {
              displayBlob,
              displayDpi,
              displayBleedWidth,
              exportBlob,
              exportDpi,
              exportBleedWidth,
              // Per-mode blobs
              displayBlobDarkenAll,
              exportBlobDarkenAll,
              displayBlobContrastEdges,
              exportBlobContrastEdges,
              displayBlobContrastFull,
              exportBlobContrastFull,
              // Legacy
              displayBlobDarkened,
              exportBlobDarkened,
              // For Card Editor live preview
              baseDisplayBlob,
              baseExportBlob,
              generatedHasBuiltInBleed: getHasBuiltInBleed(card),
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
    [imageProcessor, unit, dpi]
  );

  const cancelProcessing = useCallback(() => {
    imageProcessor.cancelAll();
    inFlight.current = {};
    setImageLoadingMap({});
  }, [imageProcessor]);

  // Helper to look up loading state by imageId (for consumers)
  const getLoadingState = useCallback((imageId: string | undefined): "idle" | "loading" | "error" => {
    return imageId ? imageLoadingMap[imageId] ?? "idle" : "idle";
  }, [imageLoadingMap]);

  return { getLoadingState, ensureProcessed, reprocessSelectedImages, cancelProcessing };
}
