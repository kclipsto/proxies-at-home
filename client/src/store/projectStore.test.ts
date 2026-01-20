
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore } from "./projectStore";
import { db } from "../db";
import { useSettingsStore } from "./settings";
import type { CardOption } from "../../../shared/types";

describe("Project Switching (Relational Architecture)", () => {
    beforeEach(async () => {
        // Reset DB
        await db.cards.clear();
        await db.projects.clear();
        await db.userPreferences.clear();

        // Reset stores
        useProjectStore.setState({ currentProjectId: null, projects: [], isLoading: false });
        useSettingsStore.getState().resetSettings();
    });

    it("should maintain data integrity in a single cards table when switching projects", async () => {
        // 1. Create Project A
        const projectIdA = await useProjectStore.getState().createProject("Project A");

        // 2. Add a card to Project A
        const cardA: CardOption = {
            uuid: crypto.randomUUID(),
            name: "Smaug",
            order: 1,
            isUserUpload: false,
            set: "LTR",
            number: "208",
            projectId: projectIdA,
            category: "Commander",
            needs_token: true,
            token_parts: [
                { id: "t1", name: "Treasure", uri: "https://api.scryfall.com/tokens/123" }
            ]
        };
        await db.cards.add(cardA);

        // 3. Create Project B (Active Project switches to B)
        const projectIdB = await useProjectStore.getState().createProject("Project B");

        // 4. Add a card to Project B
        const cardB: CardOption = {
            uuid: crypto.randomUUID(),
            name: "Sol Ring",
            order: 1,
            isUserUpload: false,
            projectId: projectIdB,
            category: "Artifact"
        };
        await db.cards.add(cardB);

        // 5. Verify DB State (Single Source of Truth)
        const allCards = await db.cards.toArray();
        expect(allCards).toHaveLength(2);

        // Check Project A Card
        const storedCardA = allCards.find(c => c.projectId === projectIdA);
        expect(storedCardA).toBeDefined();
        expect(storedCardA?.name).toBe("Smaug");
        expect(storedCardA?.token_parts).toHaveLength(1);
        expect(storedCardA?.token_parts?.[0].name).toBe("Treasure");

        // Check Project B Card
        const storedCardB = allCards.find(c => c.projectId === projectIdB);
        expect(storedCardB).toBeDefined();
        expect(storedCardB?.name).toBe("Sol Ring");

        // 6. "Switch" back to Project A
        // In the relational model, this is just updating a state pointer
        await useProjectStore.getState().switchProject(projectIdA);
        expect(useProjectStore.getState().currentProjectId).toBe(projectIdA);

        // 7. Verify UI Query Logic (Simulation)
        // This effectively tests what the UI does: query by projectId
        const projectACards = await db.cards.where('projectId').equals(projectIdA).toArray();
        expect(projectACards).toHaveLength(1);
        expect(projectACards[0].uuid).toBe(cardA.uuid);

        const projectBCards = await db.cards.where('projectId').equals(projectIdB).toArray();
        expect(projectBCards).toHaveLength(1);
        expect(projectBCards[0].uuid).toBe(cardB.uuid);
    });

    it("should cascadingly delete cards when a project is deleted", async () => {
        const projectId = await useProjectStore.getState().createProject("To Delete");
        const card: CardOption = {
            uuid: crypto.randomUUID(),
            name: "Delete Me",
            order: 1,
            isUserUpload: false,
            projectId: projectId
        };
        await db.cards.add(card);

        expect(await db.cards.count()).toBe(1);

        await useProjectStore.getState().deleteProject(projectId);

        expect(await db.cards.count()).toBe(0);
    });
});
