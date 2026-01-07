import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildMpcXml, downloadMpcXml } from "./mpcXmlExport";
import type { CardOption } from "../../../shared/types";

// Mock the mpcAutofillApi module
vi.mock("./mpcAutofillApi", () => ({
    extractMpcIdentifierFromImageId: vi.fn((imageId: string | undefined) => {
        if (!imageId) return undefined;
        if (imageId.startsWith("mpc_")) return imageId.replace("mpc_", "");
        return undefined;
    }),
}));

// Helper to create test cards
function createTestCard(overrides: Partial<CardOption> = {}): CardOption {
    return {
        uuid: "test-uuid",
        name: "Test Card",
        order: 1,
        ...overrides,
    } as CardOption;
}

describe("mpcXmlExport", () => {
    describe("buildMpcXml", () => {
        it("should return empty string when no MPC cards are present", () => {
            const cards = [
                createTestCard({ imageId: "scryfall_123" }),
                createTestCard({ imageId: undefined }),
            ];
            expect(buildMpcXml(cards)).toBe("");
        });

        it("should build XML for cards with MPC identifiers", () => {
            const cards = [
                createTestCard({ name: "Lightning Bolt", imageId: "mpc_abc123" }),
            ];
            const xml = buildMpcXml(cards);

            expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
            expect(xml).toContain("<order>");
            expect(xml).toContain("<fronts>");
            expect(xml).toContain("<id>abc123</id>");
            expect(xml).toContain("<slots>0</slots>");
            expect(xml).toContain("<name>Lightning Bolt</name>");
            expect(xml).toContain("</order>");
        });

        it("should exclude linked back cards", () => {
            const cards = [
                createTestCard({ name: "Front", imageId: "mpc_front123" }),
                createTestCard({ name: "Back", imageId: "mpc_back456", linkedFrontId: "front-uuid" }),
            ];
            const xml = buildMpcXml(cards);

            expect(xml).toContain("<id>front123</id>");
            expect(xml).not.toContain("back456");
        });

        it("should include multiple cards with correct slots", () => {
            const cards = [
                createTestCard({ name: "Card 1", imageId: "mpc_id1" }),
                createTestCard({ name: "Card 2", imageId: "mpc_id2" }),
                createTestCard({ name: "Card 3", imageId: "mpc_id3" }),
            ];
            const xml = buildMpcXml(cards);

            expect(xml).toContain("<slots>0</slots>");
            expect(xml).toContain("<slots>1</slots>");
            expect(xml).toContain("<slots>2</slots>");
        });

        it("should correctly map DFC back faces to <backs> section", () => {
            const cards = [
                // Single-faced card at slot 0
                createTestCard({ uuid: "c1", name: "Card 1", imageId: "mpc_front1", order: 1 }),
                // DFC at slot 1
                createTestCard({ uuid: "c2", name: "DFC Front", imageId: "mpc_dfc_front", linkedBackId: "c2-back", order: 2 }),
                createTestCard({ uuid: "c2-back", name: "DFC Back", imageId: "mpc_dfc_back", linkedFrontId: "c2", order: 2.1 }),
            ];
            const xml = buildMpcXml(cards);

            // Check fronts
            expect(xml).toContain("<id>front1</id>");
            expect(xml).toContain("<id>dfc_front</id>");

            // Check backs section
            expect(xml).toContain("<backs>");
            expect(xml).toContain("<id>dfc_back</id>");
            // Check that back uses the correct slot (index 1 for the second card)
            // We need to look at the structure to ensure "dfc_back" is associated with slot 1
            const backsSection = xml.split("<backs>")[1].split("</backs>")[0];
            expect(backsSection).toContain("<id>dfc_back</id>");
            expect(backsSection).toContain("<slots>1</slots>");
            expect(backsSection).toContain("<name>DFC Back</name>");
        });

        it("should escape special XML characters in card names", () => {
            const cards = [
                createTestCard({ name: "Fire & Ice <Test> \"Special\"", imageId: "mpc_test123" }),
            ];
            const xml = buildMpcXml(cards);

            expect(xml).toContain("&amp;");
            expect(xml).toContain("&lt;");
            expect(xml).toContain("&gt;");
            expect(xml).toContain("&quot;");
        });

        it("should include standard MPC format details", () => {
            const cards = [createTestCard({ name: "Test", imageId: "mpc_123" })];
            const xml = buildMpcXml(cards);

            expect(xml).toContain("<bracket>612</bracket>");
            expect(xml).toContain("<quantity>1</quantity>");
            expect(xml).toContain("<stock>(S30) Standard Smooth</stock>");
            expect(xml).toContain("<foil>false</foil>");
        });

        it("should filter out non-MPC cards", () => {
            const cards = [
                createTestCard({ name: "Scryfall Card", imageId: "scryfall_123" }),
                createTestCard({ name: "MPC Card", imageId: "mpc_abc" }),
                createTestCard({ name: "No Image", imageId: undefined }),
            ];
            const xml = buildMpcXml(cards);

            expect(xml).toContain("<id>abc</id>");
            expect(xml).not.toContain("scryfall");
            expect((xml.match(/<card>/g) || []).length).toBe(1);
        });
    });

    describe("downloadMpcXml", () => {
        beforeEach(() => {
            // Mock DOM methods
            vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
            vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => { });
            vi.spyOn(document, "createElement").mockReturnValue({
                click: vi.fn(),
                href: "",
                download: "",
            } as unknown as HTMLAnchorElement);
        });

        it("should return false when no MPC cards to export", () => {
            const cards = [createTestCard({ imageId: "scryfall_123" })];
            const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => { });

            const result = downloadMpcXml(cards);

            expect(result).toBe(false);
            expect(consoleSpy).toHaveBeenCalledWith("No MPC cards to export");
            consoleSpy.mockRestore();
        });

        it("should return true and trigger download for valid MPC cards", () => {
            const cards = [createTestCard({ name: "Test", imageId: "mpc_123" })];

            const result = downloadMpcXml(cards);

            expect(result).toBe(true);
            expect(URL.createObjectURL).toHaveBeenCalled();
            expect(URL.revokeObjectURL).toHaveBeenCalled();
        });

        it("should use custom filename when provided", () => {
            const cards = [createTestCard({ name: "Test", imageId: "mpc_123" })];
            const mockAnchor = { click: vi.fn(), href: "", download: "" };
            vi.spyOn(document, "createElement").mockReturnValue(mockAnchor as unknown as HTMLAnchorElement);

            downloadMpcXml(cards, "custom_export.xml");

            expect(mockAnchor.download).toBe("custom_export.xml");
        });

        it("should generate default filename with date when not provided", () => {
            const cards = [createTestCard({ name: "Test", imageId: "mpc_123" })];
            const mockAnchor = { click: vi.fn(), href: "", download: "" };
            vi.spyOn(document, "createElement").mockReturnValue(mockAnchor as unknown as HTMLAnchorElement);

            downloadMpcXml(cards);

            expect(mockAnchor.download).toMatch(/^mpc_decklist_\d{4}-\d{2}-\d{2}\.xml$/);
        });
    });
});
