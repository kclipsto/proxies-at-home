import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    ImportSession,
    createImportSession,
    getCurrentSession,
    clearCurrentSession,
    hasActiveSession,
    markCardProcessed,
    markCardFailed,
} from "./ImportSession";

describe("ImportSession", () => {
    beforeEach(() => {
        clearCurrentSession();
    });

    describe("ImportSession class", () => {
        it("should create a session with config", () => {
            const session = new ImportSession({
                importType: "mpc",
                cardUuids: ["card-1", "card-2"],
            });

            expect(session.id).toBeDefined();
            expect(session.config.importType).toBe("mpc");
        });

        it("should track processed cards", () => {
            const session = new ImportSession({
                importType: "scryfall",
                cardUuids: ["card-1", "card-2"],
            });

            session.markProcessed("card-1", false);

            const stats = session.getStats();
            expect(stats.imagesProcessed).toBe(1);
            expect(stats.networkFetches).toBe(1);
        });

        it("should track persistent cache hits", () => {
            const session = new ImportSession({
                importType: "archidekt",
                cardUuids: ["card-1"],
            });

            session.markProcessed("card-1", true);

            const stats = session.getStats();
            expect(stats.persistentCacheHits).toBe(1);
        });

        it("should track failed cards", () => {
            const session = new ImportSession({
                importType: "mpc",
                cardUuids: ["card-1"],
            });

            session.markFailed("card-1");

            const stats = session.getStats();
            expect(stats.imagesFailed).toBe(1);
        });

        it("should report isComplete when all cards are processed", () => {
            const session = new ImportSession({
                importType: "mpc",
                cardUuids: ["card-1", "card-2"],
            });

            expect(session.isComplete).toBe(false);

            session.markProcessed("card-1", false);
            expect(session.isComplete).toBe(false);

            session.markProcessed("card-2", true);
            expect(session.isComplete).toBe(true);
        });

        it("should handle registerUuids for late registration", () => {
            const session = new ImportSession({
                importType: "mpc",
            });

            session.registerUuids(["card-1", "card-2"]);
            session.markProcessed("card-1", false);

            const stats = session.getStats();
            expect(stats.totalCards).toBe(2);
            expect(stats.imagesProcessed).toBe(1);
        });

        it("should buffer early processed cards", () => {
            const session = new ImportSession({
                importType: "mpc",
            });

            // Process before registering
            session.markProcessed("card-1", true);

            // Register after
            session.registerUuids(["card-1"]);

            const stats = session.getStats();
            expect(stats.imagesProcessed).toBe(1);
            expect(stats.persistentCacheHits).toBe(1);
        });

        it("should mark timing events", () => {
            const session = new ImportSession({
                importType: "mpc",
                cardUuids: [],
            });

            session.markFetchComplete();
            expect(session.fetchEndTime).toBeDefined();

            session.markProcessingStart();
            expect(session.processingStartTime).toBeDefined();

            session.markProcessingComplete();
            expect(session.processingEndTime).toBeDefined();
        });

        it("should prevent double-finishing", () => {
            const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });

            const session = new ImportSession({
                importType: "mpc",
                cardUuids: ["card-1", "card-2"],  // More cards so it doesn't auto-finish early
            });

            // Manually finish before processing all cards
            const stats1 = session.finish();
            const stats2 = session.finish();

            expect(stats1).not.toBeNull();
            expect(stats2).toBeNull();

            logSpy.mockRestore();
        });

        it("forceFinish should warn about pending cards", () => {
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
            const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });

            const session = new ImportSession({
                importType: "mpc",
                cardUuids: ["card-1", "card-2"],
            });

            session.markProcessed("card-1", false);
            session.forceFinish();

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining("1 cards never processed"),
                expect.arrayContaining(["card-2"])
            );

            warnSpy.mockRestore();
            logSpy.mockRestore();
        });
    });

    describe("Global session management", () => {
        it("createImportSession should create and store session", () => {
            const session = createImportSession({
                importType: "mpc",
                cardUuids: ["card-1"],
            });

            expect(getCurrentSession()).toBe(session);
        });

        it("createImportSession should finish previous session", () => {
            const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });

            const session1 = createImportSession({
                importType: "mpc",
                cardUuids: [],
            });
            session1.markFetchComplete();

            const session2 = createImportSession({
                importType: "archidekt",
                cardUuids: [],
            });

            expect(getCurrentSession()).toBe(session2);
            expect(getCurrentSession()).not.toBe(session1);

            logSpy.mockRestore();
        });

        it("clearCurrentSession should clear session and buffers", () => {
            createImportSession({
                importType: "mpc",
                cardUuids: ["card-1"],
            });

            clearCurrentSession();

            expect(getCurrentSession()).toBeNull();
        });

        it("hasActiveSession should return correct state", () => {
            expect(hasActiveSession()).toBe(false);

            createImportSession({
                importType: "mpc",
                cardUuids: ["card-1"],
            });

            expect(hasActiveSession()).toBe(true);
        });

        it("markCardProcessed should work with current session", () => {
            const session = createImportSession({
                importType: "mpc",
                cardUuids: ["card-1"],
            });

            markCardProcessed("card-1", true);

            const stats = session.getStats();
            expect(stats.imagesProcessed).toBe(1);
        });

        it("markCardFailed should work with current session", () => {
            const session = createImportSession({
                importType: "mpc",
                cardUuids: ["card-1"],
            });

            markCardFailed("card-1");

            const stats = session.getStats();
            expect(stats.imagesFailed).toBe(1);
        });

        it("markCardProcessed should buffer when no session", () => {
            clearCurrentSession();
            markCardProcessed("card-1", true);

            // Create session after - should pick up buffered result
            const session = createImportSession({
                importType: "mpc",
                cardUuids: ["card-1"],
            });

            const stats = session.getStats();
            expect(stats.imagesProcessed).toBe(1);
            expect(stats.persistentCacheHits).toBe(1);
        });
    });
});
