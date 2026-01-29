/**
 * Undoable action wrappers for database operations.
 * These wrappers capture the necessary state before performing operations
 * so that they can be undone/redone.
 */

import { db, type Image } from "@/db";
import type { CardOption } from "../../../shared/types";
import {
    deleteCard,
    duplicateCard,
    addCards,
    addRemoteImage,
    changeCardArtwork,
    rebalanceCardOrders,
    createLinkedBackCard,
    createLinkedBackCardsBulk,
    modifyImageRefCount,
} from "./dbUtils";
import { useUndoRedoStore } from "@/store/undoRedo";
import { useProjectStore } from "@/store/projectStore";
import { useSettingsStore } from "@/store/settings";
import { BUILTIN_CARDBACKS, isCardbackId } from "./cardbackLibrary";

/**
 * Deletes a card with undo support.
 * Captures the full card data before deletion for restoration on undo.
 */
export async function undoableDeleteCard(uuid: string): Promise<void> {
    // Capture the card and its image data before deletion
    const card = await db.cards.get(uuid);
    if (!card) return;

    let imageData: Image | undefined;
    if (card.imageId) {
        imageData = await db.images.get(card.imageId);
    }

    // Perform the deletion
    await deleteCard(uuid);

    // Record the action for undo
    useUndoRedoStore.getState().pushAction({
        type: "DELETE_CARD",
        description: `Delete "${card.name}"`,
        undo: async () => {
            // Restore the card
            await db.cards.add(card);
            if (card.imageId && imageData) {
                await modifyImageRefCount(card.imageId, 1, imageData);
            }
        },
        redo: async () => {
            await deleteCard(card.uuid);
        },
    });
}

/**
 * Batch deletes multiple cards with a single undo action.
 * All deletions can be undone with one Ctrl+Z.
 */
