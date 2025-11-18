import { db } from "@/db";
import type { CardOption } from "@/types/Card";

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
export async function addCustomImage(blob: Blob): Promise<string> {
  const imageId = await hashBlob(blob);

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
 * @param imageUrl The remote URL of the image.
 * @returns The ID (URL) of the image in the database.
 */
export async function addRemoteImage(
  imageUrls: string[]
): Promise<string | undefined> {
  if (!imageUrls || imageUrls.length === 0) return undefined;

  const imageId = imageUrls[0].includes("scryfall") ? imageUrls[0].split("?")[0] : imageUrls[0].split("id=")[1];

  await db.transaction("rw", db.images, async () => {
    const existingImage = await db.images.get(imageId);

    if (existingImage) {
      await db.images.update(imageId, {
        refCount: existingImage.refCount + 1,
      });
    } else {
      await db.images.add({
        id: imageId,
        sourceUrl: imageUrls[0],
        imageUrls: imageUrls,
        refCount: 1,
      });
    }
  });

  return imageId;
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
): Promise<void> {
  const maxOrder = (await db.cards.orderBy("order").last())?.order ?? 0;

  const newCards: CardOption[] = cardsData.map((cardData, i) => ({
    ...cardData,
    uuid: crypto.randomUUID(),
    order: maxOrder + (i + 1) * 10,
  }));

  if (newCards.length > 0) {
    await db.cards.bulkAdd(newCards);
  }
}

/**
 * Deletes a card from the database and decrements the reference count of its image.
 * @param uuid The UUID of the card to delete.
 */
export async function deleteCard(uuid: string): Promise<void> {
  await db.transaction("rw", db.cards, db.images, async () => {
    const card = await db.cards.get(uuid);
    if (card?.imageId) {
      await db.cards.delete(uuid);
      // Safely call the non-transactional helper from within the transaction.
      await _removeImageRef_transactional(card.imageId);
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
 */
export async function changeCardArtwork(
  oldImageId: string,
  newImageId: string,
  cardToUpdate: CardOption,
  applyToAll: boolean,
  newName?: string
): Promise<void> {
  await db.transaction("rw", db.cards, db.images, async () => {
    if (oldImageId === newImageId && !newName) return;

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

    await db.cards.bulkUpdate(
      cardsToUpdate.map((c) => ({
        key: c.uuid,
        changes,
      }))
    );

    // 3. Increment the new image's refCount or create the new image
    if (newImage) {
      await db.images.update(newImageId, {
        refCount: newImage.refCount + cardsToUpdate.length,
      });
    } else {
      // This case handles a new remote image - get imageUrls from the old image if available
      const oldImage = await db.images.get(oldImageId);
      const imageUrls = oldImage?.imageUrls || [newImageId];

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
export async function rebalanceCardOrders(): Promise<void> {
  await db.transaction("rw", db.cards, async () => {
    const sortedCards = await db.cards.orderBy("order").toArray();

    // A re-balance is needed if any card has a non-integer order value.
    const needsRebalance = sortedCards.some(
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
