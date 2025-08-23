import { create } from "zustand";

export type LoadingTask =
  | "Fetching cards"
  | "Processing Images"
  | "Generating PDF"
  | "Uploading Images"
  | "Clearing Images"
  | null;

type Store = {
  loadingTask: LoadingTask;
  setLoadingTask: (loadingTask: LoadingTask) => void;
};

export const useLoadingStore = create<Store>((set) => ({
  loadingTask: null,
  setLoadingTask: (loadingTask) => set({ loadingTask }),
}));