export async function undoableDeleteCardsBatch(uuids: string[]): Promise<void> {
    if (uuids.length === 0) return;

    // Get all cards and their images before deletion
    const cards = await db.cards.bulkGet(uuids);
    const validCards = cards.filter((c): c is NonNullable<typeof c> => c != null);
    if (validCards.length === 0) return;

    const allCardsToDelete = new Map<string, CardOption>();
    const idsToDelete = new Set(uuids);

    for (const card of validCards) {
        allCardsToDelete.set(card.uuid, card);
        // Cascade: If front has back, delete back too
        if (card.linkedBackId && !idsToDelete.has(card.linkedBackId)) {
            const backCard = await db.cards.get(card.linkedBackId);
            if (backCard) {
                allCardsToDelete.set(backCard.uuid, backCard);
                idsToDelete.add(backCard.uuid);
            }
        }
    }

    // Capture image data for UNDO (restoration)
    const cardImageData: Map<string, { card: CardOption; imageData?: Image }> = new Map();
    for (const card of allCardsToDelete.values()) {
        let imageData: Image | undefined;
        if (card.imageId) {
            imageData = await db.images.get(card.imageId);
        }
        cardImageData.set(card.uuid, { card, imageData });
    }

    // Perform bulk deletion
    await db.transaction("rw", db.cards, db.images, db.cardbacks, async () => {
        // 1. Clear links from cards that refer to these (e.g. if deleting a back, update the front)
        const backCards = Array.from(allCardsToDelete.values()).filter(c => c.linkedFrontId);
        for (const back of backCards) {
            if (back.linkedFrontId && !idsToDelete.has(back.linkedFrontId)) {
                await db.cards.update(back.linkedFrontId, { linkedBackId: undefined });
            }
        }

        // 2. Calculate image ref decrements
        const imageRefDecrements = new Map<string, number>();
        for (const card of allCardsToDelete.values()) {
            if (card.imageId && !isCardbackId(card.imageId)) {
                imageRefDecrements.set(card.imageId, (imageRefDecrements.get(card.imageId) || 0) + 1);
            }
        }

        // 3. Delete cards
        await db.cards.bulkDelete(Array.from(idsToDelete));

        // 4. Update image refs
        if (imageRefDecrements.size > 0) {
            const imageIds = Array.from(imageRefDecrements.keys());
            const images = await db.images.bulkGet(imageIds);
            const imageUpdates: { key: string; changes: { refCount: number } }[] = [];
            const imagesToDelete: string[] = [];

            for (let i = 0; i < imageIds.length; i++) {
                const image = images[i];
                if (image) {
                    const decrement = imageRefDecrements.get(imageIds[i]) || 0;
                    const newRefCount = image.refCount - decrement;
                    if (newRefCount > 0) {
                        imageUpdates.push({ key: imageIds[i], changes: { refCount: newRefCount } });
                    } else {
                        imagesToDelete.push(imageIds[i]);
                    }
                }
            }

            if (imageUpdates.length > 0) {
                await db.images.bulkUpdate(imageUpdates);
            }
            if (imagesToDelete.length > 0) {
                await db.images.bulkDelete(imagesToDelete);
            }
        }
    });

    // Build description
    const description = validCards.length === 1
        ? `Delete "${validCards[0].name}"`
        : `Delete ${validCards.length} cards`;

    // Record the batch action for undo
    useUndoRedoStore.getState().pushAction({
        type: "DELETE_CARDS_BATCH",
        description,
        undo: async () => {
            // Restore all cards
            const cardsToRestore = Array.from(cardImageData.values()).map(x => x.card);

            // We need to restore image refs
            const imageRefIncrements = new Map<string, { count: number, data?: Image }>();

            for (const { card, imageData } of cardImageData.values()) {
                if (card.imageId && !isCardbackId(card.imageId)) {
                    const entry = imageRefIncrements.get(card.imageId) || { count: 0, data: imageData };
                    entry.count++;
                    imageRefIncrements.set(card.imageId, entry);
                }
            }

            await db.transaction("rw", db.cards, db.images, db.cardbacks, async () => {
                await db.cards.bulkAdd(cardsToRestore);

                // Restore images (add back if deleted, increment if exists)
                const imageIds = Array.from(imageRefIncrements.keys());
                const existingImages = await db.images.bulkGet(imageIds);

                const imageUpdates: { key: string; changes: { refCount: number } }[] = [];
                const imagesToAdd: Image[] = [];

                for (let i = 0; i < imageIds.length; i++) {
                    const id = imageIds[i];
                    const existing = existingImages[i];
                    const { count, data } = imageRefIncrements.get(id)!;

                    if (existing) {
                        imageUpdates.push({ key: id, changes: { refCount: existing.refCount + count } });
                    } else if (data) {
                        // Restore deleted image
                        imagesToAdd.push({ ...data, refCount: count });
                    }
                }

                if (imageUpdates.length > 0) await db.images.bulkUpdate(imageUpdates);
                if (imagesToAdd.length > 0) await db.images.bulkAdd(imagesToAdd);
            });
        },
        redo: async () => {
            await db.transaction("rw", db.cards, db.images, db.cardbacks, async () => {
                // Re-calculate image ref decrements from the captured 'cardImageData' to be robust
                const imageRefDecrements = new Map<string, number>();
                for (const { card } of cardImageData.values()) {
                    if (card.imageId && !isCardbackId(card.imageId)) {
                        imageRefDecrements.set(card.imageId, (imageRefDecrements.get(card.imageId) || 0) + 1);
                    }
                }

                // Clear back links
                const backCards = Array.from(allCardsToDelete.values()).filter(c => c.linkedFrontId);
                for (const back of backCards) {
                    // Check if front is still there and not in our delete list (it shouldn't be in delete list if it wasn't before)
                    const front = await db.cards.get(back.linkedFrontId!);
                    if (front && !idsToDelete.has(front.uuid)) {
                        await db.cards.update(front.uuid, { linkedBackId: undefined });
                    }
                }

                await db.cards.bulkDelete(Array.from(idsToDelete));

                // Update images
                if (imageRefDecrements.size > 0) {
                    const imageIds = Array.from(imageRefDecrements.keys());
                    const images = await db.images.bulkGet(imageIds);
                    const imageUpdates: { key: string; changes: { refCount: number } }[] = [];
                    const imagesToDelete: string[] = [];

                    for (let i = 0; i < imageIds.length; i++) {
                        const image = images[i];
                        if (image) {
                            const decrement = imageRefDecrements.get(imageIds[i]) || 0;
                            const newRefCount = image.refCount - decrement;
                            if (newRefCount > 0) {
                                imageUpdates.push({ key: imageIds[i], changes: { refCount: newRefCount } });
                            } else {
                                imagesToDelete.push(imageIds[i]);
                            }
                        }
                    }
                    if (imageUpdates.length > 0) await db.images.bulkUpdate(imageUpdates);
                    if (imagesToDelete.length > 0) await db.images.bulkDelete(imagesToDelete);
                }
            });
        },
    });
}

/**
 * Duplicates a card with undo support.
 * Tracks the new card's UUID so it can be deleted on undo.
 */
