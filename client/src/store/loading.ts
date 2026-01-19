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
  // Counter that increments when image displayBlobs are updated
  // Used to force useLiveQuery to re-fetch when Dexie observation fails
  imageVersion: number;
  setLoadingTask: (loadingTask: LoadingTask) => void;
  setLoadingMessage: (message: string | null) => void;
  setProgress: (progress: number) => void;
  setOnCancel: (onCancel: (() => void) | null) => void;
  incrementImageVersion: () => void;
  incrementImageVersionDebounced: () => void;
};

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export const useLoadingStore = create<Store>((set) => ({
  loadingTask: null,
  loadingMessage: null,
  progress: 0,
  onCancel: null,
  imageVersion: 0,
  setLoadingTask: (loadingTask) =>
    set({ loadingTask, progress: -1, onCancel: null, loadingMessage: null }),
  setLoadingMessage: (message) => set({ loadingMessage: message }),
  setProgress: (progress) => set({ progress }),
  setOnCancel: (onCancel) => set({ onCancel }),
  incrementImageVersion: () => set((state) => ({ imageVersion: state.imageVersion + 1 })),
  incrementImageVersionDebounced: () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      set((state) => ({ imageVersion: state.imageVersion + 1 }));
      debounceTimer = null;
    }, 200);
  },
}));
