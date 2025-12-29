import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import React from "react";
import { X } from "lucide-react";

type Props = {
    id: string;
    title: string;
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
    icon: React.ElementType;
    mobile?: boolean;
    badge?: number;
    onClearBadge?: () => void;
};

export function SettingsPanel({ id, title, isOpen, onToggle, children, icon: Icon, mobile, badge, onClearBadge }: Props) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.5 : 1,
    };

    const handleClearBadge = (e: React.MouseEvent) => {
        e.stopPropagation();
        onClearBadge?.();
    };

    return (
        <div
            ref={setNodeRef}
            id={`settings-panel-${id}`}
            style={style}
            className={`bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 last:border-b-0 ${mobile ? 'landscape:border landscape:border-gray-300 landscape:dark:border-gray-600 landscape:rounded-lg landscape:overflow-hidden landscape:shadow-sm' : ''}`}
        >
            <div
                {...attributes}
                {...listeners}
                onClick={onToggle}
                style={{ touchAction: "none" }}
                className={`flex items-center px-3 ${mobile ? 'py-5' : 'py-3'} bg-gray-200 dark:bg-gray-800 select-none cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-900 transition-colors gap-2 text-base font-medium text-gray-700 dark:text-gray-200`}
            >
                <div className="relative">
                    <Icon className="size-5" />
                    {badge !== undefined && badge > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white ring-2 ring-white dark:ring-gray-800">
                            {badge}
                        </span>
                    )}
                </div>
                {title}
                {badge !== undefined && badge > 0 && onClearBadge && (
                    <button
                        type="button"
                        onClick={handleClearBadge}
                        className="p-0.5 rounded hover:bg-gray-400 dark:hover:bg-gray-600 active:translate-y-px cursor-pointer"
                        title="Clear all filters"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>


            {isOpen && !isDragging && <div className="p-4 space-y-4">{children}</div>}
        </div >
    );
}