export async function undoableDuplicateCard(uuid: string): Promise<string | undefined> {
    // Get the card before duplication to predict the new card
    const originalCard = await db.cards.get(uuid);
    if (!originalCard) return undefined;

    // Get current card count to detect the new card
    const cardsBefore = await db.cards.toArray();
    const uuidsBefore = new Set(cardsBefore.map((c) => c.uuid));

    // Perform the duplication
    await duplicateCard(uuid);

    // Find the new card's UUID
    const cardsAfter = await db.cards.toArray();
    const newCard = cardsAfter.find((c) => !uuidsBefore.has(c.uuid));

    if (!newCard) {
        console.warn("[undoableDuplicateCard] Could not find new card after duplication");
        return undefined;
    }

    // Record the action for undo
    useUndoRedoStore.getState().pushAction({
        type: "DUPLICATE_CARD",
        description: `Duplicate "${originalCard.name}"`,
        undo: async () => {
            // Delete the duplicated card
            await deleteCard(newCard.uuid);
        },
        redo: async () => {
            // Re-duplicate from the original
            await duplicateCard(uuid);
        },
    });

    return newCard.uuid;
}

/**
 * Batch duplicates multiple cards with a single undo action.
 * All duplications can be undone with one Ctrl+Z.
 */
export async function undoableDuplicateCardsBatch(uuids: string[]): Promise<string[]> {
    if (uuids.length === 0) return [];

    let newUuidsResult: string[] = [];

    await db.transaction("rw", db.cards, db.images, db.cardbacks, async () => {
        const validUuids = new Set(uuids);
        const allCards = await db.cards.orderBy("order").toArray();

        // Filter to find the cards we want to duplicate, keeping the order from allCards
        const cardsToDuplicate = allCards.filter(c => validUuids.has(c.uuid));

        if (cardsToDuplicate.length === 0) return;

        const imageRefIncrements = new Map<string, number>();
        const insertions: Map<string, CardOption[]> = new Map();

        // Prepare new cards
        for (const original of cardsToDuplicate) {
            const newFrontUuid = crypto.randomUUID();
            let newBackUuid: string | undefined;
            let newBackCard: CardOption | undefined;

            // Handle linked back
            if (original.linkedBackId) {
                const backCard = await db.cards.get(original.linkedBackId);
                if (backCard) {
                    newBackUuid = crypto.randomUUID();
                    newBackCard = {
                        ...backCard,
                        uuid: newBackUuid,
                        order: 0, // placeholder
                        linkedFrontId: newFrontUuid,
                        linkedBackId: undefined,
                    };

                    if (backCard.imageId && !isCardbackId(backCard.imageId)) {
                        imageRefIncrements.set(backCard.imageId, (imageRefIncrements.get(backCard.imageId) || 0) + 1);
                    }
                }
            }

            const newFrontCard: CardOption = {
                ...original,
                uuid: newFrontUuid,
                order: 0, // placeholder
                linkedBackId: newBackUuid,
                linkedFrontId: undefined,
            };

            if (original.imageId && !isCardbackId(original.imageId)) {
                imageRefIncrements.set(original.imageId, (imageRefIncrements.get(original.imageId) || 0) + 1);
            }

            const list = insertions.get(original.uuid) || [];
            list.push(newFrontCard);
            if (newBackCard) list.push(newBackCard);
            insertions.set(original.uuid, list);
        }

        // Reconstruct list and assign orders
        const combinedList: CardOption[] = [];
        const newUuidsGenerated: string[] = [];

        for (const card of allCards) {
            combinedList.push(card);
            const toInsert = insertions.get(card.uuid);
            if (toInsert) {
                combinedList.push(...toInsert);
                toInsert.forEach(c => newUuidsGenerated.push(c.uuid));
            }
        }

        newUuidsResult = newUuidsGenerated;

        // Assign integer orders using Shared Slot Slot logic
        const cardMap = new Map(combinedList.map(c => [c.uuid, c]));
        const fronts = combinedList.filter(c => !c.linkedFrontId);
        const allUpdates: CardOption[] = [];

        fronts.forEach((front, index) => {
            const newOrder = (index + 1) * 10;
            // Update Front
            allUpdates.push({ ...front, order: newOrder });

            // Update Back if exists
            if (front.linkedBackId) {
                const back = cardMap.get(front.linkedBackId);
                if (back) {
                    allUpdates.push({ ...back, order: newOrder });
                }
            }
        });

        // Bulk put (updates existing, adds new)
        await db.cards.bulkPut(allUpdates);

        // Update image refs
        if (imageRefIncrements.size > 0) {
            const imageIds = Array.from(imageRefIncrements.keys());
            const images = await db.images.bulkGet(imageIds);
            const imageUpdates: { key: string; changes: { refCount: number } }[] = [];

            for (let i = 0; i < imageIds.length; i++) {
                const image = images[i];
                if (image) {
                    const increment = imageRefIncrements.get(imageIds[i]) || 0;
                    imageUpdates.push({ key: imageIds[i], changes: { refCount: image.refCount + increment } });
                }
            }

            if (imageUpdates.length > 0) {
                await db.images.bulkUpdate(imageUpdates);
            }
        }
    });

    if (newUuidsResult.length === 0) return [];

    const originalCount = uuids.length;
    const description = originalCount === 1
        ? "Duplicate 1 card"
        : `Duplicate ${originalCount} cards`;
    const uuidsOfNewCards = [...newUuidsResult];
    const sourceUuids = [...uuids];

    useUndoRedoStore.getState().pushAction({
        type: "DUPLICATE_CARDS_BATCH",
        description,
        undo: async () => {
            await db.transaction("rw", db.cards, db.images, db.cardbacks, async () => {
                const cardsToDelete = await db.cards.bulkGet(uuidsOfNewCards);
                const validCards = cardsToDelete.filter((c): c is CardOption => !!c);

                const imageRefDecrements = new Map<string, number>();
                for (const card of validCards) {
                    if (card.imageId && !isCardbackId(card.imageId)) {
                        imageRefDecrements.set(card.imageId, (imageRefDecrements.get(card.imageId) || 0) + 1);
                    }
                }

                await db.cards.bulkDelete(uuidsOfNewCards);

                if (imageRefDecrements.size > 0) {
                    const imageIds = Array.from(imageRefDecrements.keys());
                    const images = await db.images.bulkGet(imageIds);
                    const imageUpdates = [];
                    const imagesToDelete = [];

                    for (let i = 0; i < imageIds.length; i++) {
                        const img = images[i];
                        if (img) {
                            const dec = imageRefDecrements.get(imageIds[i]) || 0;
                            const newRef = img.refCount - dec;
                            if (newRef > 0) imageUpdates.push({ key: imageIds[i], changes: { refCount: newRef } });
                            else imagesToDelete.push(imageIds[i]);
                        }
                    }
                    if (imageUpdates.length > 0) await db.images.bulkUpdate(imageUpdates);
                    if (imagesToDelete.length > 0) await db.images.bulkDelete(imagesToDelete);
                }

                await rebalanceCardOrders(useProjectStore.getState().currentProjectId ?? undefined);
            });
        },
        redo: async () => {
            // Re-run the bulk duplicate
            await undoableDuplicateCardsBatch(sourceUuids);
        },
    });

    return newUuidsResult;
}

