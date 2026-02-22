import { create } from 'zustand';
import { db, type UserPreferences } from '../db';
import { useSettingsStore } from './settings';

interface UserPreferencesState {
    preferences: UserPreferences | null;
    isLoading: boolean;

    load: () => Promise<void>;
    saveCurrentAsDefaults: () => Promise<void>;
    toggleFavoriteMpcSource: (source: string) => Promise<void>;
    toggleFavoriteMpcTag: (tag: string) => Promise<void>;
    setFavoriteMpcDpi: (dpi: number | null) => Promise<void>;
    setFavoriteMpcSort: (sort: 'name' | 'dpi' | 'source' | null) => Promise<void>;
    setFavoriteMpcGroupBySource: (enabled: boolean) => Promise<void>;

    toggleFavoriteScryfallSet: (set: string) => Promise<void>;
    setFavoriteScryfallSort: (sort: 'name' | 'released' | null) => Promise<void>;
    setFavoriteScryfallGroupBySet: (enabled: boolean) => Promise<void>;
    setFavoriteScryfallSearchMode: (mode: 'cards' | 'prints' | null) => Promise<void>;

    setUploadLibrarySort: (sort: 'name' | 'date' | 'type' | null) => Promise<void>;
    setUploadLibrarySortDirection: (dir: 'asc' | 'desc') => Promise<void>;
    setFavoriteUploadLibraryGroupByType: (enabled: boolean) => Promise<void>;

    // UI State Actions
    setSettingsPanelState: (state: { order: string[], collapsed: Record<string, boolean> }) => Promise<void>;
    setSettingsPanelWidth: (width: number) => Promise<void>;
    setIsSettingsPanelCollapsed: (collapsed: boolean) => Promise<void>;
    setIsUploadPanelCollapsed: (collapsed: boolean) => Promise<void>;
    setUploadPanelWidth: (width: number) => Promise<void>;
    setCardEditorSectionCollapsed: (collapsed: Record<string, boolean>) => Promise<void>;
    setCardEditorSectionOrder: (order: string[]) => Promise<void>;
    setFilterSectionCollapsed: (collapsed: Record<string, boolean>) => Promise<void>;
}

