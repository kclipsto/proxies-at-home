import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { indexedDbStorage } from "./indexedDbStorage";

export type LayoutPreset = "A4" | "A3" | "Letter" | "Tabloid" | "Legal" | "ArchA" | "ArchB" | "SuperB" | "A2" | "A1";
export type PageOrientation = "portrait" | "landscape";

type Store = {
  pageSizeUnit: "mm" | "in";
  pageOrientation: PageOrientation;
  pageSizePreset: LayoutPreset;
  setPageSizePreset: (value: LayoutPreset) => void;
  pageWidth: number;
  pageHeight: number;
  swapPageOrientation: () => void;
  columns: number;
  setColumns: (value: number) => void;
  rows: number;
  setRows: (value: number) => void;
  bleedEdgeWidth: number;
  setBleedEdgeWidth: (value: number) => void;
  bleedEdge: boolean;
  setBleedEdge: (value: boolean) => void;
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
  globalLanguage: string;
  setGlobalLanguage: (lang: string) => void;
  settingsPanelState: {
    order: string[];
    collapsed: Record<string, boolean>;
  };
  setPanelOrder: (order: string[]) => void;
  togglePanelCollapse: (id: string) => void;
  settingsPanelWidth: number;
  setSettingsPanelWidth: (width: number) => void;
  isSettingsPanelCollapsed: boolean;
  toggleSettingsPanel: () => void;
  isUploadPanelCollapsed: boolean;
  toggleUploadPanel: () => void;
  uploadPanelWidth: number;
  setUploadPanelWidth: (width: number) => void;
};

const defaultPageSettings = {
  pageSizeUnit: "in",
  pageOrientation: "portrait",
  pageSizePreset: "Letter",
  pageWidth: 8.5,
  pageHeight: 11,
  columns: 3,
  rows: 3,
  bleedEdgeWidth: 1,
  bleedEdge: true,
  darkenNearBlack: true,
  guideColor: "#39FF14",
  guideWidth: 0.5,
  cardSpacingMm: 0,
  cardPositionX: 0,
  cardPositionY: 0,
  zoom: 1,
  dpi: 900,
  cutLineStyle: "full",
  globalLanguage: "en",
  settingsPanelState: {
    order: ["layout", "bleed", "guides", "card", "application"],
    collapsed: {},
  },
  settingsPanelWidth: 320,
  isSettingsPanelCollapsed: false,
  uploadPanelWidth: 320,
  isUploadPanelCollapsed: false,
} as Store;

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
};

export const useSettingsStore = create<Store>()(
  persist(
    (set) => ({
      ...defaultPageSettings,

      setPageSizePreset: (value) =>
        set(() => {
          const { pageWidth, pageHeight, pageSizeUnit } = layoutPresetsSizes[value];
          return {
            pageSizePreset: value,
            pageOrientation: "portrait", // always reset
            pageWidth,
            pageHeight,
            pageSizeUnit,
          };
        }),

      swapPageOrientation: () =>
        set((state) => ({
          pageOrientation:
            state.pageOrientation === "portrait" ? "landscape" : "portrait",
          pageWidth: state.pageHeight,
          pageHeight: state.pageWidth,
        })),

      setColumns: (columns) => set({ columns }),
      setRows: (rows) => set({ rows }),
      setBleedEdgeWidth: (value) => set({ bleedEdgeWidth: value }),
      setBleedEdge: (value) => set({ bleedEdge: value }),
      setDarkenNearBlack: (value) => set({ darkenNearBlack: value }),
      setGuideColor: (value) => set({ guideColor: value }),
      setGuideWidth: (value) => set({ guideWidth: value }),
      setZoom: (value) => set({ zoom: value }),
      setCardSpacingMm: (mm) => set({ cardSpacingMm: Math.max(0, mm) }),
      setCardPositionX: (mm) => set({ cardPositionX: mm }),
      setCardPositionY: (mm) => set({ cardPositionY: mm }),
      setDpi: (dpi) => set({ dpi }),
      setCutLineStyle: (value) => set({ cutLineStyle: value }),
      setGlobalLanguage: (lang) => set({ globalLanguage: lang }),
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
      resetSettings: () => set({ ...defaultPageSettings }),
    }),
    {
      name: "proxxied:layout-settings:v1",
      storage: createJSONStorage(() => indexedDbStorage),
      version: 2,

      partialize: (state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { pageWidth, pageHeight, pageSizeUnit, ...rest } = state;
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
          return rest;
        }

        return persistedState as Partial<Store>;
      },

      merge: (persistedState, currentState) => {
        const merged = { ...currentState, ...(persistedState as Partial<Store>) };

        const preset = merged.pageSizePreset ?? defaultPageSettings.pageSizePreset;
        const orientation = merged.pageOrientation ?? defaultPageSettings.pageOrientation;

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
    }
  )

);