/**
 * Adds cards with undo support.
 * Tracks all added card UUIDs so they can be deleted on undo.
 * @param cardsData The card data to add
 * @param options.startOrder Explicit starting order for the first card. If provided, cards will be ordered sequentially from this value.
 */
export async function undoableAddCards(
    cardsData: Array<Omit<CardOption, "uuid" | "order"> & { order?: number; imageId?: string }>,
    options?: { startOrder?: number }
): Promise<CardOption[]> {
    if (cardsData.length === 0) return [];

    // Perform the addition
    const addedCards = await addCards(cardsData, options);

    if (addedCards.length === 0) return [];

    // Capture added card UUIDs and image info
    const addedUuids = addedCards.map((c) => c.uuid);
    const addedImageIds = [...new Set(addedCards.map((c) => c.imageId).filter(Boolean))] as string[];

    // Capture source URLs for images before any undo might delete them
    // This is needed because redo needs to re-fetch images using their original URLs
    const imageSourceUrls = new Map<string, string>();
    const existingImages = await db.images.bulkGet(addedImageIds);
    for (let i = 0; i < addedImageIds.length; i++) {
        const image = existingImages[i];
        const imageId = addedImageIds[i];
        if (image?.sourceUrl) {
            imageSourceUrls.set(imageId, image.sourceUrl);
        } else if (image?.imageUrls?.[0]) {
            imageSourceUrls.set(imageId, image.imageUrls[0]);
        }
    }

    // Create linked back cards for all added front cards (cards without linkedFrontId)
    const frontCards = addedCards.filter(c => !c.linkedFrontId);
    const defaultCardbackId = useSettingsStore.getState().defaultCardbackId;
    const defaultCardback = BUILTIN_CARDBACKS.find(cb => cb.id === defaultCardbackId);
    const defaultCardbackName = defaultCardback?.name || 'Default';
    const hasBuiltInBleed = defaultCardback?.hasBuiltInBleed ?? false;

    // Create linked back cards for all added front cards using bulk operation
    const linkedBackUuids = await createLinkedBackCardsBulk(
        frontCards.map(frontCard => ({
            frontUuid: frontCard.uuid,
            backImageId: defaultCardbackId,
            backName: defaultCardbackName,
            options: { hasBuiltInBleed, usesDefaultCardback: true },
        }))
    );

    // Record the action for undo
    useUndoRedoStore.getState().pushAction({
        type: "ADD_CARDS",
        description: addedCards.length === 1
            ? `Add "${addedCards[0].name}"`
            : `Add ${addedCards.length} cards`,
        undo: async () => {
            // Delete all added cards AND their linked back cards using bulk operations
            await db.transaction("rw", db.cards, db.images, db.cardbacks, async () => {
                // Gather all cards to delete
                const allUuidsToDelete = [...linkedBackUuids, ...addedUuids];
                const allCards = await db.cards.bulkGet(allUuidsToDelete);

                // Collect image refs to decrement (cardbacks don't need ref counting)
                const imageRefDecrements = new Map<string, number>();
                const imagesToDelete: string[] = [];

                for (const card of allCards) {
                    if (card?.imageId) {
                        // Only track refs for non-cardback images
                        if (!isCardbackId(card.imageId)) {
                            imageRefDecrements.set(card.imageId, (imageRefDecrements.get(card.imageId) || 0) + 1);
                        }
                    }
                }

                // Update regular images (cardbacks don't need ref counting)
                const imageIds = Array.from(imageRefDecrements.keys());
                const images = await db.images.bulkGet(imageIds);
                const imageUpdates: { key: string; changes: { refCount: number } }[] = [];

                for (let i = 0; i < imageIds.length; i++) {
                    const image = images[i];
                    const imageId = imageIds[i];
                    const decrement = imageRefDecrements.get(imageId) || 0;

                    if (image) {
                        const newRefCount = image.refCount - decrement;
                        if (newRefCount > 0) {
                            imageUpdates.push({ key: imageId, changes: { refCount: newRefCount } });
                        } else {
                            imagesToDelete.push(imageId);
                        }
                    }
                }

                // Perform bulk operations
                if (allUuidsToDelete.length > 0) {
                    await db.cards.bulkDelete(allUuidsToDelete);
                }
                if (imageUpdates.length > 0) {
                    await db.images.bulkUpdate(imageUpdates);
                }
                if (imagesToDelete.length > 0) {
                    await db.images.bulkDelete(imagesToDelete);
                }
            });
        },
        redo: async () => {
            // Re-add cards with original data
            // Restore image refs using bulk operations
            const existingImages = await db.images.bulkGet(addedImageIds);
            const imageUpdates: { key: string; changes: { refCount: number } }[] = [];
            const missingImageIds: string[] = [];

            for (let i = 0; i < addedImageIds.length; i++) {
                const image = existingImages[i];
                const imageId = addedImageIds[i];
                if (image) {
                    imageUpdates.push({ key: imageId, changes: { refCount: image.refCount + 1 } });
                } else {
                    missingImageIds.push(imageId);
                }
            }

            if (imageUpdates.length > 0) {
                await db.images.bulkUpdate(imageUpdates);
            }

            // Recreate missing images using their original source URLs (with retry for transient failures)
            for (const imageId of missingImageIds) {
                const sourceUrl = imageSourceUrls.get(imageId);
                const urlToFetch = sourceUrl || imageId; // Fallback to imageId as URL

                // Retry up to 3 times with exponential backoff
                for (let attempt = 0; attempt < 3; attempt++) {
                    try {
                        await addRemoteImage([urlToFetch], 1);
                        break; // Success - exit retry loop
                    } catch (e) {
                        if (attempt === 2) {
                            console.error(`[Redo] Failed to re-fetch image after 3 attempts: ${urlToFetch}`, e);
                            // Continue with other images rather than failing entire redo
                        } else {
                            await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                        }
                    }
                }
            }

            const redoAddedCards = await addCards(cardsData);
            // Re-create linked back cards for front cards using bulk
            const redoFrontCards = redoAddedCards.filter(c => !c.linkedFrontId);
            await createLinkedBackCardsBulk(
                redoFrontCards.map(frontCard => ({
                    frontUuid: frontCard.uuid,
                    backImageId: defaultCardbackId,
                    backName: defaultCardbackName,
                    options: { hasBuiltInBleed, usesDefaultCardback: true },
                }))
            );
        },
    });

    return addedCards;
}