export const useUserPreferencesStore = create<UserPreferencesState>((set, get) => ({
    preferences: null,
    isLoading: false,

    load: async () => {
        set({ isLoading: true });
        try {
            let prefs = await db.userPreferences.get('default');

            if (!prefs) {
                // Initialize with built-in defaults if none exist
                const builtInDefaults = useSettingsStore.getState();
                // Filter out function properties
                const settingsData = JSON.parse(JSON.stringify(builtInDefaults));

                prefs = {
                    id: 'default',
                    settings: settingsData,
                    favoriteCardbacks: [],
                    favoriteMpcSources: [],
                    favoriteMpcTags: [],
                    favoriteMpcDpi: null,
                    favoriteMpcSort: null,
                    favoriteScryfallSets: [],
                    favoriteScryfallSort: null,
                };
                await db.userPreferences.add(prefs);
            }

            // Ensure new fields exist on old records
            if (!prefs.favoriteMpcSources) prefs.favoriteMpcSources = [];
            if (!prefs.favoriteMpcTags) prefs.favoriteMpcTags = [];
            if (!prefs.favoriteScryfallSets) prefs.favoriteScryfallSets = [];

            // Migration: customXXX -> uploadLibraryXXX
            /* eslint-disable @typescript-eslint/no-explicit-any */
            if ((prefs as any).customUploadSort) {
                (prefs as any).uploadLibrarySort = (prefs as any).customUploadSort;
                delete (prefs as any).customUploadSort;
            }
            if ((prefs as any).favoriteCustomGroupByType !== undefined) {
                (prefs as any).favoriteUploadLibraryGroupByType = (prefs as any).favoriteCustomGroupByType;
                delete (prefs as any).favoriteCustomGroupByType;
            }
            /* eslint-enable @typescript-eslint/no-explicit-any */

            // Ensure UI fields exist
            const defaultOrder = ['projects', 'layout', 'bleed', 'card', 'guides', 'darken', 'filterSort', 'export', 'application'];

            if (!prefs.settingsPanelState) {
                prefs.settingsPanelState = {
                    order: defaultOrder,
                    collapsed: {}
                };
            } else {
                if (!prefs.settingsPanelState.collapsed) {
                    prefs.settingsPanelState.collapsed = {};
                }
                // Repair/Migrate old or bad IDs (e.g. "Application" -> "application")
                // If any ID in the order is not in our known list, or if the list is just the old human-readable ones, reset proper IDs
                const validIds = new Set(defaultOrder);
                const hasInvalidIds = prefs.settingsPanelState.order.some(id => !validIds.has(id));

                if (hasInvalidIds) {
                    // Try to map old names if possible, otherwise just append/reset
                    const newOrder: string[] = [];
                    const seen = new Set<string>();

                    // Helper to add if valid
                    const safeAdd = (id: string) => {
                        if (validIds.has(id) && !seen.has(id)) {
                            newOrder.push(id);
                            seen.add(id);
                        }
                    };

                    for (const oldId of prefs.settingsPanelState.order) {
                        if (validIds.has(oldId)) {
                            safeAdd(oldId);
                        } else {
                            // Map known legacy names
                            if (oldId === 'Application') safeAdd('application');
                            if (oldId === 'Layout') safeAdd('layout');
                            if (oldId === 'Bleed & Guides') { safeAdd('bleed'); safeAdd('guides'); }
                            if (oldId === 'Card Backs' || oldId === 'Card') safeAdd('card');
                            if (oldId === 'Export') safeAdd('export');
                        }
                    }

                    // Add any missing default sections (like 'projects' or 'filterSort' if not present)
                    for (const defId of defaultOrder) {
                        safeAdd(defId);
                    }

                    // FORCE 'projects' to be first
                    const projectsIndex = newOrder.indexOf('projects');
                    if (projectsIndex > -1) {
                        newOrder.splice(projectsIndex, 1);
                        newOrder.unshift('projects');
                    }

                    // FORCE 'application' to be last
                    const appIndex = newOrder.indexOf('application');
                    if (appIndex > -1) {
                        newOrder.splice(appIndex, 1);
                        newOrder.push('application');
                    }

                    prefs.settingsPanelState.order = newOrder;
                }
            }

            if (prefs.settingsPanelWidth === undefined) prefs.settingsPanelWidth = 320;
            if (prefs.isSettingsPanelCollapsed === undefined) prefs.isSettingsPanelCollapsed = false;
            if (prefs.isUploadPanelCollapsed === undefined) prefs.isUploadPanelCollapsed = false;
            if (prefs.uploadPanelWidth === undefined) prefs.uploadPanelWidth = 320;
            // Section IDs must match SECTION_CONFIG keys in CardEditorModal
            const defaultEditorSectionOrder = ['basic', 'enhance', 'darkPixels', 'holographic', 'colorReplace', 'gamma', 'colorEffects', 'borderEffects'];
            if (!prefs.cardEditorSectionCollapsed) prefs.cardEditorSectionCollapsed = {};
            // Migrate legacy section order (old human-readable names -> new technical IDs)
            if (!prefs.cardEditorSectionOrder || prefs.cardEditorSectionOrder.some(id => !defaultEditorSectionOrder.includes(id))) {
                prefs.cardEditorSectionOrder = defaultEditorSectionOrder;
            }
            if (!prefs.filterSectionCollapsed) prefs.filterSectionCollapsed = { "Source": false, "Quality": false };

            set({ preferences: prefs });
        } catch (error) {
            console.error('Failed to load user preferences:', error);
        } finally {
            set({ isLoading: false });
        }
    },

    saveCurrentAsDefaults: async () => {
        const currentSettings = useSettingsStore.getState();
        // Filter out function properties by serializing
        const { hasHydrated: _hasHydrated, ...settingsToSave } = currentSettings;
        const cleanSettings = JSON.parse(JSON.stringify(settingsToSave));

        const currentPrefs = get().preferences;

        const newPrefs: UserPreferences = {
            ...(currentPrefs || {}), // Preserve existing prefs (UI state, favorites, etc.)
            id: 'default', // Ensure ID is default
            settings: cleanSettings,
            favoriteCardbacks: currentPrefs?.favoriteCardbacks || [],
            favoriteMpcSources: currentPrefs?.favoriteMpcSources || [],
            favoriteMpcTags: currentPrefs?.favoriteMpcTags || [],
            favoriteMpcDpi: currentPrefs?.favoriteMpcDpi ?? null,
            favoriteMpcSort: currentPrefs?.favoriteMpcSort ?? null,
            favoriteScryfallSets: currentPrefs?.favoriteScryfallSets || [],
            favoriteScryfallSort: currentPrefs?.favoriteScryfallSort ?? null,
            uploadLibrarySort: currentPrefs?.uploadLibrarySort ?? null,
            uploadLibrarySortDirection: currentPrefs?.uploadLibrarySortDirection,
            favoriteUploadLibraryGroupByType: currentPrefs?.favoriteUploadLibraryGroupByType ?? false,
        };

        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    resetToBuiltIn: async () => {
        // Reset settings store to built-in defaults
        useSettingsStore.getState().resetSettings();

        // Save these as the new user defaults
        await get().saveCurrentAsDefaults();
    },

    toggleFavoriteMpcSource: async (source: string) => {
        const prefs = get().preferences;
        if (!prefs) return;

        const current = prefs.favoriteMpcSources || [];
        const updated = current.includes(source)
            ? current.filter(s => s !== source)
            : [...current, source];

        const newPrefs = { ...prefs, favoriteMpcSources: updated };
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    toggleFavoriteMpcTag: async (tag: string) => {
        const prefs = get().preferences;
        if (!prefs) return;

        const current = prefs.favoriteMpcTags || [];
        const updated = current.includes(tag)
            ? current.filter(t => t !== tag)
            : [...current, tag];

        const newPrefs = { ...prefs, favoriteMpcTags: updated };
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    setFavoriteMpcDpi: async (dpi: number | null) => {
        const prefs = get().preferences;
        if (!prefs) return;

        const newPrefs = { ...prefs, favoriteMpcDpi: dpi };
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    setFavoriteMpcSort: async (sort: 'name' | 'dpi' | 'source' | null) => {
        const prefs = get().preferences;
        if (!prefs) return;

        const newPrefs = { ...prefs, favoriteMpcSort: sort };
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    setSettingsPanelState: async (state: { order: string[], collapsed: Record<string, boolean> }) => {
        const prefs = get().preferences;
        if (!prefs) return;
        const newPrefs = { ...prefs, settingsPanelState: state };
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    setSettingsPanelWidth: async (width: number) => {
        const prefs = get().preferences;
        if (!prefs) return;
        const newPrefs = { ...prefs, settingsPanelWidth: width };
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    setIsSettingsPanelCollapsed: async (collapsed: boolean) => {
        const prefs = get().preferences;
        if (!prefs) return;
        const newPrefs = { ...prefs, isSettingsPanelCollapsed: collapsed };
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    setIsUploadPanelCollapsed: async (collapsed: boolean) => {
        const prefs = get().preferences;
        if (!prefs) return;
        const newPrefs = { ...prefs, isUploadPanelCollapsed: collapsed };
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    setUploadPanelWidth: async (width: number) => {
        const prefs = get().preferences;
        if (!prefs) return;
        const newPrefs = { ...prefs, uploadPanelWidth: width };
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    setCardEditorSectionCollapsed: async (collapsed: Record<string, boolean>) => {
        const prefs = get().preferences;
        if (!prefs) return;
        const newPrefs = { ...prefs, cardEditorSectionCollapsed: collapsed };
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    setCardEditorSectionOrder: async (order: string[]) => {
        const prefs = get().preferences;
        if (!prefs) return;
        const newPrefs = { ...prefs, cardEditorSectionOrder: order };
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    setFilterSectionCollapsed: async (collapsed: Record<string, boolean>) => {
        const prefs = get().preferences;
        if (!prefs) return;
        const newPrefs = { ...prefs, filterSectionCollapsed: collapsed };
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    toggleFavoriteScryfallSet: async (setKey: string) => {
        const prefs = get().preferences;
        if (!prefs) return;

        const current = prefs.favoriteScryfallSets || [];
        const updated = current.includes(setKey)
            ? current.filter(s => s !== setKey)
            : [...current, setKey];

        const newPrefs = { ...prefs, favoriteScryfallSets: updated };
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    setFavoriteScryfallSort: async (sort: 'name' | 'released' | null) => {
        const prefs = get().preferences;
        if (!prefs) return;

        const newPrefs = { ...prefs, favoriteScryfallSort: sort };
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    setFavoriteScryfallGroupBySet: async (enabled: boolean) => {
        const prefs = get().preferences;
        if (!prefs) return;

        const newPrefs = { ...prefs, favoriteScryfallGroupBySet: enabled };
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    setFavoriteScryfallSearchMode: async (mode: 'cards' | 'prints' | null) => {
        const prefs = get().preferences;
        if (!prefs) return;

        const newPrefs = { ...prefs, favoriteScryfallSearchMode: mode };
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    setFavoriteMpcGroupBySource: async (enabled: boolean) => {
        const prefs = get().preferences;
        if (!prefs) return;

        const newPrefs = { ...prefs, favoriteMpcGroupBySource: enabled };
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    setUploadLibrarySort: async (sort: 'name' | 'date' | 'type' | null) => {
        const prefs = get().preferences;
        if (!prefs) return;

        const newPrefs = { ...prefs, uploadLibrarySort: sort };
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    setUploadLibrarySortDirection: async (dir: 'asc' | 'desc') => {
        const prefs = get().preferences;
        if (!prefs) return;
        const newPrefs = { ...prefs, uploadLibrarySortDirection: dir };
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    setFavoriteUploadLibraryGroupByType: async (enabled: boolean) => {
        const prefs = get().preferences;
        if (!prefs) return;

        const newPrefs = { ...prefs, favoriteUploadLibraryGroupByType: enabled };
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    }
}));
