import { X } from "lucide-react";
import { useToastStore } from "../store/toast";

export function ToastContainer() {
    const toasts = useToastStore((state) => state.toasts);
    const removeToast = useToastStore((state) => state.removeToast);

    if (toasts.length === 0) return null;

    return (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-[100] pointer-events-auto">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm flex items-center gap-3 whitespace-nowrap animate-fade-in"
                >
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full flex-shrink-0" />
                    <span>{toast.message}</span>
                    {toast.dismissible && (
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="ml-1 p-0.5 hover:bg-blue-500 rounded transition-colors flex-shrink-0"
                            aria-label="Dismiss"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}
