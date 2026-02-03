import { db, type Image } from "@/db";
import type { CardOption } from "../../../shared/types";
import { parseImageIdFromUrl } from "./imageHelper";
import { isCardbackId } from "./cardbackLibrary";
import { extractMpcIdentifierFromImageId, getMpcAutofillImageUrl } from "./mpcAutofillApi";
import { inferSourceFromUrl, getImageSourceSync, isCustomSource } from "./imageSourceUtils";

/**
 * Calculates the SHA-256 hash of a file or blob.
 * @param blob The file or blob to hash.
 * @returns A hex string representation of the hash.
 */
export async function hashBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// --- Image Management ---

/**
 * Adds a new custom image to the database, handling deduplication.
 * If the image already exists, its refCount is incremented.
 * If it's new, it's added with a refCount of 1.
 * @param blob The image blob to add.
 * @returns The ID (hash) of the image in the database.
 */
export async function addCustomImage(
  blob: Blob,
  suffix: string = ""
): Promise<string> {
  const hash = await hashBlob(blob);
  const imageId = suffix ? `${hash}${suffix}` : hash;

  await db.transaction("rw", db.images, db.user_images, async () => {
    // 1. Store original blob in persistent user_images table
    // This survives project switches and image cache clears
    const existingUserImage = await db.user_images.get(imageId);
    if (!existingUserImage) {
      await db.user_images.add({
        hash: imageId,
        data: blob,
        type: blob.type || 'image/png',
        createdAt: Date.now(),
      });
    }

    // 2. Also create/update entry in images cache for processing
    const existingImage = await db.images.get(imageId);
    if (existingImage) {
      await db.images.update(imageId, {
        refCount: existingImage.refCount + 1,
      });
    } else {
      await db.images.add({
        id: imageId,
        originalBlob: blob,
        refCount: 1,
        source: 'custom',
      });
    }
  });

  return imageId;
}

/**
 * Adds a new Scryfall/remote image to the database, handling deduplication.
 * If the image URL already exists, its refCount is incremented.
 * If it's new, it's added with a refCount of 1.
 * @param imageUrls The remote URLs of the image.
 * @param count Number of references to add.
 * @param prints Optional per-print metadata for artwork selection.
 * @returns The ID (URL) of the image in the database.
 */
export async function addRemoteImage(
  imageUrls: string[],
  count: number = 1,
  prints?: Array<{ imageUrl: string; set: string; number: string; rarity?: string; faceName?: string }>
): Promise<string | undefined> {
  if (!imageUrls || imageUrls.length === 0) return undefined;

  const imageId = parseImageIdFromUrl(imageUrls[0]);

  await db.transaction("rw", db.images, async () => {
    const existingImage = await db.images.get(imageId);

    if (existingImage) {
      // Update refCount, and update prints if not already set
      const updates: Partial<import("../db").Image> = {
        refCount: existingImage.refCount + count,
      };
      if (prints && !existingImage.prints) {
        updates.prints = prints;
      }
      await db.images.update(imageId, updates);
    } else {
      await db.images.add({
        id: imageId,
        sourceUrl: imageUrls[0],
        imageUrls: imageUrls,
        prints: prints,
        refCount: count,
        source: inferSourceFromUrl(imageUrls[0]) ?? undefined,
      });
    }
  });

  return imageId;
}

/**
 * Adds multiple remote images to the database in a single batch operation.
 * Much faster than calling addRemoteImage sequentially.
 * @param images Array of image data objects
 * @returns Map of first URL to ImageID
 */
