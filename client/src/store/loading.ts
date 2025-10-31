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
  progress: number;
  onCancel: (() => void) | null;
  setLoadingTask: (loadingTask: LoadingTask) => void;
  setProgress: (progress: number) => void;
  setOnCancel: (onCancel: (() => void) | null) => void;
};

export const useLoadingStore = create<Store>((set) => ({
  loadingTask: null,
  progress: 0,
  onCancel: null,
  setLoadingTask: (loadingTask) =>
    set({ loadingTask, progress: 0, onCancel: null }),
  setProgress: (progress) => set({ progress }),
  setOnCancel: (onCancel) => set({ onCancel }),
}));
