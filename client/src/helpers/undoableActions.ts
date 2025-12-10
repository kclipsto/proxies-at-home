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
} from "./dbUtils";
import { useUndoRedoStore } from "@/store/undoRedo";

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

            // Restore or increment image ref
            if (card.imageId && imageData) {
                const existingImage = await db.images.get(card.imageId);
                if (existingImage) {
                    await db.images.update(card.imageId, {
                        refCount: existingImage.refCount + 1,
                    });
                } else {
                    await db.images.add({ ...imageData, refCount: 1 });
                }
            }
        },
        redo: async () => {
            await deleteCard(card.uuid);
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
 * Adds cards with undo support.
 * Tracks all added card UUIDs so they can be deleted on undo.
 */
export async function undoableAddCards(
    cardsData: Array<Omit<CardOption, "uuid" | "order"> & { imageId?: string }>
): Promise<CardOption[]> {
    if (cardsData.length === 0) return [];

    // Perform the addition
    const addedCards = await addCards(cardsData);

    if (addedCards.length === 0) return [];

    // Capture added card UUIDs and image info
    const addedUuids = addedCards.map((c) => c.uuid);
    const addedImageIds = [...new Set(addedCards.map((c) => c.imageId).filter(Boolean))] as string[];

    // Record the action for undo
    useUndoRedoStore.getState().pushAction({
        type: "ADD_CARDS",
        description: addedCards.length === 1
            ? `Add "${addedCards[0].name}"`
            : `Add ${addedCards.length} cards`,
        undo: async () => {
            // Delete all added cards
            await db.transaction("rw", db.cards, db.images, async () => {
                for (const uuid of addedUuids) {
                    const card = await db.cards.get(uuid);
                    if (card) {
                        await db.cards.delete(uuid);
                        // Decrement image ref
                        if (card.imageId) {
                            const image = await db.images.get(card.imageId);
                            if (image) {
                                if (image.refCount > 1) {
                                    await db.images.update(card.imageId, { refCount: image.refCount - 1 });
                                } else {
                                    await db.images.delete(card.imageId);
                                }
                            }
                        }
                    }
                }
            });
        },
        redo: async () => {
            // Re-add cards with original data but new UUIDs
            // We need to restore the image refs first
            for (const imageId of addedImageIds) {
                const existingImage = await db.images.get(imageId);
                if (existingImage) {
                    await db.images.update(imageId, { refCount: existingImage.refCount + 1 });
                } else {
                    // Image was deleted, try to recreate from card data
                    await addRemoteImage([imageId], 1);
                }
            }
            await addCards(cardsData);
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
    // Record the action for undo
    useUndoRedoStore.getState().pushAction({
        type: "REORDER_CARDS",
        description: "Reorder cards",
        undo: async () => {
            // Restore the original order
            await db.cards.update(cardUuid, { order: oldOrder });
            // Rebalance to clean up
            await rebalanceCardOrders();
        },
        redo: async () => {
            // Apply the new order again
            await db.cards.update(cardUuid, { order: newOrder });
            await rebalanceCardOrders();
        },
    });
}

/**
 * Changes card artwork with undo support.
 */
export async function undoableChangeArtwork(
    oldImageId: string,
    newImageId: string,
    cardToUpdate: CardOption,
    applyToAll: boolean,
    newName?: string,
    newImageUrls?: string[],
    cardMetadata?: Partial<Pick<CardOption, 'set' | 'number' | 'colors' | 'cmc' | 'type_line' | 'rarity' | 'mana_cost' | 'lang'>>
): Promise<void> {
    // Capture old state for the affected cards
    const oldCardsState = applyToAll
        ? await db.cards.where("name").equals(cardToUpdate.name).toArray()
        : [cardToUpdate];

    // Capture old image data
    const oldImages = new Map<string, Image>();
    for (const card of oldCardsState) {
        if (card.imageId && !oldImages.has(card.imageId)) {
            const img = await db.images.get(card.imageId);
            if (img) oldImages.set(card.imageId, img);
        }
    }

    // Perform the artwork change
    await changeCardArtwork(
        oldImageId,
        newImageId,
        cardToUpdate,
        applyToAll,
        newName,
        newImageUrls,
        cardMetadata
    );

    // Record the action for undo
    useUndoRedoStore.getState().pushAction({
        type: "CHANGE_ARTWORK",
        description: `Change artwork for "${cardToUpdate.name}"`,
        undo: async () => {
            // Restore old card states
            await db.transaction("rw", db.cards, db.images, async () => {
                for (const oldCard of oldCardsState) {
                    await db.cards.update(oldCard.uuid, {
                        imageId: oldCard.imageId,
                        name: oldCard.name,
                        set: oldCard.set,
                        number: oldCard.number,
                        colors: oldCard.colors,
                        cmc: oldCard.cmc,
                        type_line: oldCard.type_line,
                        rarity: oldCard.rarity,
                        mana_cost: oldCard.mana_cost,
                        lang: oldCard.lang,
                        isUserUpload: oldCard.isUserUpload,
                    });
                }

                // Restore old image refs
                for (const [imageId, img] of oldImages) {
                    const current = await db.images.get(imageId);
                    if (current) {
                        await db.images.update(imageId, { refCount: current.refCount + oldCardsState.length });
                    } else {
                        await db.images.add({ ...img, refCount: oldCardsState.length });
                    }
                }

                // Decrement new image refs
                const newImage = await db.images.get(newImageId);
                if (newImage) {
                    const newRefCount = newImage.refCount - oldCardsState.length;
                    if (newRefCount > 0) {
                        await db.images.update(newImageId, { refCount: newRefCount });
                    } else {
                        await db.images.delete(newImageId);
                    }
                }
            });
        },
        redo: async () => {
            await changeCardArtwork(
                oldImageId,
                newImageId,
                cardToUpdate,
                applyToAll,
                newName,
                newImageUrls,
                cardMetadata
            );
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
        bleedMode?: 'generate' | 'existing' | 'none';
        existingBleedMm?: number;
        generateBleedMm?: number;
    }
): Promise<void> {
    if (cardUuids.length === 0) return;

    // Capture old settings for all affected cards
    const oldSettings: Map<string, {
        bleedMode?: CardOption['bleedMode'];
        existingBleedMm?: number;
        generateBleedMm?: number;
    }> = new Map();
    const cards = await db.cards.where('uuid').anyOf(cardUuids).toArray();

    for (const card of cards) {
        oldSettings.set(card.uuid, {
            bleedMode: card.bleedMode,
            existingBleedMm: card.existingBleedMm,
            generateBleedMm: card.generateBleedMm,
        });
    }

    const cardName = cards.length === 1 ? cards[0]?.name || 'card' : `${cards.length} cards`;

    // Perform the update - always set all fields to allow resetting to undefined
    await db.transaction("rw", db.cards, async () => {
        const changes: Partial<CardOption> = {
            bleedMode: newSettings.bleedMode,
            existingBleedMm: newSettings.existingBleedMm,
            generateBleedMm: newSettings.generateBleedMm,
        };

        await db.cards.bulkUpdate(
            cardUuids.map((uuid) => ({
                key: uuid,
                changes,
            }))
        );
    });

    // Record the action for undo
    useUndoRedoStore.getState().pushAction({
        type: "UPDATE_BLEED_SETTINGS",
        description: `Change bleed settings for "${cardName}"`,
        undo: async () => {
            // Restore old settings for each card
            await db.transaction("rw", db.cards, async () => {
                for (const [uuid, settings] of oldSettings) {
                    await db.cards.update(uuid, {
                        bleedMode: settings.bleedMode,
                        existingBleedMm: settings.existingBleedMm,
                        generateBleedMm: settings.generateBleedMm,
                    });
                }
            });
        },
        redo: async () => {
            // Re-apply new settings
            await db.transaction("rw", db.cards, async () => {
                const changes: Partial<CardOption> = {
                    bleedMode: newSettings.bleedMode,
                    existingBleedMm: newSettings.existingBleedMm,
                    generateBleedMm: newSettings.generateBleedMm,
                };

                await db.cards.bulkUpdate(
                    cardUuids.map((uuid) => ({
                        key: uuid,
                        changes,
                    }))
                );
            });
        },
    });
}
