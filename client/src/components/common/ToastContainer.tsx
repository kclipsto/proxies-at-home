import { X, Check, Copy, AlertTriangle } from "lucide-react";
import { useToastStore } from "@/store/toast";

export function ToastContainer() {
    const toasts = useToastStore((state) => state.toasts);
    const removeToast = useToastStore((state) => state.removeToast);

    if (toasts.length === 0) return null;

    return (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-200000 pointer-events-auto">
            {toasts.map((toast) => {
                const isSuccess = toast.type === "success";
                const isCopy = toast.type === "copy";
                const isError = toast.type === "error";
                const isGreen = isSuccess || isCopy;

                // Determine background color
                let bgClass = "bg-blue-600";
                if (isGreen) bgClass = "bg-green-600";
                if (isError) bgClass = "bg-red-600";

                // Determine animation
                const animClass = isGreen ? "animate-fade-in-out" : "animate-fade-in";

                return (
                    <div
                        key={toast.id}
                        className={`${bgClass} ${animClass} text-white px-4 py-2 rounded-lg shadow-xl shadow-black/30 ring-1 ring-black/10 text-sm flex items-start gap-3 max-w-md`}
                    >
                        {isSuccess ? (
                            <Check className="h-4 w-4 shrink-0 mt-0.5" />
                        ) : isCopy ? (
                            <Copy className="h-4 w-4 shrink-0 mt-0.5" />
                        ) : isError ? (
                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        ) : (
                            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full shrink-0 mt-0.5" />
                        )}
                        <span className={`${isError ? 'max-h-40 overflow-y-auto wrap-break-word' : 'whitespace-nowrap'}`}>
                            {toast.message}
                        </span>
                        {toast.dismissible && (
                            <button
                                onClick={() => removeToast(toast.id)}
                                className={`ml-1 p-0.5 ${isError ? 'hover:bg-red-500' : 'hover:bg-blue-500'} rounded transition-colors shrink-0`}
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

