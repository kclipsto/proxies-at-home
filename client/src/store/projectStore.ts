import { create } from "zustand";
import { db, type Project } from "../db";
import { useSettingsStore, migrateLegacySettings, type Store as SettingsStore, type LegacySettingsState } from "./settings";
import { useUndoRedoStore } from "./undoRedo";
import { cancelAllProcessing } from "../helpers/cancellationService";

interface ProjectState {
    currentProjectId: string | null;
    projects: Project[];
    isLoading: boolean;
    loadingMessage?: string;

    loadProjects: () => Promise<void>;
    createProject: (name: string) => Promise<string>;
    switchProject: (id: string) => Promise<void>;
    updateProjectSettings: (settings: Partial<SettingsStore>) => Promise<void>;
    deleteProject: (id: string) => Promise<void>;
    renameProject: (id: string, name: string) => Promise<void>;
}

let settingsSaveTimer: ReturnType<typeof setTimeout> | null = null;

/** Persistable settings - strips functions and internal state from Store */
type PersistableSettings = Omit<SettingsStore,
    | 'setAllSettings' | 'setHasHydrated' | 'resetSettings'
    | 'setPageSizePreset' | 'setPageWidth' | 'setPageHeight' | 'setPageSizeUnit' | 'swapPageOrientation'
    | 'setColumns' | 'setRows' | 'setBleedEdgeWidth' | 'setBleedEdge' | 'setBleedEdgeUnit'
    | 'setWithBleedSourceAmount' | 'setWithBleedTargetMode' | 'setWithBleedTargetAmount'
    | 'setNoBleedTargetMode' | 'setNoBleedTargetAmount'
    | 'setDarkenMode' | 'setDarkenContrast' | 'setDarkenEdgeWidth' | 'setDarkenAmount' | 'setDarkenBrightness' | 'setDarkenAutoDetect'
    | 'setGuideColor' | 'setGuideWidth' | 'setZoom' | 'setCardSpacingMm'
    | 'setCardPositionX' | 'setCardPositionY' | 'setUseCustomBackOffset' | 'setCardBackPositionX' | 'setCardBackPositionY'
    | 'setPerCardBackOffset' | 'clearPerCardBackOffsets'
    | 'setDpi' | 'setCutLineStyle' | 'setPerCardGuideStyle' | 'setGuidePlacement' | 'setCutGuideLengthMm' | 'setGlobalLanguage'
    | 'setRegistrationMarks' | 'setRegistrationMarksPortrait'
    | 'setSortBy' | 'setSortOrder' | 'setFilterManaCost' | 'setFilterColors' | 'setFilterTypes' | 'setFilterCategories' | 'setFilterFeatures'
    | 'setFilterMatchType' | 'setDecklistSortAlpha' | 'setShowProcessingToasts' | 'setDefaultCardbackId' | 'setExportMode'
    | 'setAutoImportTokens' | 'setMpcFuzzySearch' | 'setPreferredArtSource'
    | 'hasHydrated'
>;

function getPersistableSettings(state: SettingsStore): PersistableSettings {
    const result: Record<string, unknown> = {};
    for (const key in state) {
        const value = state[key as keyof SettingsStore];
        if (typeof value !== 'function' && key !== 'hasHydrated') {
            result[key] = value;
        }
    }
    return result as PersistableSettings;
}

// --- Store Implementation ---

export const useProjectStore = create<ProjectState>((set, get) => ({
    currentProjectId: null,
    projects: [],
    isLoading: false,

    loadProjects: async () => {
        const projects = await db.projects.orderBy('lastOpenedAt').reverse().toArray();
        set({ projects });
    },

    createProject: async (name: string) => {
        const id = crypto.randomUUID();

        // Get defaults from user preferences
        const userPrefs = await db.userPreferences.get('default');
        const defaultSettings = userPrefs?.settings || {};

        const project: Project = {
            id,
            name,
            createdAt: Date.now(),
            lastOpenedAt: Date.now(),
            cardCount: 0,
            settings: defaultSettings,
        };

        await db.projects.add(project);
        await get().loadProjects();

        // DON'T auto-switch - let caller decide
        return id;
    },

    switchProject: async (targetProjectId: string) => {
        const { currentProjectId } = get();

        // Prevent re-switching to same project
        if (currentProjectId === targetProjectId) return;

        set({ isLoading: true, loadingMessage: "Switching project..." });

        try {
            // 1. Clear undo history (prevents cross-project undo bugs)
            useUndoRedoStore.getState().clearHistory();

            // 2. Cancel any in-progress processing
            cancelAllProcessing();

            // 3. Clear image cache only when ACTUALLY switching between different projects
            //    (not on initial load of the same project after page refresh)
            //    On initial load, currentProjectId is null but we may be loading the same project
            if (currentProjectId !== null) {
                // Only clear when switching FROM one project TO another
                await db.images.clear();
            }

            // 4. Verify target project exists
            const project = await db.projects.get(targetProjectId);
            if (!project) throw new Error(`Project ${targetProjectId} not found`);

            // 5. Load project settings
            useSettingsStore.getState().setHasHydrated(false);
            useSettingsStore.getState().resetSettings();
            const migratedSettings = migrateLegacySettings(project.settings as LegacySettingsState);
            useSettingsStore.getState().setAllSettings(migratedSettings);
            useSettingsStore.getState().setHasHydrated(true);

            // 6. Update current project ID (triggers UI refresh via useLiveQuery)
            set({ currentProjectId: targetProjectId });

            // 7. Update persistence
            await db.transaction('rw', db.projects, db.userPreferences, async () => {
                await db.projects.update(targetProjectId, { lastOpenedAt: Date.now() });
                await db.userPreferences.update('default', { lastProjectId: targetProjectId });
            });

        } catch (e) {
            console.error('[ProjectStore] Failed to switch project:', e);
        } finally {
            set({ isLoading: false, loadingMessage: undefined });
        }
    },

    updateProjectSettings: async (_settings) => {
        if (settingsSaveTimer) clearTimeout(settingsSaveTimer);

        settingsSaveTimer = setTimeout(async () => {
            const { currentProjectId } = get();
            const currentSettings = useSettingsStore.getState();
            const persistable = getPersistableSettings(currentSettings);

            if (currentProjectId) {
                await db.projects.update(currentProjectId, { settings: persistable });
            } else {
                await db.userPreferences.update('default', { settings: persistable });
            }
        }, 1000);
    },

    deleteProject: async (id: string) => {
        const { currentProjectId } = get();

        set({ isLoading: true, loadingMessage: "Deleting project..." });

        try {
            await db.transaction('rw', db.projects, db.cards, db.images, async () => {
                // 1. Delete all cards for this project
                await db.cards.where('projectId').equals(id).delete();

                // 2. Delete project record
                await db.projects.delete(id);
            });

            // Refresh list
            await get().loadProjects();
            const updatedProjects = get().projects;

            // If deleting current, switch to another
            if (id === currentProjectId) {
                if (updatedProjects.length > 0) {
                    await get().switchProject(updatedProjects[0].id);
                } else {
                    // Create new project and switch to it
                    const newId = await get().createProject("My Project");
                    await get().switchProject(newId);
                }
            }

        } catch (e) {
            console.error('[ProjectStore] Delete failed:', e);
        } finally {
            set({ isLoading: false });
        }
    },

    renameProject: async (id: string, name: string) => {
        await db.projects.update(id, { name });
        await get().loadProjects();
    },

}));

// Subscribe to settings changes to auto-persist
useSettingsStore.subscribe((state) => {
    if (state.hasHydrated) {
        useProjectStore.getState().updateProjectSettings(state);
    }
});
