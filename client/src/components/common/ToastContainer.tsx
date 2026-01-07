import { X, Check, Copy } from "lucide-react";
import { useToastStore } from "@/store/toast";

export function ToastContainer() {
    const toasts = useToastStore((state) => state.toasts);
    const removeToast = useToastStore((state) => state.removeToast);

    if (toasts.length === 0) return null;

    return (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-200000 pointer-events-auto">
            {toasts.map((toast) => {
                const isSuccess = toast.type === "success";
                const isCopy = toast.type === "copy";
                const isGreen = isSuccess || isCopy;
                return (
                    <div
                        key={toast.id}
                        className={`${isGreen ? "bg-green-600 animate-fade-in-out" : "bg-blue-600 animate-fade-in"} text-white px-4 py-2 rounded-lg shadow-xl shadow-black/30 ring-1 ring-black/10 text-sm flex items-center gap-3 whitespace-nowrap`}
                    >
                        {isSuccess ? (
                            <Check className="h-4 w-4 shrink-0" />
                        ) : isCopy ? (
                            <Copy className="h-4 w-4 shrink-0" />
                        ) : (
                            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full shrink-0" />
                        )}
                        <span>{toast.message}</span>
                        {toast.dismissible && (
                            <button
                                onClick={() => removeToast(toast.id)}
                                className="ml-1 p-0.5 hover:bg-blue-500 rounded transition-colors shrink-0"
                                aria-label="Dismiss"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

