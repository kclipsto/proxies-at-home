import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { indexedDbStorage } from "./indexedDbStorage";
import { recordSettingChange } from "@/helpers/undoableSettings";
import { useUndoRedoStore } from "./undoRedo";

export type LayoutPreset = "A4" | "A3" | "Letter" | "Tabloid" | "Legal" | "ArchA" | "ArchB" | "SuperB" | "A2" | "A1" | "Custom";
export type PageOrientation = "portrait" | "landscape";
export type DarkenMode = 'none' | 'darken-all' | 'contrast-edges' | 'contrast-full';

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
  // Images with bleed already built in (e.g., MPC Autofill exports)
  // --- Bleed Settings (New Source/Target Architecture) ---
  // Images WITH built-in bleed (e.g., MPC Autofill exports)
  withBleedSourceAmount: number;
  setWithBleedSourceAmount: (value: number) => void;
  withBleedTargetMode: 'global' | 'manual' | 'none';
  setWithBleedTargetMode: (value: 'global' | 'manual' | 'none') => void;
  withBleedTargetAmount: number;
  setWithBleedTargetAmount: (value: number) => void;

  // Images WITHOUT bleed built in (regular uploads, Scryfall)
  // noBleedSourceAmount is implicitly 0
  noBleedTargetMode: 'global' | 'manual' | 'none';
  setNoBleedTargetMode: (value: 'global' | 'manual' | 'none') => void;
  noBleedTargetAmount: number;
  setNoBleedTargetAmount: (value: number) => void;
  darkenMode: DarkenMode;
  setDarkenMode: (value: DarkenMode) => void;
  darkenContrast: number;
  setDarkenContrast: (value: number) => void;
  darkenEdgeWidth: number;
  setDarkenEdgeWidth: (value: number) => void;
  darkenAmount: number;
  setDarkenAmount: (value: number) => void;
  darkenBrightness: number;
  setDarkenBrightness: (value: number) => void;
  darkenAutoDetect: boolean;
  setDarkenAutoDetect: (value: boolean) => void;
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
  perCardGuideStyle: 'corners' | 'rounded-corners' | 'dashed-corners' | 'dashed-rounded-corners' | 'solid-squared-rect' | 'dashed-squared-rect' | 'dashed-rounded-rect' | 'solid-rounded-rect' | 'none';
  setPerCardGuideStyle: (value: 'corners' | 'rounded-corners' | 'dashed-corners' | 'dashed-rounded-corners' | 'solid-squared-rect' | 'dashed-squared-rect' | 'dashed-rounded-rect' | 'solid-rounded-rect' | 'none') => void;
  guidePlacement: 'inside' | 'outside' | 'center';
  setGuidePlacement: (value: 'inside' | 'outside' | 'center') => void;
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
  filterTypes: string[];
  setFilterTypes: (value: string[]) => void;
  filterCategories: string[];
  setFilterCategories: (value: string[]) => void;
  filterSectionCollapsed: Record<string, boolean>;
  setFilterSectionCollapsed: (section: string, collapsed: boolean) => void;
  filterMatchType: "partial" | "exact";
  setFilterMatchType: (value: "partial" | "exact") => void;
  decklistSortAlpha: boolean;
  setDecklistSortAlpha: (value: boolean) => void;
  showProcessingToasts: boolean;
  setShowProcessingToasts: (value: boolean) => void;
  defaultCardbackId: string;
  setDefaultCardbackId: (id: string) => void;
  exportMode: 'fronts' | 'interleaved-all' | 'interleaved-custom' | 'duplex' | 'backs';
  setExportMode: (value: 'fronts' | 'interleaved-all' | 'interleaved-custom' | 'duplex' | 'backs') => void;
  // Card Editor section state (all expanded by default)
  cardEditorSectionCollapsed: Record<string, boolean>;
  setCardEditorSectionCollapsed: (section: string, collapsed: boolean) => void;
  cardEditorSectionOrder: string[];
  setCardEditorSectionOrder: (order: string[]) => void;
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
  // --- Bleed Settings (New Source/Target Architecture) ---
  // 1. Source Bleed: What the image has
  // 2. Target Bleed: What the output should have

  // Images WITH built-in bleed (e.g. MPC)
  withBleedSourceAmount: 3.175, // Default 1/8" for MPC/Uploads with bleed
  withBleedTargetMode: 'global' as 'global' | 'manual' | 'none', // 'global' | 'manual' | 'none'
  withBleedTargetAmount: 3.175, // Default to 1/8"

  // Images WITHOUT built-in bleed (e.g. Scryfall)
  // noBleedSourceAmount is implicitly 0
  noBleedTargetMode: 'global' as 'global' | 'manual' | 'none', // 'global' | 'manual' | 'none'
  noBleedTargetAmount: 1,
  darkenMode: 'contrast-edges' as DarkenMode,
  darkenContrast: 2.0,
  darkenEdgeWidth: 0.08,
  darkenAmount: 1.0,
  darkenBrightness: -50,
  darkenAutoDetect: true,
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
    order: ["layout", "bleed", "darken", "guides", "card", "filterSort", "application"],
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
  filterTypes: [] as string[],
  filterCategories: [] as string[],
  filterSectionCollapsed: {} as Record<string, boolean>,
  filterMatchType: "partial" as "partial" | "exact",
  decklistSortAlpha: false,
  showProcessingToasts: true,
  defaultCardbackId: "cardback_builtin_mtg",  // Default to MTG cardback
  exportMode: "fronts" as 'fronts' | 'interleaved-all' | 'interleaved-custom' | 'duplex' | 'backs',
  // Card Editor section state - all expanded by default (empty = not collapsed)
  cardEditorSectionCollapsed: {} as Record<string, boolean>,
  cardEditorSectionOrder: ['basic', 'darkPixels', 'enhance', 'holographic', 'colorReplace', 'gamma', 'colorEffects', 'borderEffects'],
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
      // Images with bleed setters
      // Images with bleed setters (New Source/Target)
      setWithBleedSourceAmount: (value) => set((state) => {
        recordSettingChange("withBleedSourceAmount", state.withBleedSourceAmount);
        return { withBleedSourceAmount: value };
      }),
      setWithBleedTargetMode: (value) => set((state) => {
        recordSettingChange("withBleedTargetMode", state.withBleedTargetMode);
        return { withBleedTargetMode: value };
      }),
      setWithBleedTargetAmount: (value) => set((state) => {
        recordSettingChange("withBleedTargetAmount", state.withBleedTargetAmount);
        return { withBleedTargetAmount: value };
      }),

      // Images without bleed setters
      setNoBleedTargetMode: (value) => set((state) => {
        recordSettingChange("noBleedTargetMode", state.noBleedTargetMode);
        return { noBleedTargetMode: value };
      }),
      setNoBleedTargetAmount: (value) => set((state) => {
        recordSettingChange("noBleedTargetAmount", state.noBleedTargetAmount);
        return { noBleedTargetAmount: value };
      }),
      setDarkenMode: (value) => set((state) => {
        recordSettingChange("darkenMode", state.darkenMode);
        return { darkenMode: value };
      }),
      setDarkenContrast: (value) => set((state) => {
        recordSettingChange("darkenContrast", state.darkenContrast);
        return { darkenContrast: value };
      }),
      setDarkenEdgeWidth: (value) => set((state) => {
        recordSettingChange("darkenEdgeWidth", state.darkenEdgeWidth);
        return { darkenEdgeWidth: value };
      }),
      setDarkenAmount: (value) => set((state) => {
        recordSettingChange("darkenAmount", state.darkenAmount);
        return { darkenAmount: value };
      }),
      setDarkenBrightness: (value) => set((state) => {
        recordSettingChange("darkenBrightness", state.darkenBrightness);
        return { darkenBrightness: value };
      }),
      setDarkenAutoDetect: (value) => set((state) => {
        recordSettingChange("darkenAutoDetect", state.darkenAutoDetect);
        return { darkenAutoDetect: value };
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
      filterTypes: [],
      setFilterTypes: (value) => set((state) => {
        recordSettingChange("filterTypes", state.filterTypes);
        return { filterTypes: value };
      }),
      filterCategories: [],
      setFilterCategories: (value) => set((state) => {
        recordSettingChange("filterCategories", state.filterCategories);
        return { filterCategories: value };
      }),
      filterSectionCollapsed: {},
      setFilterSectionCollapsed: (section, collapsed) => set((state) => ({
        filterSectionCollapsed: { ...state.filterSectionCollapsed, [section]: collapsed }
      })),
      filterMatchType: "partial",
      setFilterMatchType: (value) => set((state) => {
        recordSettingChange("filterMatchType", state.filterMatchType);
        return { filterMatchType: value };
      }),
      decklistSortAlpha: false,
      setDecklistSortAlpha: (value) => set({ decklistSortAlpha: value }),
      showProcessingToasts: true,
      setShowProcessingToasts: (value) => set({ showProcessingToasts: value }),
      defaultCardbackId: "cardback_builtin_mtg",
      setDefaultCardbackId: (id) => set({ defaultCardbackId: id }),
      exportMode: "fronts",
      setExportMode: (value) => set({ exportMode: value }),
      // Card Editor section state
      cardEditorSectionCollapsed: {},
      setCardEditorSectionCollapsed: (section, collapsed) => set((state) => ({
        cardEditorSectionCollapsed: { ...state.cardEditorSectionCollapsed, [section]: collapsed }
      })),
      cardEditorSectionOrder: ['basic', 'darkPixels', 'enhance', 'holographic', 'colorReplace', 'gamma', 'colorEffects', 'borderEffects'],
      setCardEditorSectionOrder: (order) => set({ cardEditorSectionOrder: order }),
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
          darkenMode: currentState.darkenMode,
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
      version: 9, // Increment from main (v8) for advanced editor features

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

        if (version < 8) {
          // Migration from legacy bleed settings to Source/Target
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const old = persistedState as any;
          const newState = {
            ...defaultPageSettings,
            ...(persistedState as Partial<Store>),
          };

          // With Bleed Migration
          newState.withBleedSourceAmount = old.withBleedAmount ?? 3.175;

          if (old.overrideWithBleedGenerate) {
            newState.withBleedTargetMode = 'manual';
            newState.withBleedTargetAmount = old.withBleedGenerateAmount ?? 3.175;
          } else if (old.withBleedMode === 'none') {
            newState.withBleedTargetMode = 'none';
          } else {
            // 'generate' or 'use-existing' (which was basically just "don't generate extra" if matched)
            // Default to global
            newState.withBleedTargetMode = 'global';
          }

          // No Bleed Migration
          if (old.overrideNoBleedGenerate) {
            newState.noBleedTargetMode = 'manual';
            newState.noBleedTargetAmount = old.noBleedGenerateAmount ?? 3.175;
          } else if (old.noBleedMode === 'none') {
            newState.noBleedTargetMode = 'none';
          } else {
            newState.noBleedTargetMode = 'global';
          }

          return newState;
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