/**
 * Reorders cards with undo support.
 * Captures the old order so it can be restored on undo.
 */
export async function undoableReorderCards(
    cardUuid: string,
    oldOrder: number,
    newOrder: number
): Promise<void> {
    // 1. Identify partners
    const card = await db.cards.get(cardUuid);
    if (!card) return;

    const uuidsToUpdate = [cardUuid];
    if (card.linkedBackId) uuidsToUpdate.push(card.linkedBackId);
    if (card.linkedFrontId) uuidsToUpdate.push(card.linkedFrontId);

    // 2. Perform the update
    await db.transaction("rw", db.cards, async () => {
        for (const uuid of uuidsToUpdate) {
            await db.cards.update(uuid, { order: newOrder });
        }
    });

    // 3. Record the action for undo
    useUndoRedoStore.getState().pushAction({
        type: "REORDER_CARDS",
        description: "Reorder cards",
        undo: async () => {
            // Restore the original order
            await db.transaction("rw", db.cards, async () => {
                for (const uuid of uuidsToUpdate) {
                    await db.cards.update(uuid, { order: oldOrder });
                }
                // Rebalance to clean up
                await rebalanceCardOrders(useProjectStore.getState().currentProjectId ?? undefined);
            });
        },
        redo: async () => {
            // Apply the new order again
            await db.transaction("rw", db.cards, async () => {
                for (const uuid of uuidsToUpdate) {
                    await db.cards.update(uuid, { order: newOrder });
                }
                await rebalanceCardOrders(useProjectStore.getState().currentProjectId ?? undefined);
            });
        },
    });
}

