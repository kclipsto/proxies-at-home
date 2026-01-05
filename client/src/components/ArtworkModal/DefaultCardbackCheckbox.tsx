import { Checkbox, Label } from "flowbite-react";
import { db } from "@/db";
import { useSelectionStore } from "@/store/selection";
import { undoableChangeCardback } from "@/helpers/undoableActions";
import type { CardOption } from "../../../../shared/types";
import type { CardbackOption } from "@/helpers/cardbackLibrary";

export interface DefaultCardbackCheckboxProps {
    linkedBackCard: CardOption;
    modalCard: CardOption | null;
    defaultCardbackId: string;
    cardbackOptions: CardbackOption[];
    onClose: () => void;
}

/**
 * Checkbox for toggling whether a card uses the default cardback.
 * When checked, switches to default cardback. When unchecked, just removes the flag.
 */
export function DefaultCardbackCheckbox({
    linkedBackCard,
    modalCard,
    defaultCardbackId,
    cardbackOptions,
    onClose,
}: DefaultCardbackCheckboxProps) {
    const handleChange = async (checked: boolean) => {
        const selectedCards = useSelectionStore.getState().selectedCards;
        const isMultiSelect = selectedCards.size > 1 && modalCard && selectedCards.has(modalCard.uuid);

        if (checked) {
            const defaultCb = cardbackOptions.find(cb => cb.id === defaultCardbackId);
            if (!defaultCb) return;

            let frontCardUuids: string[];
            if (isMultiSelect) {
                const selectedUuids = Array.from(selectedCards);
                const cardsToUpdate = await db.cards.bulkGet(selectedUuids);
                frontCardUuids = cardsToUpdate
                    .filter((c): c is CardOption => c !== undefined && !c.linkedFrontId)
                    .map(c => c.uuid);
            } else if (modalCard) {
                frontCardUuids = [modalCard.uuid];
            } else {
                return;
            }

            await undoableChangeCardback(
                frontCardUuids,
                defaultCardbackId,
                defaultCb.name,
                defaultCb.hasBuiltInBleed ?? false
            );

            // Bulk update all back cards to use default cardback
            const frontCards = await db.cards.bulkGet(frontCardUuids);
            const backCardUuids = frontCards
                .filter((c): c is CardOption => c !== undefined && c.linkedBackId !== undefined)
                .map(c => c.linkedBackId!);

            if (backCardUuids.length > 0) {
                await db.cards.bulkUpdate(
                    backCardUuids.map(uuid => ({
                        key: uuid,
                        changes: { usesDefaultCardback: true },
                    }))
                );
            }

            // Auto-flip card to show the back face
            if (modalCard?.uuid) {
                useSelectionStore.getState().setFlipped([modalCard.uuid], true);
            }

            onClose();
        } else {
            if (isMultiSelect) {
                const selectedUuids = Array.from(selectedCards);
                const cards = await db.cards.bulkGet(selectedUuids);
                // Collect back card UUIDs for bulk update
                const backCardUuids = cards
                    .filter((c): c is CardOption => c !== undefined && !c.linkedFrontId && c.linkedBackId !== undefined)
                    .map(c => c.linkedBackId!);

                if (backCardUuids.length > 0) {
                    await db.cards.bulkUpdate(
                        backCardUuids.map(uuid => ({
                            key: uuid,
                            changes: { usesDefaultCardback: false },
                        }))
                    );
                }
            } else {
                await db.cards.update(linkedBackCard.uuid, { usesDefaultCardback: false });
            }
        }
    };

    return (
        <div className="col-span-full mb-2">
            <div className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <Checkbox
                    id="use-default-cardback"
                    checked={linkedBackCard.usesDefaultCardback ?? false}
                    onChange={(e) => handleChange(e.target.checked)}
                    className="size-5"
                />
                <Label htmlFor="use-default-cardback" className="cursor-pointer dark:text-white">
                    Use default cardback (follows when default changes)
                </Label>
            </div>
        </div>
    );
}
