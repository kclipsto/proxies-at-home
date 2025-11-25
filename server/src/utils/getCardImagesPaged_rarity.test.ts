import { describe, it, expect } from "vitest";
import { getCardsWithImagesForCardInfo } from "./getCardImagesPaged.js";

describe("Basic Land Rarity", () => {
    it("should fetch rarity for a basic land", async () => {
        const results = await getCardsWithImagesForCardInfo({ name: "Plains", quantity: 1 });
        console.log("Plains results:", JSON.stringify(results, null, 2));
        if (results.length > 0) {
            console.log("Rarity:", results[0].rarity);
            expect(results[0].rarity).toBeDefined();
        }
    });
});
