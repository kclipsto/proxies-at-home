import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { indexedDbStorage } from "./indexedDbStorage";
import { recordSettingChange } from "@/helpers/undoableSettings";
import { useUndoRedoStore } from "./undoRedo";

export type LayoutPreset = "A4" | "A3" | "Letter" | "Tabloid" | "Legal" | "ArchA" | "ArchB" | "SuperB" | "A2" | "A1" | "Custom";
export type PageOrientation = "portrait" | "landscape";

type Store = {
  pageSizeUnit: "mm" | "in";
  pageOrientation: PageOrientation;
  pageSizePreset: LayoutPreset;
  setPageSizePreset: (value: LayoutPreset) => void;
  pageWidth: number;
  pageHeight: number;
  customPageWidth: number;
  customPageHeight: number;
  customPageUnit: "mm" | "in";
  setPageWidth: (value: number) => void;
  setPageHeight: (value: number) => void;
  setPageSizeUnit: (value: "mm" | "in") => void;
  swapPageOrientation: () => void;
  columns: number;
  setColumns: (value: number) => void;
  rows: number;
  setRows: (value: number) => void;
  bleedEdgeWidth: number;
  setBleedEdgeWidth: (value: number) => void;
  bleedEdge: boolean;
  setBleedEdge: (value: boolean) => void;
  bleedEdgeUnit: 'mm' | 'in';
  setBleedEdgeUnit: (value: 'mm' | 'in') => void;
  // MPC Images bleed settings
  mpcBleedMode: 'trim-regenerate' | 'use-existing' | 'none';
  setMpcBleedMode: (value: 'trim-regenerate' | 'use-existing' | 'none') => void;
  mpcExistingBleed: number;
  setMpcExistingBleed: (value: number) => void;
  mpcExistingBleedUnit: 'mm' | 'in';
  setMpcExistingBleedUnit: (value: 'mm' | 'in') => void;
  // Other uploads bleed settings
  uploadBleedMode: 'generate' | 'existing' | 'none';
  setUploadBleedMode: (value: 'generate' | 'existing' | 'none') => void;
  uploadExistingBleed: number;
  setUploadExistingBleed: (value: number) => void;
  uploadExistingBleedUnit: 'mm' | 'in';
  setUploadExistingBleedUnit: (value: 'mm' | 'in') => void;
  darkenNearBlack: boolean;
  setDarkenNearBlack: (value: boolean) => void;
  guideColor: string;
  setGuideColor: (value: string) => void;
  guideWidth: number;
  setGuideWidth: (value: number) => void;
  zoom: number;
  setZoom: (value: number) => void;
  resetSettings: () => void;
  cardSpacingMm: number;
  setCardSpacingMm: (mm: number) => void;
  cardPositionX: number;
  setCardPositionX: (mm: number) => void;
  cardPositionY: number;
  setCardPositionY: (mm: number) => void;
  dpi: number;
  setDpi: (value: number) => void;
  cutLineStyle: 'none' | 'edges' | 'full';
  setCutLineStyle: (value: 'none' | 'edges' | 'full') => void;
  perCardGuideStyle: 'corners' | 'rounded-corners' | 'dashed-squared-rect' | 'solid-squared-rect' | 'dashed-rounded-rect' | 'solid-rounded-rect' | 'none';
  setPerCardGuideStyle: (value: 'corners' | 'rounded-corners' | 'solid-squared-rect' | 'dashed-squared-rect' | 'solid-rounded-rect' | 'dashed-rounded-rect' | 'none') => void;
  guidePlacement: 'inside' | 'outside';
  setGuidePlacement: (value: 'inside' | 'outside') => void;
  globalLanguage: string;
  setGlobalLanguage: (lang: string) => void;
  settingsPanelState: {
    order: string[];
    collapsed: Record<string, boolean>;
  };
  setPanelOrder: (order: string[]) => void;
  togglePanelCollapse: (id: string) => void;
  expandAllPanels: () => void;
  collapseAllPanels: () => void;
  settingsPanelWidth: number;
  setSettingsPanelWidth: (width: number) => void;
  isSettingsPanelCollapsed: boolean;
  toggleSettingsPanel: () => void;
  isUploadPanelCollapsed: boolean;
  toggleUploadPanel: () => void;
  uploadPanelWidth: number;
  setUploadPanelWidth: (width: number) => void;
  // Sort & Filter
  sortBy: "name" | "type" | "cmc" | "color" | "manual" | "rarity";
  setSortBy: (value: "manual" | "name" | "type" | "cmc" | "color" | "rarity") => void;
  sortOrder: "asc" | "desc";
  setSortOrder: (value: "asc" | "desc") => void;
  filterManaCost: number[];
  setFilterManaCost: (value: number[]) => void;
  filterColors: string[];
  setFilterColors: (value: string[]) => void;
  filterMatchType: "partial" | "exact";
  setFilterMatchType: (value: "partial" | "exact") => void;
  decklistSortAlpha: boolean;
  setDecklistSortAlpha: (value: boolean) => void;
  showProcessingToasts: boolean;
  setShowProcessingToasts: (value: boolean) => void;
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
};

