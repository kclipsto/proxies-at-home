import {
    useSensor,
    useSensors,
    MouseSensor,
    TouchSensor,
    closestCenter,
    type DragStartEvent,
    type DragEndEvent,
    type DragOverEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useState, useRef, useCallback, useEffect } from "react";
import { db } from "../db";
import type { CardOption } from "../../../shared/types";
import { rebalanceCardOrders } from "@/helpers/dbUtils";
import { undoableReorderCards, undoableReorderMultipleCards } from "@/helpers/undoableActions";
import { useSelectionStore } from "../store/selection";
import type { SourceTypeSettings } from "../helpers/layout";

interface UseCardDragAndDropProps {
    cards: CardOption[];
    sourceSettings: SourceTypeSettings;
    effectiveBleedWidth: number;
}

export function useCardDragAndDrop({ cards }: UseCardDragAndDropProps) {
    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 500,
                tolerance: 5,
            },
        })
    );

    const [localCards, setLocalCards] = useState(cards);
    const [isOptimistic, setIsOptimistic] = useState(false);
    const [blockDbUpdates, setBlockDbUpdates] = useState(false);
    const [droppedId, setDroppedId] = useState<string | null>(null);
    const lastOptimisticOrder = useRef<string[]>([]);

    const selectedCards = useSelectionStore((state) => state.selectedCards);

    useEffect(() => {
        if (droppedId) {
            const timer = setTimeout(() => setDroppedId(null), 500);
            return () => clearTimeout(timer);
        }
    }, [droppedId]);

    useEffect(() => {
        if (blockDbUpdates) {
            return;
        }

        if (isOptimistic) {
            const currentOrder = cards.map((c) => c.uuid);
            const expectedOrder = lastOptimisticOrder.current;

            if (JSON.stringify(currentOrder) === JSON.stringify(expectedOrder)) {
                setIsOptimistic(false);
                setLocalCards(cards);
            }
        } else {
            setLocalCards(cards);
        }
    }, [cards, isOptimistic, blockDbUpdates]);

    const [activeId, setActiveId] = useState<string | null>(null);
    const dragStartOrderRef = useRef<{ cardUuid: string; oldOrder: number } | null>(null);

    const multiDragState = useRef<{
        isMultiDrag: boolean;
        draggedCards: CardOption[];
        originalLocalCards: CardOption[];
        activeId: string | null;
        ghostIds: Set<string>;
    }>({
        isMultiDrag: false,
        draggedCards: [],
        originalLocalCards: [],
        activeId: null,
        ghostIds: new Set(),
    });

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const cardUuid = event.active.id as string;
        const card = localCards.find(c => c.uuid === cardUuid);
        const isMultiSelect = selectedCards.has(cardUuid) && selectedCards.size > 1;

        if (isMultiSelect) {
            const draggedCards = localCards.filter(c => selectedCards.has(c.uuid));
            multiDragState.current = {
                isMultiDrag: true,
                draggedCards,
                originalLocalCards: [...localCards],
                activeId: cardUuid,
                ghostIds: new Set(),
            };

            // Collapse grid by removing selected cards, then inserting leader at its original index.
            const remainingCards = localCards.filter(c => !selectedCards.has(c.uuid));
            const leaderOriginalIndex = localCards.findIndex(c => c.uuid === cardUuid);
            const insertIndex = Math.min(leaderOriginalIndex, remainingCards.length);

            const newLocalCards = [...remainingCards];
            if (card) {
                newLocalCards.splice(insertIndex, 0, card);
            }

            // Defer state update for dnd-kit node capture.
            setTimeout(() => {
                setLocalCards(newLocalCards);
            }, 50);
        } else {
            multiDragState.current = {
                isMultiDrag: false,
                draggedCards: [],
                originalLocalCards: [],
                activeId: null,
                ghostIds: new Set(),
            };
            if (card) {
                dragStartOrderRef.current = { cardUuid, oldOrder: card.order };
            }
        }

        setActiveId(cardUuid);
        setIsOptimistic(true);
        setBlockDbUpdates(true);
    }, [localCards, selectedCards]);

    // Ref to track the latest localCards for the debounced handler
    const localCardsRef = useRef(localCards);
    useEffect(() => {
        localCardsRef.current = localCards;
    }, [localCards]);

    const dragOverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleDragOver = useCallback((event: DragOverEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        // Clear existing timeout to debounce
        if (dragOverTimeoutRef.current) {
            clearTimeout(dragOverTimeoutRef.current);
        }

        dragOverTimeoutRef.current = setTimeout(() => {
            const currentLocalCards = localCardsRef.current;
            const activeId = active.id;
            const overId = over.id;

            // Find indices in the source array (localCards)
            const oldIndex = currentLocalCards.findIndex((c) => c.uuid === activeId);
            const newIndex = currentLocalCards.findIndex((c) => c.uuid === overId);

            if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
                setLocalCards((items) => {
                    return arrayMove(items, oldIndex, newIndex);
                });
            }
        }, 100); // 100ms delay to prevent thrashing/infinite loops
    }, []);

    const handleDragEnd = useCallback(async (event: DragEndEvent) => {
        const { active, over } = event;

        setDroppedId(active.id as string);
        setActiveId(null);

        setTimeout(() => {
            setBlockDbUpdates(false);
        }, 500);

        if (!over) {
            if (multiDragState.current.isMultiDrag) {
                setLocalCards(multiDragState.current.originalLocalCards);
            }
            if (!multiDragState.current.isMultiDrag) {
                setLocalCards(cards);
            }

            multiDragState.current = { isMultiDrag: false, draggedCards: [], originalLocalCards: [], activeId: null, ghostIds: new Set() };
            return;
        }

        if (multiDragState.current.isMultiDrag) {
            const { draggedCards, activeId: leaderId } = multiDragState.current;

            const leaderIndex = localCards.findIndex(c => c.uuid === leaderId);
            if (leaderIndex === -1) {
                setLocalCards(multiDragState.current.originalLocalCards);
                return;
            }

            const cardsWithoutLeader = localCards.filter(c => c.uuid !== leaderId);
            const newLocalCards = [
                ...cardsWithoutLeader.slice(0, leaderIndex),
                ...draggedCards,
                ...cardsWithoutLeader.slice(leaderIndex)
            ];

            setLocalCards(newLocalCards);

            const adjustments: { uuid: string; oldOrder: number; newOrder: number }[] = [];
            const rebalanced = newLocalCards.map((c, i) => ({ ...c, order: (i + 1) * 1000 }));

            draggedCards.forEach((c) => {
                const moved = rebalanced.find(r => r.uuid === c.uuid);
                if (moved) {
                    adjustments.push({ uuid: c.uuid, oldOrder: c.order, newOrder: moved.order });
                }
            });

            await undoableReorderMultipleCards(adjustments);

            // 4. Update the DB
            for (const c of draggedCards) {
                const adjustment = adjustments.find(a => a.uuid === c.uuid);
                if (adjustment) {
                    await db.cards.update(c.uuid, { order: adjustment.newOrder });
                }
            }

            // 5. Rebalance all cards to ensure gaps/duplicates are fixed
            await rebalanceCardOrders(newLocalCards);

            multiDragState.current = { isMultiDrag: false, draggedCards: [], originalLocalCards: [], activeId: null, ghostIds: new Set() };
            return;
        }

        const currentIndex = localCards.findIndex((c) => c.uuid === active.id);
        if (currentIndex === -1) return;

        lastOptimisticOrder.current = localCards.map((c) => c.uuid);

        const prevCard = localCards[currentIndex - 1];
        const nextCard = localCards[currentIndex + 1];

        let newOrder: number;

        if (!prevCard) {
            newOrder = (nextCard?.order || 0) - 1;
        } else if (!nextCard) {
            newOrder = prevCard.order + 1;
        } else {
            newOrder = (prevCard.order + nextCard.order) / 2.0;
        }

        if (newOrder === prevCard?.order || newOrder === nextCard?.order) {
            await rebalanceCardOrders(localCards);
            return;
        }

        // Record undo action before updating DB
        const dragInfo = dragStartOrderRef.current;
        if (dragInfo && dragInfo.cardUuid === active.id) {
            await undoableReorderCards(dragInfo.cardUuid, dragInfo.oldOrder, newOrder);
        }
        dragStartOrderRef.current = null;

        await db.cards.update(active.id as string, { order: newOrder });
    }, [localCards, cards, multiDragState]);

    return {
        sensors,
        localCards,
        activeId,
        droppedId,
        multiDragState,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
        closestCenter,
    };
}
