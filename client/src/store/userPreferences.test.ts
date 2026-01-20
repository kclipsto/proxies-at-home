import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { useUserPreferencesStore } from "./userPreferences";
import { db } from "../db";
import { useSettingsStore } from "./settings";

// Mock Dexie
vi.mock("../db", () => ({
    db: {
        userPreferences: {
            get: vi.fn(),
            add: vi.fn(),
            put: vi.fn(),
        },
    },
}));

describe("useUserPreferencesStore", () => {
    const initialState = useSettingsStore.getState();

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset stores
        useUserPreferencesStore.setState({ preferences: null, isLoading: false });
        useSettingsStore.setState(initialState);
    });

    describe("load", () => {
        it("should load existing preferences from db", async () => {
            const mockPrefs = {
                id: "default",
                settings: { someSetting: "value" },
                favoriteCardbacks: ["cb1"],
                favoriteMpcSources: [],
                favoriteMpcTags: [],
                favoriteMpcDpi: null,
                favoriteMpcSort: null,
            };
            (db.userPreferences.get as Mock).mockResolvedValue(mockPrefs);

            await useUserPreferencesStore.getState().load();

            expect(db.userPreferences.get).toHaveBeenCalledWith("default");
            expect(useUserPreferencesStore.getState().preferences).toEqual(mockPrefs);
            expect(useUserPreferencesStore.getState().isLoading).toBe(false);
        });

        it("should initialize with built-in defaults if no preferences exist", async () => {
            (db.userPreferences.get as Mock).mockResolvedValue(undefined); // No prefs found

            // Set some state in settings store to mimic "built-in" defaults (current state)
            useSettingsStore.setState({ columns: 5 });

            await useUserPreferencesStore.getState().load();

            expect(db.userPreferences.add).toHaveBeenCalled();
            const addedPrefs = (db.userPreferences.add as Mock).mock.calls[0][0];

            expect(addedPrefs.id).toBe("default");
            expect(addedPrefs.settings.columns).toBe(5);
            expect(useUserPreferencesStore.getState().preferences).toEqual(addedPrefs);
        });
    });

    describe("saveCurrentAsDefaults", () => {
        it("should save current settings store state as user defaults", async () => {
            // Setup initial state
            useUserPreferencesStore.setState({
                preferences: {
                    id: 'default',
                    settings: {},
                    favoriteCardbacks: ['existing'],
                    favoriteMpcSources: [],
                    favoriteMpcTags: [],
                    favoriteMpcDpi: null,
                    favoriteMpcSort: null,
                }
            });

            // Modify settings
            useSettingsStore.setState({ zoom: 2.5 });

            await useUserPreferencesStore.getState().saveCurrentAsDefaults();

            expect(db.userPreferences.put).toHaveBeenCalled();
            const savedPrefs = (db.userPreferences.put as Mock).mock.calls[0][0];

            expect(savedPrefs.settings.zoom).toBe(2.5);
            expect(savedPrefs.favoriteCardbacks).toEqual(['existing']); // Should preserve cardbacks
            expect(savedPrefs.favoriteMpcSources).toEqual([]);
            expect(savedPrefs.favoriteMpcTags).toEqual([]);
            expect(useUserPreferencesStore.getState().preferences).toEqual(savedPrefs);
        });
    });

    describe("resetToBuiltIn", () => {
        it("should reset settings to factory defaults and save them as user defaults", async () => {
            // Mock settings reset
            const resetSpy = vi.spyOn(useSettingsStore.getState(), 'resetSettings');

            await useUserPreferencesStore.getState().resetToBuiltIn();

            expect(resetSpy).toHaveBeenCalled();
            expect(db.userPreferences.put).toHaveBeenCalled(); // Should save the reset state
        });
    });

    describe("UI State Persistence", () => {
        beforeEach(() => {
            // Seed store with basic preferences
            useUserPreferencesStore.setState({
                preferences: {
                    id: 'default',
                    settings: {},
                    favoriteCardbacks: [],
                    favoriteMpcSources: [],
                    favoriteMpcTags: [],
                    favoriteMpcDpi: null,
                    favoriteMpcSort: null,
                    settingsPanelState: { order: [], collapsed: {} },
                    settingsPanelWidth: 320,
                    isSettingsPanelCollapsed: false,
                    isUploadPanelCollapsed: false,
                    uploadPanelWidth: 320,
                    cardEditorSectionCollapsed: {},
                    cardEditorSectionOrder: [],
                    filterSectionCollapsed: {},
                }
            });
        });

        it("should persist settings panel state", async () => {
            const newState = { order: ['A', 'B'], collapsed: { A: true } };
            await useUserPreferencesStore.getState().setSettingsPanelState(newState);

            const prefs = useUserPreferencesStore.getState().preferences;
            expect(prefs?.settingsPanelState).toEqual(newState);
            expect(db.userPreferences.put).toHaveBeenCalledWith(prefs);
        });

        it("should persist panel widths", async () => {
            await useUserPreferencesStore.getState().setSettingsPanelWidth(500);

            const prefs = useUserPreferencesStore.getState().preferences;
            expect(prefs?.settingsPanelWidth).toBe(500);
            expect(db.userPreferences.put).toHaveBeenCalledWith(prefs);
        });

        it("should persist card editor section collapse state", async () => {
            const newCollapsed = { 'basic': true };
            await useUserPreferencesStore.getState().setCardEditorSectionCollapsed(newCollapsed);

            const prefs = useUserPreferencesStore.getState().preferences;
            expect(prefs?.cardEditorSectionCollapsed).toEqual(newCollapsed);
            expect(db.userPreferences.put).toHaveBeenCalledWith(prefs);
        });

        it("should toggle MPC favorite source", async () => {
            await useUserPreferencesStore.getState().toggleFavoriteMpcSource("source1");

            let prefs = useUserPreferencesStore.getState().preferences;
            expect(prefs?.favoriteMpcSources).toContain("source1");
            expect(db.userPreferences.put).toHaveBeenCalledTimes(1);

            await useUserPreferencesStore.getState().toggleFavoriteMpcSource("source1");

            prefs = useUserPreferencesStore.getState().preferences;
            expect(prefs?.favoriteMpcSources).not.toContain("source1");
            expect(db.userPreferences.put).toHaveBeenCalledTimes(2);
        });
    });
});
