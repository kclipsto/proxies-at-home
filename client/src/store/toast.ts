import { create } from "zustand";
import { useSettingsStore } from "./settings";

interface Toast {
    id: string;
    type: "processing" | "metadata" | "success" | "copy" | "error";
    message: string;
    dismissible: boolean;
}

type ToastStore = {
    toasts: Toast[];
    addToast: (toast: Omit<Toast, "id">) => string;
    removeToast: (id: string) => void;
    clearToasts: () => void;
    showProcessingToast: () => void;
    hideProcessingToast: () => void;
    showMetadataToast: () => void;
    hideMetadataToast: () => void;
    showSuccessToast: (cardName: string) => void;
    showCopyToast: (message: string) => void;
    showInfoToast: (message: string) => void;
    showErrorToast: (message: string) => void;
};

export const useToastStore = create<ToastStore>((set, get) => ({
    toasts: [],

    addToast: (toast) => {
        const id = `${toast.type}-${Date.now()}`;
        set((state) => ({
            toasts: [...state.toasts, { ...toast, id }],
        }));
        return id;
    },

    removeToast: (id) => {
        set((state) => ({
            toasts: state.toasts.filter((t) => t.id !== id),
        }));
    },

    clearToasts: () => {
        set({ toasts: [] });
    },

    showProcessingToast: () => {
        // Check if toasts are enabled
        if (!useSettingsStore.getState().showProcessingToasts) return;

        const { toasts, addToast } = get();
        // Only add if not already showing a processing toast
        if (!toasts.some((t) => t.type === "processing")) {
            addToast({
                type: "processing",
                message: "Processing images...",
                dismissible: true,
            });
        }
    },

    hideProcessingToast: () => {
        set((state) => ({
            toasts: state.toasts.filter((t) => t.type !== "processing"),
        }));
    },

    showMetadataToast: () => {
        // Check if toasts are enabled
        if (!useSettingsStore.getState().showProcessingToasts) return;

        const { toasts, addToast } = get();
        // Only add if not already showing a metadata toast
        if (!toasts.some((t) => t.type === "metadata")) {
            addToast({
                type: "metadata",
                message: "Fetching metadata...",
                dismissible: true,
            });
        }
    },

    hideMetadataToast: () => {
        set((state) => ({
            toasts: state.toasts.filter((t) => t.type !== "metadata"),
        }));
    },

    showSuccessToast: (cardName: string) => {
        const { toasts, addToast, removeToast } = get();
        // Remove any existing success toasts to prevent stacking
        toasts.filter(t => t.type === "success").forEach(t => removeToast(t.id));
        const id = addToast({
            type: "success",
            message: `Added ${cardName}`,
            dismissible: false,
        });
        // Auto-dismiss after 2 seconds
        setTimeout(() => {
            removeToast(id);
        }, 2000);
    },

    showInfoToast: (message: string) => {
        const { toasts, addToast, removeToast } = get();
        // Remove any existing info toasts to prevent stacking
        toasts.filter(t => t.type === "copy").forEach(t => removeToast(t.id)); // Reuse copy type for now or add new type?
        // Actually interface allows "copy" | "success" | "error" | "processing" | "metadata"
        // I should update interface if I want "info" type.
        // For now, let's just use "copy" type which is likely blue/neutral.
        const id = addToast({
            type: "copy", // Reuse copy style
            message,
            dismissible: true,
        });
        // Auto-dismiss after 4 seconds
        setTimeout(() => {
            removeToast(id);
        }, 4000);
    },

    showCopyToast: (message: string) => {
        const { toasts, addToast, removeToast } = get();
        // Remove any existing copy toasts to prevent stacking
        toasts.filter(t => t.type === "copy").forEach(t => removeToast(t.id));
        const id = addToast({
            type: "copy",
            message,
            dismissible: false,
        });
        // Auto-dismiss after 2 seconds
        setTimeout(() => {
            removeToast(id);
        }, 2000);
    },

    showErrorToast: (message: string) => {
        const { toasts, addToast, removeToast } = get();
        // Remove any existing error toasts to prevent stacking
        toasts.filter(t => t.type === "error").forEach(t => removeToast(t.id));
        const id = addToast({
            type: "error",
            message,
            dismissible: true,
        });
        // Auto-dismiss after 8 seconds for errors
        setTimeout(() => {
            removeToast(id);
        }, 8000);
    },
}));