const defaultPageSettings = {
  pageSizeUnit: "in" as "in" | "mm",
  pageOrientation: "portrait" as "portrait" | "landscape",
  pageSizePreset: "Letter" as LayoutPreset,
  pageWidth: 8.5,
  pageHeight: 11,
  customPageWidth: 8.5,
  customPageHeight: 11,
  customPageUnit: "in" as "in" | "mm",
  columns: 3,
  rows: 3,
  bleedEdgeWidth: 1,
  bleedEdge: true,
  bleedEdgeUnit: "mm" as "mm" | "in",
  // MPC Images bleed settings
  mpcBleedMode: "trim-regenerate" as "trim-regenerate" | "use-existing" | "none",
  mpcExistingBleed: 3,  // ~1/8 inch default
  mpcExistingBleedUnit: "mm" as "mm" | "in",
  // Other uploads bleed settings
  uploadBleedMode: "generate" as "generate" | "existing" | "none",
  uploadExistingBleed: 0,
  uploadExistingBleedUnit: "mm" as "mm" | "in",
  darkenNearBlack: true,
  guideColor: "#39FF14",
  guideWidth: 1,
  cardSpacingMm: 0,
  cardPositionX: 0,
  cardPositionY: 0,
  zoom: 1,
  dpi: 900,
  cutLineStyle: "full" as "full" | "edges" | "none",
  perCardGuideStyle: "corners" as "corners" | "rounded-corners" | "solid-rounded-rect" | "dashed-rounded-rect" | "solid-squared-rect" | "dashed-squared-rect" | "none",
  guidePlacement: "outside" as "inside" | "outside",
  globalLanguage: "en",
  settingsPanelState: {
    order: ["layout", "bleed", "guides", "card", "filterSort", "application"],
    collapsed: {},
  },
  settingsPanelWidth: 320,
  isSettingsPanelCollapsed: false,
  uploadPanelWidth: 320,
  isUploadPanelCollapsed: false,
  sortBy: "manual" as "name" | "type" | "cmc" | "color" | "manual" | "rarity",
  sortOrder: "asc" as "asc" | "desc",
  filterManaCost: [] as number[],
  filterColors: [] as string[],
  filterMatchType: "partial" as "partial" | "exact",
  decklistSortAlpha: false,
  showProcessingToasts: true,
};

const layoutPresetsSizes: Record<
  LayoutPreset,
  { pageWidth: number; pageHeight: number; pageSizeUnit: "in" | "mm" }
> = {
  Letter: { pageWidth: 8.5, pageHeight: 11, pageSizeUnit: "in" },
  Tabloid: { pageWidth: 11, pageHeight: 17, pageSizeUnit: "in" },
  A4: { pageWidth: 210, pageHeight: 297, pageSizeUnit: "mm" },
  A3: { pageWidth: 297, pageHeight: 420, pageSizeUnit: "mm" },
  Legal: { pageWidth: 8.5, pageHeight: 14, pageSizeUnit: "in" },
  ArchA: { pageWidth: 9, pageHeight: 12, pageSizeUnit: "in" },
  ArchB: { pageWidth: 12, pageHeight: 18, pageSizeUnit: "in" },
  SuperB: { pageWidth: 13, pageHeight: 19, pageSizeUnit: "in" },
  A2: { pageWidth: 420, pageHeight: 594, pageSizeUnit: "mm" },
  A1: { pageWidth: 594, pageHeight: 841, pageSizeUnit: "mm" },
  Custom: { pageWidth: 8.5, pageHeight: 11, pageSizeUnit: "in" },
};

