import { type ReactNode } from 'react';

export interface ToggleOption<T extends string> {
    id: T;
    label: string;
    icon?: ReactNode;
    /** Optional custom highlight color when this option is selected (CSS color value) */
    highlightColor?: string;
}

export interface ToggleButtonGroupProps<T extends string> {
    options: ToggleOption<T>[];
    value: T;
    onChange: (value: T) => void;
    className?: string;
    /**
     * When true, renders buttons in a vertical stack with sideways text.
     * Useful for landscape sidebar layouts where horizontal space is limited.
     */
    vertical?: boolean;
}

/**
 * A reusable toggle button group for switching between options.
 * Used for source selection (Scryfall/MPC) in artwork modals.
 * 
 * Supports two modes:
 * - Horizontal (default): Standard 2-column grid layout
 * - Vertical: Single column with rotated text for sidebars
 * 
 * Individual options can have custom highlight colors when selected.
 */
export function ToggleButtonGroup<T extends string>({
    options,
    value,
    onChange,
    className = "",
    vertical = false,
}: ToggleButtonGroupProps<T>) {
    // Container classes based on orientation
    // For vertical mode, use auto-rows-fr to ensure equal button sizes
    const colsClass = ({ 2: 'grid-cols-2', 3: 'grid-cols-3' } as Record<number, string>)[options.length] || 'grid-cols-2';
    const containerClasses = vertical
        ? 'grid grid-cols-1 auto-rows-fr rounded-lg bg-gray-100 dark:bg-gray-600 p-0.5 w-auto'
        : `grid ${colsClass} rounded-lg bg-gray-100 dark:bg-gray-600 p-0.5 h-10`;

    // Button classes based on orientation
    const buttonOrientationClasses = vertical
        ? '[writing-mode:sideways-lr]'
        : '';

    const getSelectedClasses = (option: ToggleOption<T>) => {
        if (option.highlightColor) {
            // Use custom color with inline style
            return 'shadow-sm text-white';
        }
        // Default selected style
        return 'bg-white dark:bg-gray-500 text-gray-900 dark:text-white shadow-sm';
    };

    const getSelectedStyle = (option: ToggleOption<T>) => {
        if (option.highlightColor) {
            return { backgroundColor: option.highlightColor };
        }
        return undefined;
    };

    return (
        <div className={`${containerClasses} ${className}`}>
            {options.map((option) => {
                const isSelected = value === option.id;
                return (
                    <button
                        key={option.id}
                        type="button"
                        onPointerUp={() => {
                            // Use onPointerUp instead of onClick because writing-mode: sideways-lr
                            // breaks click event generation on touch devices (the browser doesn't 
                            // recognize mouseup as happening on the same element as mousedown due
                            // to the rotated coordinate system)
                            onChange(option.id);
                        }}
                        className={
                            `flex-1 justify-center ${buttonOrientationClasses} px-3 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap select-none
                            ${isSelected
                                ? getSelectedClasses(option)
                                : 'text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white'
                            }`
                        }
                        style={isSelected ? getSelectedStyle(option) : undefined}
                    >
                        {option.icon}
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