export async function addRemoteImages(
  images: Array<{
    imageUrls: string[];
    count?: number;
    prints?: Array<{ imageUrl: string; set: string; number: string; rarity?: string; faceName?: string }>;
  }>
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!images || images.length === 0) return result;

  // 1. Calculate IDs and deduplicate inputs
  const inputsById = new Map<string, {
    id: string;
    urls: string[];
    count: number;
    prints?: Image['prints'];
  }>();

  for (const img of images) {
    if (!img.imageUrls || img.imageUrls.length === 0) continue;

    // Use consistent ID generation logic
    const firstUrl = img.imageUrls[0];
    const imageId = parseImageIdFromUrl(firstUrl);

    result.set(firstUrl, imageId);

    const check = inputsById.get(imageId);
    if (check) {
      check.count += (img.count || 1);
    } else {
      inputsById.set(imageId, {
        id: imageId,
        urls: img.imageUrls,
        count: img.count || 1,
        prints: img.prints,
      });
    }
  }

  // 2. Perform bulk DB operation
  await db.transaction("rw", db.images, async () => {
    const ids = Array.from(inputsById.keys());
    const existingImages = await db.images.bulkGet(ids);

    const updates: Image[] = [];

    // Existing: index matches ids index
    ids.forEach((id, index) => {
      const input = inputsById.get(id)!;
      const existing = existingImages[index];

      if (existing) {
        // Update refCount, preserving all other fields (blobs, etc.)
        const update = {
          ...existing,
          refCount: existing.refCount + input.count,
          // Only update prints if new input has them and existing doesn't
          prints: (input.prints && !existing.prints) ? input.prints : existing.prints,
        };
        updates.push(update);
      } else {
        // New Image
        updates.push({
          id: id,
          sourceUrl: input.urls[0],
          imageUrls: input.urls,
          prints: input.prints,
          refCount: input.count,
          source: inferSourceFromUrl(input.urls[0]) ?? undefined,
        });
      }
    });

    if (updates.length > 0) {
      await db.images.bulkPut(updates);
    }
  });

  return result;
}

// This is a private helper and should not be exported.
// It assumes it's already running within an active transaction.
async function _removeImageRef_transactional(imageId: string): Promise<void> {
  if (!imageId) return;

  const image = await db.images.get(imageId);
  if (image) {
    if (image.refCount > 1) {
      // Just decrement the reference count
      await db.images.update(imageId, { refCount: image.refCount - 1 });
    } else {
      // Delete the image if it's the last reference
      // Note: cardbacks are in db.cardbacks, not db.images
      await db.images.delete(imageId);
    }
  }
}

/**
 * Decrements the reference count for an image. If the count reaches 0,
 * the image is deleted from the database.
 * @param imageId The ID of the image to dereference.
 */
export async function removeImageRef(imageId: string): Promise<void> {
  if (!imageId) return;

  // This function now safely wraps the core logic in a transaction.
  await db.transaction("rw", db.images, () => {
    return _removeImageRef_transactional(imageId);
  });
}

/**
 * Adds a new card to the database, linking it to an image.
 * This function assumes the image reference has already been accounted for.
 * @param cardData The card data to add.
 * @param options.startOrder Explicit starting order for the first card. If provided, cards will be ordered sequentially from this value.
 */
export async function addCards(
  cardsData: Array<
    Omit<CardOption, "uuid" | "order"> & { order?: number; imageId?: string }
  >,
  options?: { startOrder?: number }
): Promise<CardOption[]> {
  // Use explicit startOrder if provided, otherwise append after all existing cards
  const startOrder = options?.startOrder ?? ((await db.cards.orderBy("order").last())?.order ?? 0) + 10;

  const newCards: CardOption[] = cardsData.map((cardData, i) => ({
    ...cardData,
    uuid: crypto.randomUUID(),
    // Respect explicit order if provided, otherwise use sequential order
    order: cardData.order ?? (startOrder + i * 10),
  }));

  if (newCards.length > 0) {
    await db.cards.bulkAdd(newCards);
  }
  return newCards;
}

/**
 * Rebalances the 'order' property of cards within a given project to be sequential (10, 20, 30...).
 * This helps prevent floating point precision issues and keeps orders tidy.
 * @param projectId The ID of the project whose cards should be rebalanced.
 */
export async function rebalanceCardOrders(projectId?: string): Promise<void> {
  if (!projectId) return;

  await db.transaction("rw", db.cards, async () => {
    // 1. Fetch all cards for the project
    const allCards = await db.cards.where('projectId').equals(projectId).toArray();

    // 2. Identify "Slots" (Front Cards)
    // We sort fronts by their current order to maintain relative topology.
    // Back cards are effectively attached to these slots.
    const fronts = allCards
      .filter(c => !c.linkedFrontId)
      .sort((a, b) => a.order - b.order);

    const updates: { key: string; changes: { order: number } }[] = [];

    // 3. Assign sequential integers to Slots
    fronts.forEach((front, index) => {
      const newOrder = (index + 1) * 10;

      // Update Front if needed
      if (Math.abs(front.order - newOrder) > 0.001) {
        updates.push({ key: front.uuid, changes: { order: newOrder } });
      }

      // 4. Update Linked Back if exists
      // We must ensure the back card gets the EXACT same order as the front
      if (front.linkedBackId) {
        const back = allCards.find(c => c.uuid === front.linkedBackId);
        // Only update if back exists and order is different
        // We implicitly fix any drift here by forcing back.order = newOrder
        if (back && Math.abs(back.order - newOrder) > 0.001) {
          updates.push({ key: back.uuid, changes: { order: newOrder } });
        }
      }
    });

    // 5. Apply all updates atomically
    if (updates.length > 0) {
      await db.cards.bulkUpdate(updates);
    }
  });
}
/**
 * Deletes a card from the database and decrements the reference count of its image.
 * If the card has a linkedBackId, the back card will also be deleted (cascade).
 * If the card is a back (has linkedFrontId), the front's linkedBackId will be cleared.
 * @param uuid The UUID of the card to delete.
 */