export const useSettingsStore = create<Store>()(
  persist(
    (set) => ({
      ...defaultPageSettings,

      setPageSizePreset: (value) =>
        set((state) => {
          // For Custom preset, restore saved custom dimensions
          if (value === "Custom") {
            return {
              pageSizePreset: value,
              pageWidth: state.customPageWidth,
              pageHeight: state.customPageHeight,
              pageSizeUnit: state.customPageUnit,
            };
          }

          // For other presets, apply preset dimensions
          const { pageWidth, pageHeight, pageSizeUnit } = layoutPresetsSizes[value];
          return {
            pageSizePreset: value,
            pageOrientation: "portrait", // always reset
            pageWidth,
            pageHeight,
            pageSizeUnit,
          };
        }),

      setPageWidth: (value) =>
        set((state) => ({
          pageWidth: value,
          customPageWidth: value,
          customPageHeight: state.pageHeight, // Sync current height to custom
          pageSizePreset: "Custom",
          customPageUnit: state.pageSizeUnit,
        })),

      setPageHeight: (value) =>
        set((state) => ({
          pageHeight: value,
          customPageHeight: value,
          customPageWidth: state.pageWidth, // Sync current width to custom
          pageSizePreset: "Custom",
          customPageUnit: state.pageSizeUnit,
        })),

      setPageSizeUnit: (newUnit) =>
        set((state) => {
          // If already in the target unit, no conversion needed
          if (state.pageSizeUnit === newUnit) {
            return {};
          }

          // Convert dimensions
          const conversionFactor = newUnit === "mm" ? 25.4 : 1 / 25.4;
          return {
            pageSizeUnit: newUnit,
            pageWidth: state.pageWidth * conversionFactor,
            pageHeight: state.pageHeight * conversionFactor,
            customPageWidth: state.pageWidth * conversionFactor,
            customPageHeight: state.pageHeight * conversionFactor,
            customPageUnit: newUnit,
            pageSizePreset: "Custom",
          };
        }),

      swapPageOrientation: () =>
        set((state) => {
          const isCustom = state.pageSizePreset === "Custom";
          return {
            pageOrientation:
              state.pageOrientation === "portrait" ? "landscape" : "portrait",
            pageWidth: state.pageHeight,
            pageHeight: state.pageWidth,
            // If in Custom mode, also swap the custom dimensions so they persist correctly
            customPageWidth: isCustom ? state.customPageHeight : state.customPageWidth,
            customPageHeight: isCustom ? state.customPageWidth : state.customPageHeight,
          };
        }),

      setColumns: (columns) => set((state) => {
        recordSettingChange("columns", state.columns);
        return { columns };
      }),
      setRows: (rows) => set((state) => {
        recordSettingChange("rows", state.rows);
        return { rows };
      }),
      setBleedEdgeWidth: (value) => set((state) => {
        recordSettingChange("bleedEdgeWidth", state.bleedEdgeWidth);
        return { bleedEdgeWidth: value };
      }),
      setBleedEdge: (value) => set((state) => {
        recordSettingChange("bleedEdge", state.bleedEdge);
        return { bleedEdge: value };
      }),
      setBleedEdgeUnit: (value) => set((state) => {
        recordSettingChange("bleedEdgeUnit", state.bleedEdgeUnit);
        return { bleedEdgeUnit: value };
      }),
      // MPC Images bleed setters
      setMpcBleedMode: (value) => set((state) => {
        recordSettingChange("mpcBleedMode", state.mpcBleedMode);
        return { mpcBleedMode: value };
      }),
      setMpcExistingBleed: (value) => set((state) => {
        recordSettingChange("mpcExistingBleed", state.mpcExistingBleed);
        return { mpcExistingBleed: value };
      }),
      setMpcExistingBleedUnit: (value) => set((state) => {
        recordSettingChange("mpcExistingBleedUnit", state.mpcExistingBleedUnit);
        return { mpcExistingBleedUnit: value };
      }),
      // Other uploads bleed setters
      setUploadBleedMode: (value) => set((state) => {
        recordSettingChange("uploadBleedMode", state.uploadBleedMode);
        return { uploadBleedMode: value };
      }),
      setUploadExistingBleed: (value) => set((state) => {
        recordSettingChange("uploadExistingBleed", state.uploadExistingBleed);
        return { uploadExistingBleed: value };
      }),
      setUploadExistingBleedUnit: (value) => set((state) => {
        recordSettingChange("uploadExistingBleedUnit", state.uploadExistingBleedUnit);
        return { uploadExistingBleedUnit: value };
      }),
      setDarkenNearBlack: (value) => set((state) => {
        recordSettingChange("darkenNearBlack", state.darkenNearBlack);
        return { darkenNearBlack: value };
      }),
      setGuideColor: (value) => set((state) => {
        recordSettingChange("guideColor", state.guideColor);
        return { guideColor: value };
      }),
      setGuideWidth: (value) => set((state) => {
        recordSettingChange("guideWidth", state.guideWidth);
        return { guideWidth: value };
      }),
      setZoom: (value) => set({ zoom: value }), // Zoom is NOT tracked (too frequent)
      setCardSpacingMm: (mm) => set((state) => {
        const value = Math.max(0, mm);
        recordSettingChange("cardSpacingMm", state.cardSpacingMm);
        return { cardSpacingMm: value };
      }),
      setCardPositionX: (mm) => set((state) => {
        recordSettingChange("cardPositionX", state.cardPositionX);
        return { cardPositionX: mm };
      }),
      setCardPositionY: (mm) => set((state) => {
        recordSettingChange("cardPositionY", state.cardPositionY);
        return { cardPositionY: mm };
      }),
      setDpi: (dpi) => set((state) => {
        recordSettingChange("dpi", state.dpi);
        return { dpi };
      }),
      setCutLineStyle: (value) => set((state) => {
        recordSettingChange("cutLineStyle", state.cutLineStyle);
        return { cutLineStyle: value };
      }),
      setPerCardGuideStyle: (value) => set((state) => {
        recordSettingChange("perCardGuideStyle", state.perCardGuideStyle);
        return { perCardGuideStyle: value };
      }),
      setGuidePlacement: (value) => set((state) => {
        recordSettingChange("guidePlacement", state.guidePlacement);
        return { guidePlacement: value };
      }),
      setGlobalLanguage: (lang) => set((state) => {
        recordSettingChange("globalLanguage", state.globalLanguage);
        return { globalLanguage: lang };
      }),
      setPanelOrder: (order) =>
        set((state) => ({
          settingsPanelState: { ...state.settingsPanelState, order },
        })),
      togglePanelCollapse: (id) =>
        set((state) => ({
          settingsPanelState: {
            ...state.settingsPanelState,
            collapsed: {
              ...state.settingsPanelState.collapsed,
              [id]: !state.settingsPanelState.collapsed[id],
            },
          },
        })),
      expandAllPanels: () =>
        set((state) => ({
          settingsPanelState: {
            ...state.settingsPanelState,
            collapsed: state.settingsPanelState.order.reduce(
              (acc, key) => ({ ...acc, [key]: false }),
              {}
            ),
          },
        })),
      collapseAllPanels: () =>
        set((state) => ({
          settingsPanelState: {
            ...state.settingsPanelState,
            collapsed: state.settingsPanelState.order.reduce(
              (acc, key) => ({ ...acc, [key]: true }),
              {}
            ),
          },
        })),
      setSettingsPanelWidth: (width) => set({ settingsPanelWidth: width }),
      toggleSettingsPanel: () =>
        set((state) => ({
          isSettingsPanelCollapsed: !state.isSettingsPanelCollapsed,
        })),
      toggleUploadPanel: () =>
        set((state) => ({
          isUploadPanelCollapsed: !state.isUploadPanelCollapsed,
        })),
      uploadPanelWidth: 320,
      setUploadPanelWidth: (width) => set({ uploadPanelWidth: width }),

      // Sort & Filter
      sortBy: "manual",
      setSortBy: (value) => set((state) => {
        recordSettingChange("sortBy", state.sortBy);
        return { sortBy: value };
      }),
      sortOrder: "asc",
      setSortOrder: (value) => set((state) => {
        recordSettingChange("sortOrder", state.sortOrder);
        return { sortOrder: value };
      }),
      filterManaCost: [],
      setFilterManaCost: (value) => set((state) => {
        recordSettingChange("filterManaCost", state.filterManaCost);
        return { filterManaCost: value };
      }),
      filterColors: [],
      setFilterColors: (value) => set((state) => {
        recordSettingChange("filterColors", state.filterColors);
        return { filterColors: value };
      }),
      filterMatchType: "partial",
      setFilterMatchType: (value) => set((state) => {
        recordSettingChange("filterMatchType", state.filterMatchType);
        return { filterMatchType: value };
      }),
      decklistSortAlpha: false,
      setDecklistSortAlpha: (value) => set({ decklistSortAlpha: value }),
      showProcessingToasts: true,
      setShowProcessingToasts: (value) => set({ showProcessingToasts: value }),
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),

      resetSettings: () => {
        // Capture current state for undo
        const currentState = useSettingsStore.getState();
        const oldSettings = {
          pageSizePreset: currentState.pageSizePreset,
          pageOrientation: currentState.pageOrientation,
          pageWidth: currentState.pageWidth,
          pageHeight: currentState.pageHeight,
          columns: currentState.columns,
          rows: currentState.rows,
          bleedEdge: currentState.bleedEdge,
          bleedEdgeWidth: currentState.bleedEdgeWidth,
          darkenNearBlack: currentState.darkenNearBlack,
          guideColor: currentState.guideColor,
          guideWidth: currentState.guideWidth,
          cardSpacingMm: currentState.cardSpacingMm,
          cardPositionX: currentState.cardPositionX,
          cardPositionY: currentState.cardPositionY,
          dpi: currentState.dpi,
          cutLineStyle: currentState.cutLineStyle,
          perCardGuideStyle: currentState.perCardGuideStyle,
          guidePlacement: currentState.guidePlacement,
          globalLanguage: currentState.globalLanguage,
          sortBy: currentState.sortBy,
          sortOrder: currentState.sortOrder,
          filterManaCost: currentState.filterManaCost,
          filterColors: currentState.filterColors,
          filterMatchType: currentState.filterMatchType,
        };

        // Reset to defaults
        set({ ...defaultPageSettings });

        // Record undo action
        useUndoRedoStore.getState().pushAction({
          type: "CHANGE_SETTING",
          description: "Reset settings",
          undo: async () => {
            useSettingsStore.setState(oldSettings);
          },
          redo: async () => {
            useSettingsStore.setState({ ...defaultPageSettings });
          },
        });
      },
    }),
    {
      name: "proxxied:layout-settings:v1",
      storage: createJSONStorage(() => indexedDbStorage),
      version: 6, // Increment version for perCardGuideStyle

      partialize: (state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { pageWidth, pageHeight, pageSizeUnit, hasHydrated, ...rest } = state;
        return rest;
      },

      migrate: (persistedState: unknown, version) => {
        if (!persistedState || typeof persistedState !== "object") {
          return defaultPageSettings;
        }

        if (version < 2) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { pageWidth, pageHeight, pageSizeUnit, ...rest } =
            persistedState as Partial<Store>;
          return { ...defaultPageSettings, ...rest };
        }

        if (version < 3) {
          return { ...defaultPageSettings, ...(persistedState as Partial<Store>) };
        }

        if (version < 4) {
          return {
            ...defaultPageSettings,
            ...(persistedState as Partial<Store>),
            sortBy: "manual",
          };
        }

        if (version < 7) {
          return {
            ...defaultPageSettings,
            ...(persistedState as Partial<Store>),
            perCardGuideStyle: 'corners',
          };
        }

        return persistedState as Partial<Store>;
      },

      merge: (persistedState, currentState) => {
        const merged = { ...currentState, ...(persistedState as Partial<Store>) };

        const preset = merged.pageSizePreset ?? defaultPageSettings.pageSizePreset;
        const orientation = merged.pageOrientation ?? defaultPageSettings.pageOrientation;

        // If Custom, use the persisted custom values directly (they represent the visible state)
        if (preset === "Custom") {
          merged.pageWidth = merged.customPageWidth;
          merged.pageHeight = merged.customPageHeight;
          merged.pageSizeUnit = merged.customPageUnit;
          return merged;
        }

        // For other presets, calculate based on orientation
        const {
          pageWidth: portraitWidth,
          pageHeight: portraitHeight,
          pageSizeUnit,
        } = layoutPresetsSizes[preset];

        const isLandscape = orientation === "landscape";

        merged.pageWidth = isLandscape ? portraitHeight : portraitWidth;
        merged.pageHeight = isLandscape ? portraitWidth : portraitHeight;
        merged.pageSizeUnit = pageSizeUnit;

        return merged;
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
