import { useState, useEffect } from "react";
import { CardbackTile } from "./CardbackTile";
import { DefaultCardbackCheckbox } from "./DefaultCardbackCheckbox";
import { db } from "@/db";
import { getAllCardbacks, invalidateCardbackUrl, type CardbackOption } from "@/helpers/cardbackLibrary";
import type { CardOption } from "../../../../shared/types";

// Local storage key for "don't show again" preference
const CARDBACK_DELETE_CONFIRM_KEY = "cardback-delete-confirm-disabled";

export interface CardbackLibraryProps {
    cardbackOptions: CardbackOption[];
    setCardbackOptions: (options: CardbackOption[]) => void;
    linkedBackCard: CardOption | undefined;
    modalCard: CardOption | null;
    defaultCardbackId: string;
    onSelectCardback: (id: string, name: string) => void;
    onSetAsDefaultCardback: (id: string, name: string) => void;
    onClose: () => void;
    onRequestDelete: (cardbackId: string, cardbackName: string) => void;
    onExecuteDelete: (cardbackId: string) => Promise<void>;
}

/**
 * Renders the cardback library grid with optional default checkbox.
 * Manages its own editing state internally.
 * Delete confirmation is handled by parent component via onRequestDelete.
 */
export function CardbackLibrary({
    cardbackOptions,
    setCardbackOptions,
    linkedBackCard,
    modalCard,
    defaultCardbackId,
    onSelectCardback,
    onSetAsDefaultCardback,
    onClose,
    onRequestDelete,
    onExecuteDelete,
}: CardbackLibraryProps) {
    const [editingCardbackId, setEditingCardbackId] = useState<string | null>(null);
    const [editingCardbackName, setEditingCardbackName] = useState<string>("");
    const [skipConfirmation, setSkipConfirmation] = useState(false);

    // Load "don't show again" preference from localStorage
    useEffect(() => {
        const stored = localStorage.getItem(CARDBACK_DELETE_CONFIRM_KEY);
        if (stored === "true") {
            setSkipConfirmation(true);
        }
    }, []);

    const handleDelete = async (cardbackId: string) => {
        const cardback = cardbackOptions.find(cb => cb.id === cardbackId);
        const cardbackName = cardback?.name || 'Unknown';

        if (skipConfirmation) {
            // Skip confirmation, delete immediately
            await onExecuteDelete(cardbackId);
        } else {
            // Request confirmation from parent
            onRequestDelete(cardbackId, cardbackName);
        }
    };

    const handleStartEdit = (cardbackId: string, name: string) => {
        setEditingCardbackId(cardbackId);
        setEditingCardbackName(name);
    };

    const handleSaveEdit = async (cardbackId: string) => {
        if (editingCardbackName.trim()) {
            // Use displayName field to preserve sourceUrl for image source
            await db.cardbacks.update(cardbackId, { displayName: editingCardbackName.trim() });
            // Revoke old blob URLs before fetching new ones to prevent memory leak
            invalidateCardbackUrl(cardbackId);
            getAllCardbacks().then(setCardbackOptions);
        }
        setEditingCardbackId(null);
    };

    return (
        <>
            {linkedBackCard && (
                <DefaultCardbackCheckbox
                    linkedBackCard={linkedBackCard}
                    modalCard={modalCard}
                    defaultCardbackId={defaultCardbackId}
                    cardbackOptions={cardbackOptions}
                    onClose={onClose}
                />
            )}
            {cardbackOptions.map((cardback) => {
                const isDefault = defaultCardbackId === cardback.id;
                const isSelected = linkedBackCard?.imageId === cardback.id;
                return (
                    <CardbackTile
                        key={cardback.id}
                        id={cardback.id}
                        name={cardback.name}
                        imageUrl={cardback.imageUrl}
                        source={cardback.source}
                        isSelected={isSelected}
                        isDefault={isDefault}
                        isDeleting={false}
                        isEditing={editingCardbackId === cardback.id}
                        editingName={editingCardbackName}
                        hasBuiltInBleed={cardback.hasBuiltInBleed}
                        onSelect={() => onSelectCardback(cardback.id, cardback.name)}
                        onSetAsDefault={() => onSetAsDefaultCardback(cardback.id, cardback.name)}
                        onDelete={() => handleDelete(cardback.id)}
                        onStartEdit={() => handleStartEdit(cardback.id, cardback.name)}
                        onEditNameChange={setEditingCardbackName}
                        onSaveEdit={() => handleSaveEdit(cardback.id)}
                        onCancelEdit={() => setEditingCardbackId(null)}
                    />
                );
            })}
            {/* Delete confirmation is handled by parent component */}
        </>
    );
}
