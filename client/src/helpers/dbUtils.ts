import { db, type Image } from "@/db";
import type { CardOption } from "../../../shared/types";

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

  await db.transaction("rw", db.images, async () => {
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
  prints?: Array<{ imageUrl: string; set: string; number: string; rarity?: string }>
): Promise<string | undefined> {
  if (!imageUrls || imageUrls.length === 0) return undefined;

  const imageId = imageUrls[0].includes("scryfall") ? imageUrls[0].split("?")[0] : imageUrls[0].split("id=")[1];

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
    prints?: Array<{ imageUrl: string; set: string; number: string; rarity?: string }>;
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

    // Use consistent ID generation logic matching addRemoteImage
    const firstUrl = img.imageUrls[0];
    const imageId = firstUrl.includes("scryfall")
      ? firstUrl.split("?")[0]
      : (firstUrl.includes("id=") ? firstUrl.split("id=")[1] : firstUrl);

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

// --- Card Management ---

/**
 * Adds a new card to the database, linking it to an image.
 * This function assumes the image reference has already been accounted for.
 * @param cardData The card data to add.
 * @param imageId The ID of the image to link.
 */
export async function addCards(
  cardsData: Array<
    Omit<CardOption, "uuid" | "order"> & { imageId?: string }
  >
): Promise<CardOption[]> {
  const maxOrder = (await db.cards.orderBy("order").last())?.order ?? 0;

  const newCards: CardOption[] = cardsData.map((cardData, i) => ({
    ...cardData,
    uuid: crypto.randomUUID(),
    order: maxOrder + (i + 1) * 10,
  }));

  if (newCards.length > 0) {
    await db.cards.bulkAdd(newCards);
  }
  return newCards;
}

/**
 * Deletes a card from the database and decrements the reference count of its image.
 * @param uuid The UUID of the card to delete.
 */
export async function deleteCard(uuid: string): Promise<void> {
  await db.transaction("rw", db.cards, db.images, async () => {
    const card = await db.cards.get(uuid);
    if (card) {
      await db.cards.delete(uuid);
      if (card.imageId) {
        // Safely call the non-transactional helper from within the transaction.
        await _removeImageRef_transactional(card.imageId);
      }
    }
  });
}

/**
 * Duplicates a card, creating a new card entry and incrementing the
 * reference count of the shared image.
 * @param uuid The UUID of the card to duplicate.
 */
export async function duplicateCard(uuid: string): Promise<void> {
  await db.transaction("rw", db.cards, db.images, async () => {
    const cardToCopy = await db.cards.get(uuid);
    if (!cardToCopy) return;

    const allCards = await db.cards.orderBy("order").toArray();
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

    const newCard: CardOption = {
      ...cardToCopy,
      uuid: crypto.randomUUID(),
      order: newOrder,
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
 */
export async function changeCardArtwork(
  oldImageId: string,
  newImageId: string,
  cardToUpdate: CardOption,
  applyToAll: boolean,
  newName?: string,
  newImageUrls?: string[],
  cardMetadata?: Partial<Pick<CardOption, 'set' | 'number' | 'colors' | 'cmc' | 'type_line' | 'rarity' | 'mana_cost' | 'lang'>>
): Promise<void> {
  console.log("[changeCardArtwork] Called with:", {
    oldImageId,
    newImageId,
    cardName: cardToUpdate.name,
    applyToAll,
    newName,
    hasNewImageUrls: !!newImageUrls,
    cardMetadata,
  });

  await db.transaction("rw", db.cards, db.images, async () => {
    if (oldImageId === newImageId && !newName && !newImageUrls && !cardMetadata) {
      console.log("[changeCardArtwork] No changes needed - early return");
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

    // 2. Get the new image record to determine its type and update cards
    const newImage = await db.images.get(newImageId);
    const newImageIsCustom = newImage ? !!newImage.originalBlob : false;

    const changes: Partial<CardOption> = {
      imageId: newImageId,
      isUserUpload: newImageIsCustom,
    };
    if (newName) {
      changes.name = newName;
    }
    // Apply metadata updates (set, number, colors, etc.)
    if (cardMetadata) {
      Object.assign(changes, cardMetadata);
    }

    console.log("[changeCardArtwork] Applying changes to", cardsToUpdate.length, "cards:", changes);

    await db.cards.bulkUpdate(
      cardsToUpdate.map((c) => ({
        key: c.uuid,
        changes,
      }))
    );

    // 3. Increment the new image's refCount or create the new image
    if (newImage) {
      const updates: Partial<import("../db").Image> = {
        refCount: newImage.refCount + cardsToUpdate.length,
      };
      if (newImageUrls && newImageUrls.length > 0) {
        updates.imageUrls = newImageUrls;
      }
      await db.images.update(newImageId, updates);
    } else {
      // This case handles a new remote image
      const oldImage = await db.images.get(oldImageId);
      // Use provided newImageUrls if available.
      // If not provided, and we are NOT renaming, fallback to oldImage.imageUrls.
      // If renaming, we assume it's a different card, so we default to just the newImageId.
      const imageUrls = newImageUrls || (newName ? [newImageId] : (oldImage?.imageUrls || [newImageId]));

      await db.images.add({
        id: newImageId,
        sourceUrl: newImageId,
        imageUrls: imageUrls,
        refCount: cardsToUpdate.length,
      });
    }

    // 4. Decrement the old images' refCounts, only if the image is actually changing
    if (oldImageId !== newImageId) {
      for (const [id, count] of oldImageIdCounts.entries()) {
        const oldImage = await db.images.get(id);
        if (oldImage) {
          const newRefCount = oldImage.refCount - count;
          if (newRefCount > 0) {
            await db.images.update(id, { refCount: newRefCount });
          } else {
            await db.images.delete(id);
          }
        }
      }
    }
  });
}

/**
 * Re-balances the 'order' property of all cards to be integers,
 * preventing floating point precision issues. This should be
 * called periodically or on application startup.
 */
export async function rebalanceCardOrders(cards?: CardOption[]): Promise<void> {
  await db.transaction("rw", db.cards, async () => {
    let sortedCards = cards;
    if (!sortedCards) {
      sortedCards = await db.cards.orderBy("order").toArray();
    }

    // A re-balance is needed if any card has a non-integer order value OR if we were passed a specific list (forcing rebalance)
    const needsRebalance = cards || sortedCards.some(
      (card) => !Number.isInteger(card.order)
    );

    if (needsRebalance) {
      const rebalancedCards = sortedCards.map((card, index) => ({
        ...card,
        order: (index + 1) * 10, // Space out by 10 for future inserts
      }));

      await db.cards.bulkPut(rebalancedCards);
    }
  });
}
