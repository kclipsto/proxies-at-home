import { create } from "zustand";
import { persist } from "zustand/middleware";

type Store = {
  pageWidthIn: number;
  setPageWidthIn: (value: number) => void;
  pageHeightIn: number;
  setPageHeightIn: (value: number) => void;
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
  pageWidthIn: 8.5,
  pageHeightIn: 11,
  columns: 3,
  rows: 3,
  bleedEdgeWidth: 1,
  bleedEdge: true,
  guideColor: "#39FF14",
  guideWidth: 0.5,
  zoom: 1,
};

export const useSettingsStore = create<Store>()(
  persist(
    (set) => ({
      ...defaultPageSettings,

      setPageWidthIn: (value) => set({ pageWidthIn: value }),
      setPageHeightIn: (value) => set({ pageHeightIn: value }),
      swapPageOrientation: () =>
        set((state) => ({
          pageWidthIn: state.pageHeightIn,
          pageHeightIn: state.pageWidthIn,
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
