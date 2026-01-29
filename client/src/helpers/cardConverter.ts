
import type { CardOption, ScryfallCard } from "../../../shared/types";
import { addRemoteImage, createLinkedBackCardsBulk } from "./dbUtils";
import { undoableAddCards } from "./undoableActions";

export interface ResolvedCardData {
    cardsToAdd: (Omit<CardOption, "uuid" | "order"> & { order?: number; imageId?: string })[];
    backCardTasks: { frontIndex: number; backImageId: string; backName: string }[];
}

/**
 * Converts a ScryfallCard object (from API) into local CardOption objects aimed for the DB.
 * Handles DFCs (fetching back images), tokens (flagging), and quantity replication.
 */
export async function convertScryfallToCardOptions(
    card: ScryfallCard,
    quantity: number,
    options: {
        category?: string;
        isToken?: boolean;
        isBackFaceImport?: boolean; // If user requested the back face name specifically
        projectId?: string; // Optional for compatibility/migrations, but highly recommended
    } = {}
): Promise<ResolvedCardData> {
    const { category, isToken: forceToken, isBackFaceImport = false, projectId } = options;

    // DFC handling
    const hasDfcBack = card.card_faces && card.card_faces.length > 1;
    let backImageId: string | undefined;
    let backFaceName: string | undefined;
    let frontImageUrl: string | undefined;

    if (hasDfcBack) {
        const frontFace = card.card_faces![0];
        const backFace = card.card_faces![1];
        backFaceName = backFace.name;
        frontImageUrl = frontFace.imageUrl;

        // Fetch back face image with refCount=1.
        // NOTE: All quantity copies of this DFC will share the SAME back image entry.
        // The image entry is created once, and each card's back card links to it.
        // createLinkedBackCardsBulk handles ref counting when linking individual back cards.
        if (backFace.imageUrl) {
            backImageId = await addRemoteImage([backFace.imageUrl], 1);
        }
    }

    // Resolve Main Image ID
    let mainImageId: string | undefined;
    if (isBackFaceImport && frontImageUrl) {
        // User imported back face name - fetch front face art for the card (but we will flip it)
        mainImageId = await addRemoteImage([frontImageUrl], quantity, card.prints);
    } else {
        // Normal case
        mainImageId = await addRemoteImage(card.imageUrls ?? [], quantity, card.prints);
    }

    // Token Detection
    // Use explicit flag OR detect from type_line
    const isToken = forceToken || card.type_line?.toLowerCase().includes('token') || false;

    // Create Card Objects
    const cardsToAdd: (Omit<CardOption, "uuid" | "order"> & { order?: number; imageId?: string })[] = [];

    for (let i = 0; i < quantity; i++) {
        cardsToAdd.push({
            name: card.name,
            set: card.set,
            number: card.number,
            lang: card.lang,
            isUserUpload: false,
            imageId: mainImageId,
            // If user imported back face name, flip the card to show back face
            isFlipped: isBackFaceImport || undefined,
            colors: card.colors,
            cmc: card.cmc,
            type_line: card.type_line,
            rarity: card.rarity,
            mana_cost: card.mana_cost,
            token_parts: card.token_parts,
            needs_token: card.needs_token,
            isToken,
            category,
            needsEnrichment: false,  // Scryfall data is complete
            projectId,
        });
    }

    // Prepare Back Card Tasks
    const backCardTasks = [];
    if (hasDfcBack && backImageId) {
        // We just return the data needed to create back cards, we don't create them here
        // to keep this function relatively pure regarding DB writes (except addRemoteImage cache)
        for (let i = 0; i < quantity; i++) {
            backCardTasks.push({
                frontIndex: i, // Index relative to cardsToAdd
                backImageId,
                backName: backFaceName || 'Back'
            });
        }
    }

    return { cardsToAdd, backCardTasks };
}

/**
 * Helper to execute the adding of cards to the DB.
 * Used by streamCards (and potentially ImportOrchestrator for direct adds).
 */
export async function persistResolvedCards(
    data: ResolvedCardData,
    options: { startOrder?: number } = {}
) {
    if (data.cardsToAdd.length === 0) return [];

    const added = await undoableAddCards(data.cardsToAdd, options.startOrder !== undefined ? { startOrder: options.startOrder } : undefined);

    // Handle Linked Back Cards
    if (data.backCardTasks.length > 0) {
        await createLinkedBackCardsBulk(
            data.backCardTasks.map(task => ({
                frontUuid: added[task.frontIndex].uuid,
                backImageId: task.backImageId,
                backName: task.backName,
            }))
        );
    }

    return added;
}
