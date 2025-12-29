/**
 * CardEditorModalWrapper
 * 
 * Wrapper component that connects CardEditorModal to the store.
 */

import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CardEditorModal } from './CardEditorModal';
import { useCardEditorModalStore } from '@/store';
import { useSettingsStore } from '@/store/settings';
import { db, type Image } from '@/db';
import type { CardOverrides } from '../../../../shared/types';
import { preRenderEffect, queueBulkPreRender } from '@/helpers/effectCache';
import { hasActiveAdjustments } from '@/helpers/adjustmentUtils';

export function CardEditorModalWrapper() {
    const open = useCardEditorModalStore((state) => state.open);
    const storeCard = useCardEditorModalStore((state) => state.card);
    const storeImage = useCardEditorModalStore((state) => state.image);
    const storeBackCard = useCardEditorModalStore((state) => state.backCard);
    const storeBackImage = useCardEditorModalStore((state) => state.backImage);
    const selectedCardUuids = useCardEditorModalStore((state) => state.selectedCardUuids);
    const initialFace = useCardEditorModalStore((state) => state.initialFace);
    const closeModal = useCardEditorModalStore((state) => state.closeModal);

    // Get global DPI setting for cardback display
    const globalDpi = useSettingsStore((state) => state.dpi);

    // Use live query to get fresh card data from db (in case overrides changed)
    const liveCard = useLiveQuery(
        () => storeCard ? db.cards.get(storeCard.uuid) : undefined,
        [storeCard?.uuid]
    );

    // Use live query for fresh image data
    const liveImage = useLiveQuery(
        () => liveCard?.imageId ? db.images.get(liveCard.imageId) : undefined,
        [liveCard?.imageId]
    );

    // Live query for back card (needed for per-face overrides)
    const liveBackCard = useLiveQuery(
        () => storeBackCard ? db.cards.get(storeBackCard.uuid) : undefined,
        [storeBackCard?.uuid]
    );

    // Live query for back image - check both images and cardbacks tables
    const liveBackImage = useLiveQuery(
        async () => {
            if (!liveBackCard?.imageId) return undefined;
            // First try images table
            const image = await db.images.get(liveBackCard.imageId);
            if (image) return image;
            // Fall back to cardbacks table for default cardbacks
            const cardback = await db.cardbacks.get(liveBackCard.imageId);
            if (cardback) {
                // Map cardback to Image-like structure for editor preview
                // For cardbacks, displayBlob is already processed/trimmed, so use it as base
                return {
                    id: cardback.id,
                    displayBlob: cardback.displayBlob,
                    exportBlob: cardback.exportBlob,
                    baseDisplayBlob: cardback.displayBlob, // Use processed blob as base
                    baseExportBlob: cardback.exportBlob,
                    // Display at 300 DPI, export at global DPI setting
                    displayDpi: 300,
                    exportDpi: globalDpi,
                } as Image;
            }
            return undefined;
        },
        [liveBackCard?.imageId]
    );

    // Prefer live data, fall back to store data
    const card = liveCard ?? storeCard;
    const image = liveImage ?? storeImage;
    const backCard = liveBackCard ?? storeBackCard;
    const backImage = liveBackImage ?? storeBackImage;

    // Determine if this is a multi-select edit
    const isMultiSelect = selectedCardUuids.length > 1;

    const handleApply = useCallback(async (
        cardUuid: string,
        overrides: CardOverrides | undefined,
        _customBlob?: Blob
    ) => {
        // Apply overrides to the specific card
        await db.cards.update(cardUuid, { overrides });

        // Fire-and-forget pre-render for export cache
        if (overrides && hasActiveAdjustments(overrides)) {
            const cardRecord = await db.cards.get(cardUuid);
            const imageRecord = cardRecord?.imageId ? await db.images.get(cardRecord.imageId) : undefined;
            if (cardRecord && imageRecord?.exportBlob) {
                preRenderEffect(cardRecord, imageRecord.exportBlob).catch(console.error);
            }
        }
    }, []);

    const handleApplyToAll = useCallback(async (overrides: CardOverrides | undefined) => {
        // Apply to all cards in a single transaction to avoid cascading re-renders
        const allCards = await db.transaction('rw', db.cards, async () => {
            const cards = await db.cards.toArray();
            await db.cards.bulkPut(cards.map(c => ({ ...c, overrides })));
            return cards;
        });

        // Queue pre-rendering in background using requestIdleCallback (non-blocking)
        if (overrides && hasActiveAdjustments(overrides)) {
            // Gather image data in the next event loop tick
            setTimeout(async () => {
                const imageIds = [...new Set(allCards.map(c => c.imageId).filter(Boolean))] as string[];
                const images = await db.images.bulkGet(imageIds);
                const imageMap = new Map(images.filter(Boolean).map(img => [img!.id, img!]));

                const tasks = allCards
                    .filter(c => c.imageId && imageMap.get(c.imageId)?.exportBlob)
                    .map(c => ({
                        card: { ...c, overrides },
                        exportBlob: imageMap.get(c.imageId!)!.exportBlob!,
                    }));
                queueBulkPreRender(tasks);
            }, 0);
        }
    }, []);

    const handleApplyToSelected = useCallback(async (uuids: string[], overrides: CardOverrides | undefined) => {
        // Apply to selected cards in a single transaction to avoid cascading re-renders
        const selectedCards = await db.transaction('rw', db.cards, async () => {
            const cards = await db.cards.where('uuid').anyOf(uuids).toArray();
            await db.cards.bulkPut(cards.map(c => ({ ...c, overrides })));
            return cards;
        });

        // Queue pre-rendering in background using requestIdleCallback (non-blocking)
        if (overrides && hasActiveAdjustments(overrides)) {
            // Gather image data in the next event loop tick
            setTimeout(async () => {
                const imageIds = [...new Set(selectedCards.map(c => c.imageId).filter(Boolean))] as string[];
                const images = await db.images.bulkGet(imageIds);
                const imageMap = new Map(images.filter(Boolean).map(img => [img!.id, img!]));

                const tasks = selectedCards
                    .filter(c => c.imageId && imageMap.get(c.imageId)?.exportBlob)
                    .map(c => ({
                        card: { ...c, overrides },
                        exportBlob: imageMap.get(c.imageId!)!.exportBlob!,
                    }));
                queueBulkPreRender(tasks);
            }, 0);
        }
    }, []);

    if (!card) return null;

    return (
        <CardEditorModal
            key={`${card.uuid}-${initialFace}`}  // Force remount when card OR initialFace changes
            isOpen={open}
            onClose={closeModal}
            card={card}
            image={image}
            backCard={backCard}
            backImage={backImage ?? undefined}
            initialFace={initialFace}
            onApply={handleApply}
            onApplyToAll={handleApplyToAll}
            onApplyToSelected={handleApplyToSelected}
            selectedCardUuids={selectedCardUuids}
            selectedCount={isMultiSelect ? selectedCardUuids.length : undefined}
        />
    );
}