export async function deleteCard(uuid: string): Promise<void> {
  await db.transaction("rw", db.cards, db.images, db.cardbacks, async () => {
    const card = await db.cards.get(uuid);
    if (card) {
      // If this is a front card with a linked back, cascade delete the back
      if (card.linkedBackId) {
        const backCard = await db.cards.get(card.linkedBackId);
        if (backCard) {
          await db.cards.delete(card.linkedBackId);
          if (backCard.imageId) {
            await _removeImageRef_transactional(backCard.imageId);
          }
        }
      }

      // If this is a back card, clear the front's linkedBackId
      if (card.linkedFrontId) {
        await db.cards.update(card.linkedFrontId, { linkedBackId: undefined });
      }

      await db.cards.delete(uuid);
      if (card.imageId) {
        // Safely call the non-transactional helper from within the transaction.
        await _removeImageRef_transactional(card.imageId);
      }
    }
  });
}

/**
 * Creates a back card linked to a front card.
 * Creates bidirectional links: front.linkedBackId -> back, back.linkedFrontId -> front
 * @param frontUuid The UUID of the front card to link to.
 * @param backImageId Optional image ID for the back card.
 * @param backName Name for the back card (e.g., DFC back face name).
 * @param options Additional options for the back card.
 * @returns The UUID of the newly created back card.
 */
export async function createLinkedBackCard(
  frontUuid: string,
  backImageId: string | undefined,
  backName: string,
  options?: {
    hasBuiltInBleed?: boolean;
    usesDefaultCardback?: boolean;
  }
): Promise<string> {
  const backUuid = crypto.randomUUID();

  await db.transaction("rw", db.cards, db.images, db.cardbacks, async () => {
    const frontCard = await db.cards.get(frontUuid);
    if (!frontCard) {
      throw new Error(`Front card not found: ${frontUuid}`);
    }

    // Create back card with link to front
    // Back cards NEVER need Scryfall enrichment
    const backCard: CardOption = {
      uuid: backUuid,
      name: backName,
      order: frontCard.order, // Shared Slot Key: Same order as front
      isUserUpload: frontCard.isUserUpload,
      imageId: backImageId,
      linkedFrontId: frontUuid,
      needsEnrichment: false,  // Back cards never need Scryfall metadata
      hasBuiltInBleed: options?.hasBuiltInBleed,
      usesDefaultCardback: options?.usesDefaultCardback,
      projectId: frontCard.projectId,
    };

    await db.cards.add(backCard);

    // Update front card with link to back
    await db.cards.update(frontUuid, { linkedBackId: backUuid });

    // Only increment ref count for custom back images (not cardbacks)
    // Cardbacks don't need ref counting - they're only deleted explicitly
    if (backImageId && !options?.usesDefaultCardback) {
      const image = await db.images.get(backImageId);
      if (image) {
        await db.images.update(backImageId, { refCount: image.refCount + 1 });
      }
    }
  });

  return backUuid;
}

/**
 * Creates multiple linked back cards in a single transaction.
 * @param items Array of back card definitions.
 * @returns Array of new back card UUIDs.
 */
