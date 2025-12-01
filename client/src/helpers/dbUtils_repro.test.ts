import { describe, it, expect, beforeEach } from "vitest";
import { addRemoteImage } from "./dbUtils";
import { db } from "../db";

describe("addRemoteImage", () => {
    beforeEach(async () => {
        await db.images.clear();
    });

    it("should add a remote image and return the ID", async () => {
        const imageUrls = ["https://cards.scryfall.io/png/front/5/c/5c4b8e1d-f1a0-4b74-9edd-a477459a1211.png?1748707657"];
        const id = await addRemoteImage(imageUrls);

        expect(id).toBeDefined();
        expect(id).toContain("5c4b8e1d-f1a0-4b74-9edd-a477459a1211.png");

        const image = await db.images.get(id!);
        expect(image).toBeDefined();
        expect(image?.imageUrls).toEqual(imageUrls);
    });

    it("should return undefined for empty array", async () => {
        const id = await addRemoteImage([]);
        expect(id).toBeUndefined();
    });
});