/**
 * Reorders multiple cards with undo support.
 * Captures the old order for all cards so they can be restored on undo.
 */
export async function undoableReorderMultipleCards(
    adjustments: { uuid: string; oldOrder: number; newOrder: number }[]
): Promise<void> {
    if (adjustments.length === 0) return;

    // 1. Robustness: Ensure partners (Back/Front) are updated together.
    // Fetch all involved cards to check for linked partners.
    const inputUuids = adjustments.map(a => a.uuid);
    const cards = await db.cards.bulkGet(inputUuids);

    const adjMap = new Map(adjustments.map(a => [a.uuid, a]));
    const finalAdjustments = [...adjustments];

    // Identify missing partners
    const extraUuidsToFetch: string[] = [];
    cards.forEach(card => {
        if (!card) return;
        const partnerId = card.linkedBackId || card.linkedFrontId;
        // If partner exists but is not in the update list, we must add it
        if (partnerId && !adjMap.has(partnerId)) {
            extraUuidsToFetch.push(partnerId);
        }
    });

    // Fetch and create adjustments for missing partners
    if (extraUuidsToFetch.length > 0) {
        const extraCards = await db.cards.bulkGet(extraUuidsToFetch);
        extraCards.forEach(card => {
            if (!card) return;
            // Find the adjustment of the source partner that triggered this
            const partnerId = card.linkedFrontId || card.linkedBackId;
            if (partnerId && adjMap.has(partnerId)) {
                const sourceAdj = adjMap.get(partnerId)!;
                finalAdjustments.push({
                    uuid: card.uuid,
                    oldOrder: card.order, // Capture current state for undo
                    newOrder: sourceAdj.newOrder // Apply same new order
                });
            }
        });
    }

    // 2. Perform the updates
    await db.transaction("rw", db.cards, async () => {
        for (const adj of finalAdjustments) {
            await db.cards.update(adj.uuid, { order: adj.newOrder });
        }
    });

    // 3. Record the action for undo
    useUndoRedoStore.getState().pushAction({
        type: "REORDER_MULTIPLE_CARDS",
        description: `Reorder ${adjustments.length} cards`,
        undo: async () => {
            // Restore the original order for each card
            await db.transaction("rw", db.cards, async () => {
                for (const adj of finalAdjustments) {
                    await db.cards.update(adj.uuid, { order: adj.oldOrder });
                }
            });
            // Rebalance to clean up
            await rebalanceCardOrders(useProjectStore.getState().currentProjectId ?? undefined);
        },
        redo: async () => {
            // Apply the new order for each card
            await db.transaction("rw", db.cards, async () => {
                for (const adj of finalAdjustments) {
                    await db.cards.update(adj.uuid, { order: adj.newOrder });
                }
            });
            await rebalanceCardOrders(useProjectStore.getState().currentProjectId ?? undefined);
        },
    });
}



/**
 * Undoable card bleed settings update.
 * Captures old bleed settings before update for restoration on undo.
 */