export async function createLinkedBackCardsBulk(
  items: Array<{
    frontUuid: string;
    backImageId: string | undefined;
    backName: string;
    options?: {
      hasBuiltInBleed?: boolean;
      usesDefaultCardback?: boolean;
    };
  }>
): Promise<string[]> {
  const newUuids: string[] = [];

  await db.transaction("rw", db.cards, db.images, db.cardbacks, async () => {
    // 1. Fetch all front cards 
    const frontUuids = items.map(i => i.frontUuid);
    const frontCards = await db.cards.bulkGet(frontUuids);

    const backCardsToAdd: CardOption[] = [];
    const frontUpdates: { key: string; changes: Partial<CardOption>; }[] = [];
    // Only track ref counts for non-cardback images (cardbacks don't need ref counting)
    const imageRefIncrements = new Map<string, number>();
    // Track existing backs that need updating (when front already has a linked back)
    const existingBackIdsToUpdate: Array<{
      backUuid: string;
      newImageId: string | undefined;
      newName: string;
      options?: {
        hasBuiltInBleed?: boolean;
        usesDefaultCardback?: boolean;
      };
    }> = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // SAFETY: Dexie's bulkGet preserves order and returns undefined for missing items.
      // Index alignment is guaranteed: frontCards[i] corresponds to items[i].frontUuid.
      const front = frontCards[i];

      if (!front) continue; // Front card was deleted before transaction started - skip gracefully

      // If front already has a linked back (e.g., from default cardback creation),
      // update the existing back's imageId instead of creating a new one
      if (front.linkedBackId) {
        existingBackIdsToUpdate.push({
          backUuid: front.linkedBackId,
          newImageId: item.backImageId,
          newName: item.backName,
          options: item.options,
        });
        newUuids.push(front.linkedBackId);
        continue;
      }

      const backUuid = crypto.randomUUID();
      newUuids.push(backUuid);

      // Prepare back card - back cards NEVER need Scryfall enrichment
      backCardsToAdd.push({
        uuid: backUuid,
        name: item.backName,
        // Shared Slot Key: Back card gets exact same order as front
        order: front.order,
        isUserUpload: front.isUserUpload,
        imageId: item.backImageId,
        linkedFrontId: item.frontUuid,
        needsEnrichment: false,  // Back cards never need Scryfall metadata
        hasBuiltInBleed: item.options?.hasBuiltInBleed,
        usesDefaultCardback: item.options?.usesDefaultCardback,
        projectId: front.projectId,
      });

      // Prepare front update
      frontUpdates.push({
        key: item.frontUuid,
        changes: { linkedBackId: backUuid }
      });

      // Only tally ref counts for non-cardback images (cardbacks don't need ref counting)
      if (item.backImageId && !isCardbackId(item.backImageId)) {
        imageRefIncrements.set(item.backImageId, (imageRefIncrements.get(item.backImageId) || 0) + 1);
      }
    }

    // 2. Perform bulk operations
    if (backCardsToAdd.length > 0) {
      await db.cards.bulkAdd(backCardsToAdd);
    }

    if (frontUpdates.length > 0) {
      await db.cards.bulkUpdate(frontUpdates);
    }

    // 3. Update image ref counts for NEW back cards using bulk operations
    // Only for non-cardback images (cardbacks don't need ref counting)
    if (imageRefIncrements.size > 0) {
      const imageIds = Array.from(imageRefIncrements.keys());
      const images = await db.images.bulkGet(imageIds);
      const imageUpdates: { key: string; changes: { refCount: number } }[] = [];

      for (let i = 0; i < imageIds.length; i++) {
        const image = images[i];
        if (image) {
          const increment = imageRefIncrements.get(imageIds[i]) || 0;
          imageUpdates.push({
            key: imageIds[i],
            changes: { refCount: image.refCount + increment },
          });
        }
      }

      if (imageUpdates.length > 0) {
        await db.images.bulkUpdate(imageUpdates);
      }
    }

    // 4. Update existing back cards (replace their imageId and properties) using bulk operations
    if (existingBackIdsToUpdate.length > 0) {
      // Get all existing back cards at once
      const backUuids = existingBackIdsToUpdate.map(u => u.backUuid);
      const existingBacks = await db.cards.bulkGet(backUuids);

      // Collect old image IDs to decrement and new image IDs to increment
      // Only for non-cardback images (cardbacks don't need ref counting)
      const oldImageIds = new Set<string>();
      const newImageIds = new Set<string>();

      for (let i = 0; i < existingBackIdsToUpdate.length; i++) {
        const update = existingBackIdsToUpdate[i];
        const existingBack = existingBacks[i];
        // Only track non-cardback images
        if (existingBack?.imageId && existingBack.imageId !== update.newImageId && !isCardbackId(existingBack.imageId)) {
          oldImageIds.add(existingBack.imageId);
        }
        if (update.newImageId && !isCardbackId(update.newImageId)) {
          newImageIds.add(update.newImageId);
        }
      }

      // Get all images at once
      const allImageIds = [...Array.from(oldImageIds), ...Array.from(newImageIds)];
      const allImages = await db.images.bulkGet(allImageIds);
      const imageMap = new Map<string, typeof allImages[0]>();
      for (let i = 0; i < allImageIds.length; i++) {
        if (allImages[i]) {
          imageMap.set(allImageIds[i], allImages[i]);
        }
      }

      // Calculate ref count changes
      const imageRefDecrements = new Map<string, number>();
      const imageRefIncrements = new Map<string, number>();

      for (let i = 0; i < existingBackIdsToUpdate.length; i++) {
        const update = existingBackIdsToUpdate[i];
        const existingBack = existingBacks[i];
        if (existingBack?.imageId && existingBack.imageId !== update.newImageId && !isCardbackId(existingBack.imageId)) {
          imageRefDecrements.set(existingBack.imageId, (imageRefDecrements.get(existingBack.imageId) || 0) + 1);
        }
        if (update.newImageId && !isCardbackId(update.newImageId)) {
          imageRefIncrements.set(update.newImageId, (imageRefIncrements.get(update.newImageId) || 0) + 1);
        }
      }

      // Prepare image updates
      const imageUpdates: { key: string; changes: { refCount: number } }[] = [];

      for (const [imageId, decrement] of imageRefDecrements.entries()) {
        const image = imageMap.get(imageId);
        if (image) {
          const newRefCount = Math.max(0, image.refCount - decrement);
          imageUpdates.push({ key: imageId, changes: { refCount: newRefCount } });
        }
      }

      for (const [imageId, increment] of imageRefIncrements.entries()) {
        const image = imageMap.get(imageId);
        if (image) {
          // Check if already in updates (from decrement)
          const existing = imageUpdates.find(u => u.key === imageId);
          if (existing) {
            existing.changes.refCount += increment;
          } else {
            imageUpdates.push({ key: imageId, changes: { refCount: image.refCount + increment } });
          }
        }
      }

      // Prepare card updates
      const cardUpdates = existingBackIdsToUpdate.map(update => ({
        key: update.backUuid,
        changes: {
          imageId: update.newImageId,
          name: update.newName,
          needsEnrichment: false,
          hasBuiltInBleed: update.options?.hasBuiltInBleed,
          usesDefaultCardback: update.options?.usesDefaultCardback,
        },
      }));

      // Perform bulk updates
      if (cardUpdates.length > 0) {
        await db.cards.bulkUpdate(cardUpdates);
      }
      if (imageUpdates.length > 0) {
        await db.images.bulkUpdate(imageUpdates);
      }
    }
  });

  return newUuids;
}


