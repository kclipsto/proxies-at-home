import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  guideColor: "#39FF14",
  guideWidth: 0.5,
  cardSpacingMm: 0,
  cardPositionX: 0,
  cardPositionY: 0,
  zoom: 1,
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
    (set, _) => ({
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
      setGuideColor: (value) => set({ guideColor: value }),
      setGuideWidth: (value) => set({ guideWidth: value }),
      setZoom: (value) => set({ zoom: value }),
      setCardSpacingMm: (mm) => set({ cardSpacingMm: Math.max(0, mm) }),
      setCardPositionX: (mm) => set({ cardPositionX: mm }),
      setCardPositionY: (mm) => set({ cardPositionY: mm }),
      resetSettings: () => set({ ...defaultPageSettings }),
    }),
    {
      name: "proxxied:layout-settings:v1",
      version: 2,

      partialize: (state) => {
        const { pageOrientation, pageWidth, pageHeight, pageSizeUnit, ...rest } = state;
        return rest;
      },

      migrate: (persistedState, _version) => {
        const { pageOrientation, pageWidth, pageHeight, pageSizeUnit, ...rest } =
          (persistedState as any) ?? {};
        return rest;
      },

      onRehydrateStorage: () => (state, error) => {
        if (error) return;
        const preset = state?.pageSizePreset ?? "Letter";
        state?.setPageSizePreset?.(preset);
      },
    }
  )

);
