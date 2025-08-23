import { create } from "zustand";
import { persist } from "zustand/middleware";

export type LayoutPreset = "A4" | "A3" | "Letter" | "Tabloid";
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
};

export const useSettingsStore = create<Store>()(
  persist(
    (set) => ({
      ...defaultPageSettings,

      setPageSizePreset: (value) =>
        set({ pageSizePreset: value, ...layoutPresetsSizes[value] }),
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
      resetSettings: () => set({ ...defaultPageSettings }),
    }),
    {
      name: "proxxied:layout-settings:v1",
    }
  )
);
