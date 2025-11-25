import React from "react";
import { ChevronRight } from "lucide-react";

type Props = {
    onToggle: () => void;
    onResizeStart: (e: React.MouseEvent) => void;
    onReset?: () => void;
    className?: string;
    isCollapsed?: boolean;
    side?: "left" | "right";
};

export function ResizeHandle({
    onToggle,
    onResizeStart,
    onReset,
    className = "",
    isCollapsed,
    side = "right",
}: Props) {
    const rotationClass =
        side === "left"
            ? isCollapsed
                ? ""
                : "rotate-180"
            : isCollapsed
                ? "rotate-180"
                : "";

    return (
        <div
            className={`relative w-4 group z-50 flex items-center justify-center transition-all focus:outline-none cursor-col-resize ${className}`}
            onMouseDown={onResizeStart}
            onDoubleClick={(e) => {
                e.stopPropagation();
                onReset?.();
            }}
        >
            {/* Visible line */}
            <div className="absolute inset-y-0 left-1/2 w-[1px] bg-transparent group-hover:bg-blue-500 transition-colors" />

            {/* Pill Button */}
            <button
                onMouseDown={(e) => e.stopPropagation()} // Prevent drag start when clicking button
                onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                }}
                className={`absolute left-1/2 -translate-x-1/2 p-0.5 h-50 w-5 rounded-full shadow-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 opacity-0 group-hover:opacity-100 flex items-center justify-center ${rotationClass}`}
            >
                <ChevronRight className="size-3" />
            </button>
        </div>
    );
}