export async function undoableUpdateCardBleedSettings(
    cardUuids: string[],
    newSettings: {
        hasBuiltInBleed?: boolean;
        bleedMode?: 'generate' | 'existing' | 'none';
        existingBleedMm?: number;
        generateBleedMm?: number;
    }
): Promise<void> {
    if (cardUuids.length === 0) return;

    // Get selected cards
    const selectedCards = await db.cards.where('uuid').anyOf(cardUuids).toArray();
    if (selectedCards.length === 0) return;

    // Find ALL cards that share the same imageId (for "apply to all" behavior)
    const imageIds = new Set(selectedCards.map(c => c.imageId).filter((id): id is string => !!id));
    const allAffectedCards: CardOption[] = [];
    for (const imageId of imageIds) {
        const cardsWithImage = await db.cards.where('imageId').equals(imageId).toArray();
        allAffectedCards.push(...cardsWithImage);
    }

    // Capture old settings for ALL affected cards (for proper undo)
    const oldSettings: Map<string, {
        hasBuiltInBleed?: boolean;
        bleedMode?: CardOption['bleedMode'];
        existingBleedMm?: number;
        generateBleedMm?: number;
    }> = new Map();
    for (const card of allAffectedCards) {
        oldSettings.set(card.uuid, {
            hasBuiltInBleed: card.hasBuiltInBleed,
            bleedMode: card.bleedMode,
            existingBleedMm: card.existingBleedMm,
            generateBleedMm: card.generateBleedMm,
        });
    }

    const cardName = selectedCards.length === 1 ? selectedCards[0]?.name || 'card' : `${selectedCards.length} cards`;
    const allAffectedUuids = allAffectedCards.map(c => c.uuid);

    // Perform the update - apply to ALL cards sharing the same imageId
    await db.transaction("rw", db.cards, db.images, db.cardbacks, async () => {
        const changes: Partial<CardOption> = {
            hasBuiltInBleed: newSettings.hasBuiltInBleed,
            bleedMode: newSettings.bleedMode,
            existingBleedMm: newSettings.existingBleedMm,
            generateBleedMm: newSettings.generateBleedMm,
        };

        // Update ALL affected cards (not just selected)
        await db.cards.bulkUpdate(
            allAffectedUuids.map((uuid) => ({
                key: uuid,
                changes,
            }))
        );

        // Invalidate image/cardback cache to trigger regeneration
        for (const imageId of imageIds) {
            const invalidation = {
                generatedBleedMode: undefined,
                generatedHasBuiltInBleed: undefined,
            };
            // Update the correct table based on ID type
            if (isCardbackId(imageId)) {
                await db.cardbacks.update(imageId, invalidation);
            } else {
                await db.images.update(imageId, invalidation);
            }
        }
    });

    // Record the action for undo
    useUndoRedoStore.getState().pushAction({
        type: "UPDATE_BLEED_SETTINGS",
        description: `Change bleed settings for "${cardName}"`,
        undo: async () => {
            // Restore old settings for ALL affected cards
            await db.transaction("rw", db.cards, db.images, db.cardbacks, async () => {
                for (const [uuid, settings] of oldSettings) {
                    await db.cards.update(uuid, {
                        hasBuiltInBleed: settings.hasBuiltInBleed,
                        bleedMode: settings.bleedMode,
                        existingBleedMm: settings.existingBleedMm,
                        generateBleedMm: settings.generateBleedMm,
                    });
                }
                // Invalidate image cache to trigger regeneration
                for (const imageId of imageIds) {
                    await db.images.update(imageId, {
                        generatedBleedMode: undefined,
                        generatedHasBuiltInBleed: undefined,
                    });
                }
            });
        },
        redo: async () => {
            // Re-apply new settings to ALL affected cards
            await db.transaction("rw", db.cards, db.images, db.cardbacks, async () => {
                const changes: Partial<CardOption> = {
                    hasBuiltInBleed: newSettings.hasBuiltInBleed,
                    bleedMode: newSettings.bleedMode,
                    existingBleedMm: newSettings.existingBleedMm,
                    generateBleedMm: newSettings.generateBleedMm,
                };

                await db.cards.bulkUpdate(
                    allAffectedUuids.map((uuid) => ({
                        key: uuid,
                        changes,
                    }))
                );
                // Invalidate image cache to trigger regeneration
                for (const imageId of imageIds) {
                    await db.images.update(imageId, {
                        generatedBleedMode: undefined,
                        generatedHasBuiltInBleed: undefined,
                    });
                }
            });
        },
    });
}

/**
 * Changes cardback for one or more front cards with undo support.
 * This is an atomic operation - all changes are undone/redone together.
 */
