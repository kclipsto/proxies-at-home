import { describe, it } from "vitest";
import { getCardsWithImagesForCardInfo } from "./getCardImagesPaged.js";

describe("DFC Color Extraction", () => {
    it("should fetch colors for a DFC (Delver of Secrets)", async () => {
        const results = await getCardsWithImagesForCardInfo({ name: "Delver of Secrets", quantity: 1 });
        if (results.length > 0) {
            const card = results[0];
            console.log("Delver Colors:", card.colors);
            console.log("Delver Faces:", JSON.stringify(card.card_faces, null, 2));
            // Expect top-level colors to be present OR we need to handle it
        }
    });

    it("should fetch colors for a MDFC (Malakir Rebirth)", async () => {
        const results = await getCardsWithImagesForCardInfo({ name: "Malakir Rebirth", quantity: 1 });
        if (results.length > 0) {
            const card = results[0];
            console.log("Malakir Colors:", card.colors);
            console.log("Malakir Faces:", JSON.stringify(card.card_faces, null, 2));
        }
    });
});