/**
 * Duplicates a card, creating a new card entry and incrementing the
 * reference count of the shared image. If the card has a linked back,
 * the back card is also duplicated with proper bidirectional links.
 * @param uuid The UUID of the card to duplicate.
 */
export async function duplicateCard(uuid: string): Promise<void> {
  await db.transaction("rw", db.cards, db.images, db.cardbacks, async () => {
    const cardToCopy = await db.cards.get(uuid);
    if (!cardToCopy) return;

    // Get cards only from the same project
    const projectId = cardToCopy.projectId;
    const allCards = projectId
      ? await db.cards.where('projectId').equals(projectId).sortBy('order')
      : await db.cards.orderBy("order").toArray();
    const currentIndex = allCards.findIndex((c) => c.uuid === uuid);
    const nextCard = allCards[currentIndex + 1];

    let newOrder: number;
    if (nextCard) {
      newOrder = (cardToCopy.order + nextCard.order) / 2.0;
    } else {
      newOrder = cardToCopy.order + 1;
    }

    // Re-balance if we lose floating point precision
    if (newOrder === cardToCopy.order || newOrder === nextCard?.order) {
      const rebalanced = allCards.map((c, i) => ({ ...c, order: i + 1 }));
      await db.cards.bulkPut(rebalanced);
      // After rebalancing, the new order is simply the next integer
      newOrder = currentIndex + 2;
    }

    const newFrontUuid = crypto.randomUUID();
    let newBackUuid: string | undefined;

    // If the card has a linked back, duplicate it too
    if (cardToCopy.linkedBackId) {
      const backCard = await db.cards.get(cardToCopy.linkedBackId);
      if (backCard) {
        newBackUuid = crypto.randomUUID();

        // Create duplicated back card with link to new front
        const newBackCard: CardOption = {
          ...backCard,
          uuid: newBackUuid,
          order: newOrder, // Shared Slot Key: Same order as front
          linkedFrontId: newFrontUuid,
          linkedBackId: undefined,
        };
        await db.cards.add(newBackCard);

        // Increment back image ref count if it has a non-cardback image
        // Cardbacks don't need ref counting
        if (backCard.imageId && !isCardbackId(backCard.imageId)) {
          const backImage = await db.images.get(backCard.imageId);
          if (backImage) {
            await db.images.update(backCard.imageId, {
              refCount: backImage.refCount + 1,
            });
          }
        }
      }
    }

    // Create duplicated front card with link to new back (if any)
    const newCard: CardOption = {
      ...cardToCopy,
      uuid: newFrontUuid,
      order: newOrder,
      linkedBackId: newBackUuid,
      linkedFrontId: undefined, // Front cards shouldn't have linkedFrontId
    };

    await db.cards.add(newCard);

    if (cardToCopy.imageId) {
      const image = await db.images.get(cardToCopy.imageId);
      if (image) {
        await db.images.update(cardToCopy.imageId, {
          refCount: image.refCount + 1,
        });
      }
    }
  });
}