export async function undoableChangeCardback(
    frontCardUuids: string[],
    newCardbackId: string,
    newCardbackName: string,
    hasBuiltInBleed: boolean = true
): Promise<void> {
    if (frontCardUuids.length === 0) return;

    // Get front cards
    const frontCards = await db.cards.where('uuid').anyOf(frontCardUuids).toArray();
    if (frontCards.length === 0) return;

    // Capture old state for all affected back cards
    type OldBackState = {
        frontUuid: string;
        backUuid?: string;
        oldImageId?: string;
        oldName?: string;
        oldUsesDefaultCardback?: boolean;
        hadBackCard: boolean;
    };
    const oldStates: OldBackState[] = [];

    // Batch fetch all back cards at once for performance
    const backCardUuids = frontCards
        .filter(fc => fc.linkedBackId)
        .map(fc => fc.linkedBackId!);
    const backCardsMap = new Map<string, CardOption>();
    if (backCardUuids.length > 0) {
        const backCards = await db.cards.bulkGet(backCardUuids);
        for (const backCard of backCards) {
            if (backCard) backCardsMap.set(backCard.uuid, backCard);
        }
    }

    for (const frontCard of frontCards) {
        if (frontCard.linkedBackId) {
            const backCard = backCardsMap.get(frontCard.linkedBackId);
            if (backCard) {
                oldStates.push({
                    frontUuid: frontCard.uuid,
                    backUuid: backCard.uuid,
                    oldImageId: backCard.imageId,
                    oldName: backCard.name,
                    oldUsesDefaultCardback: backCard.usesDefaultCardback,
                    hadBackCard: true,
                });
            }
        } else {
            oldStates.push({
                frontUuid: frontCard.uuid,
                hadBackCard: false,
            });
        }
    }

    // Perform the cardback changes
    // Separate cards into those with existing backs and those that need new backs
    const existingBackCards: CardOption[] = [];
    const needsNewBackCards: typeof frontCards = [];

    for (const frontCard of frontCards) {
        if (frontCard.linkedBackId) {
            const existingBack = backCardsMap.get(frontCard.linkedBackId);
            if (existingBack) {
                existingBackCards.push(existingBack);
            }
        } else {
            needsNewBackCards.push(frontCard);
        }
    }

    // Update existing back cards - changeCardArtwork handles image refs
    for (const existingBack of existingBackCards) {
        await changeCardArtwork(
            existingBack.imageId,
            newCardbackId,
            existingBack,
            false,
            newCardbackName,
            undefined,
            undefined,
            hasBuiltInBleed
        );
    }

    // Batch update usesDefaultCardback for all existing back cards
    if (existingBackCards.length > 0) {
        await db.cards.bulkUpdate(
            existingBackCards.map(c => ({
                key: c.uuid,
                changes: { usesDefaultCardback: false },
            }))
        );
    }

    // Create new back cards using bulk operation
    if (needsNewBackCards.length > 0) {
        await createLinkedBackCardsBulk(
            needsNewBackCards.map(fc => ({
                frontUuid: fc.uuid,
                backImageId: newCardbackId,
                backName: newCardbackName,
                options: {
                    hasBuiltInBleed,
                    usesDefaultCardback: false,
                },
            }))
        );
    }

    // Build description
    const cardNames = frontCards.map(c => c.name);
    const uniqueNames = [...new Set(cardNames)];
    const description = frontCards.length === 1
        ? `Change cardback for "${frontCards[0].name}"`
        : uniqueNames.length === 1
            ? `Change cardback for ${frontCards.length} "${uniqueNames[0]}" cards`
            : `Change cardback for ${frontCards.length} cards`;

    // Record the action for undo
    useUndoRedoStore.getState().pushAction({
        type: "CHANGE_CARDBACK",
        description,
        undo: async () => {
            await db.transaction("rw", db.cards, db.images, db.cardbacks, async () => {
                for (const oldState of oldStates) {
                    if (oldState.hadBackCard && oldState.backUuid && oldState.oldImageId) {
                        // Restore old cardback
                        const backCard = await db.cards.get(oldState.backUuid);
                        if (backCard) {
                            await changeCardArtwork(
                                backCard.imageId,
                                oldState.oldImageId,
                                backCard,
                                false,
                                oldState.oldName,
                                undefined,
                                undefined,
                                true // Assume old cardback had bleed
                            );
                            await db.cards.update(oldState.backUuid, {
                                usesDefaultCardback: oldState.oldUsesDefaultCardback,
                            });
                        }
                    } else {
                        // Card didn't have a back card - delete the newly created one
                        const frontCard = await db.cards.get(oldState.frontUuid);
                        if (frontCard?.linkedBackId) {
                            const backCard = await db.cards.get(frontCard.linkedBackId);
                            if (backCard) {
                                // Decrement image ref for non-cardback images
                                if (backCard.imageId && !isCardbackId(backCard.imageId)) {
                                    const image = await db.images.get(backCard.imageId);
                                    if (image && image.refCount > 1) {
                                        await db.images.update(backCard.imageId, { refCount: image.refCount - 1 });
                                    } else if (image) {
                                        await db.images.delete(backCard.imageId);
                                    }
                                }
                                await db.cards.delete(frontCard.linkedBackId);
                            }
                            await db.cards.update(oldState.frontUuid, { linkedBackId: undefined });
                        }
                    }
                }
            });
        },
        redo: async () => {
            // Re-apply cardback changes
            for (const frontCard of frontCards) {
                const currentFront = await db.cards.get(frontCard.uuid);
                if (!currentFront) continue;

                if (currentFront.linkedBackId) {
                    const existingBack = await db.cards.get(currentFront.linkedBackId);
                    if (existingBack) {
                        await changeCardArtwork(
                            existingBack.imageId,
                            newCardbackId,
                            existingBack,
                            false,
                            newCardbackName,
                            undefined,
                            undefined,
                            hasBuiltInBleed
                        );
                        await db.cards.update(existingBack.uuid, { usesDefaultCardback: false });
                    }
                } else {
                    await createLinkedBackCard(currentFront.uuid, newCardbackId, newCardbackName, {
                        hasBuiltInBleed,
                        usesDefaultCardback: false,
                    });
                }
            }
        },
    });
}
