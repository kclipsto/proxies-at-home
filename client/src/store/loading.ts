import { create } from "zustand";

type LoadingTask =
  | "Fetching cards"
  | "Processing Images"
  | "Generating PDF"
  | "Uploading Images"
  | "Clearing Images"
  | "Exporting ZIP"
  | "Adding Card"
  | null;

type Store = {
  loadingTask: LoadingTask;
  loadingMessage: string | null;
  progress: number;
  onCancel: (() => void) | null;
  setLoadingTask: (loadingTask: LoadingTask) => void;
  setLoadingMessage: (message: string | null) => void;
  setProgress: (progress: number) => void;
  setOnCancel: (onCancel: (() => void) | null) => void;
};

export const useLoadingStore = create<Store>((set) => ({
  loadingTask: null,
  loadingMessage: null,
  progress: 0,
  onCancel: null,
  setLoadingTask: (loadingTask) =>
    set({ loadingTask, progress: -1, onCancel: null, loadingMessage: null }),
  setLoadingMessage: (message) => set({ loadingMessage: message }),
  setProgress: (progress) => set({ progress }),
  setOnCancel: (onCancel) => set({ onCancel }),
}));