/**
 * Changes the artwork for one or more cards, handling all reference counting
 * and "apply to all" logic atomically.
 * @param oldImageId The previous image ID.
 * @param newImageId The new image ID.
 * @param cardToUpdate The primary card being updated.
 * @param applyToAll If true, all cards using oldImageId will be updated.
 * @param newName Optional new name for the card.
 * @param newImageUrls Optional new image URLs array.
 * @param cardMetadata Optional metadata to update (set, number, colors, etc.)
 * @param hasBuiltInBleed Optional override for hasBuiltInBleed flag (e.g., for cardbacks with bleed).
 */
export async function changeCardArtwork(
  oldImageId: string | undefined,
  newImageId: string,
  cardToUpdate: CardOption,
  applyToAll: boolean,
  newName?: string,
  newImageUrls?: string[],
  cardMetadata?: Partial<Pick<CardOption, 'set' | 'number' | 'colors' | 'cmc' | 'type_line' | 'rarity' | 'mana_cost' | 'lang' | 'token_parts' | 'needs_token' | 'isToken'>>,
  hasBuiltInBleed?: boolean
): Promise<void> {
  await db.transaction("rw", db.cards, db.images, db.cardbacks, async () => {
    if (oldImageId === newImageId && !newName && !newImageUrls && !cardMetadata) {
      return;
    }

    // Determine which cards to update
    const cardsToUpdate = applyToAll
      ? await db.cards.where("name").equals(cardToUpdate.name).toArray()
      : [cardToUpdate];

    if (cardsToUpdate.length === 0) return;

    // 1. Tally the old image IDs and the counts to be decremented
    const oldImageIdCounts = new Map<string, number>();
    for (const card of cardsToUpdate) {
      if (card.imageId) {
        oldImageIdCounts.set(
          card.imageId,
          (oldImageIdCounts.get(card.imageId) || 0) + 1
        );
      }
    }

    // 2. Determine if new image is custom (explicitly 'custom' source)
    let newImageIsCustom = false;
    if (isCardbackId(newImageId)) {
      const cardback = await db.cardbacks.get(newImageId);
      newImageIsCustom = cardback ? !!cardback.originalBlob : false;
    } else {
      const newImage = await db.images.get(newImageId);
      newImageIsCustom = isCustomSource(getImageSourceSync(newImageId, newImage?.source));
    }

    const changes: Partial<CardOption> = {
      imageId: newImageId,
      isUserUpload: newImageIsCustom,
      hasBuiltInBleed: hasBuiltInBleed ?? false,
      needsEnrichment: false,
      enrichmentRetryCount: undefined,
      enrichmentNextRetryAt: undefined,
    };
    if (newName) {
      changes.name = newName;
    }
    // Apply metadata updates (set, number, colors, etc.)
    if (cardMetadata) {
      Object.assign(changes, cardMetadata);
    }

    await db.cards.bulkUpdate(
      cardsToUpdate.map((c) => ({
        key: c.uuid,
        changes,
      }))
    );

    // 3. Handle new image ref counting
    // Skip ref counting for cardbacks - they're in db.cardbacks and don't need ref counting
    const newIsCardback = isCardbackId(newImageId);
    if (!newIsCardback) {
      const newImage = await db.images.get(newImageId);
      if (newImage) {
        const updates: Partial<import("../db").Image> = {
          refCount: newImage.refCount + cardsToUpdate.length,
        };
        if (newImageUrls && newImageUrls.length > 0) {
          updates.imageUrls = newImageUrls;
        }
        if (hasBuiltInBleed !== undefined && oldImageId !== newImageId) {
          if (newImage.generatedHasBuiltInBleed !== hasBuiltInBleed) {
            updates.displayBlob = undefined;
            updates.displayBlobDarkened = undefined;
            updates.exportBlob = undefined;
            updates.exportBlobDarkened = undefined;
            updates.generatedHasBuiltInBleed = undefined;
            updates.generatedBleedMode = undefined;
          }
        }
        await db.images.update(newImageId, updates);
      } else {
        const oldImage = oldImageId ? await db.images.get(oldImageId) : undefined;
        const isMpcImage = extractMpcIdentifierFromImageId(newImageId) !== null;
        let sourceUrl: string;
        if (isMpcImage) {
          sourceUrl = getMpcAutofillImageUrl(newImageId);
        } else {
          sourceUrl = newImageId;
        }

        const imageUrls = newImageUrls || (newName ? [sourceUrl] : (oldImage?.imageUrls || [sourceUrl]));

        await db.images.add({
          id: newImageId,
          sourceUrl: sourceUrl,
          imageUrls: imageUrls,
          refCount: cardsToUpdate.length,
          source: isMpcImage ? 'mpc' : (inferSourceFromUrl(sourceUrl) ?? undefined),
        });
      }
    }

    // 4. Decrement the old images' refCounts, only if the image is actually changing
    // Skip cardbacks - they're in db.cardbacks and don't need ref counting
    if (oldImageId !== newImageId) {
      // Filter out cardback IDs and collect image IDs to check
      const imageIdsToCheck = Array.from(oldImageIdCounts.keys()).filter(id => !isCardbackId(id));

      if (imageIdsToCheck.length > 0) {
        // Bulk fetch all old images at once instead of sequential awaits
        const oldImages = await db.images.bulkGet(imageIdsToCheck);

        const imageUpdates: { key: string; changes: { refCount: number } }[] = [];
        const imagesToDelete: string[] = [];

        for (let i = 0; i < imageIdsToCheck.length; i++) {
          const id = imageIdsToCheck[i];
          const oldImage = oldImages[i];
          if (oldImage) {
            const count = oldImageIdCounts.get(id) || 0;
            const newRefCount = oldImage.refCount - count;
            if (newRefCount > 0) {
              imageUpdates.push({ key: id, changes: { refCount: newRefCount } });
            } else {
              imagesToDelete.push(id);
            }
          }
        }

        // Bulk update and delete
        if (imageUpdates.length > 0) {
          await db.images.bulkUpdate(imageUpdates);
        }
        if (imagesToDelete.length > 0) {
          await db.images.bulkDelete(imagesToDelete);
        }
      }
    }
  });
}


/**
 * Helper to safely increment/decrement image reference counts.
 * Handles restoring images if they were deleted and are being re-added (undo delete),
 * and deleting images if their refCount drops to 0.
 */
export async function modifyImageRefCount(imageId: string, delta: number, restoreData?: Image) {
  const image = await db.images.get(imageId);
  if (image) {
    const newRefCount = (image.refCount || 0) + delta;
    if (newRefCount <= 0) {
      await db.images.delete(imageId);
    } else {
      await db.images.update(imageId, { refCount: newRefCount });
    }
  } else if (delta > 0 && restoreData) {
    // Image was deleted, restore it
    await db.images.add({ ...restoreData, refCount: delta });
  }
}

import { sortManual } from "./sortAndFilterUtils";

/**
 * Sorts cards based on the Shared Slot Key logic:
 * 1. Primary: 'order' (ascending)
 * 2. Secondary: Front cards come before their linked Back cards.
 */
export function sortCards(cards: CardOption[]): CardOption[] {
  return sortManual(cards);
}
