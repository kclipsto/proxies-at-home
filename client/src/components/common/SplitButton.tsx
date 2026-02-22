import { useRef, useCallback, type ReactNode, type ElementType } from 'react';
import { ChevronDown } from 'lucide-react';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';

type ColorScheme = 'green' | 'cyan' | 'blue' | 'gray' | 'indigo';

const colorClasses: Record<ColorScheme, { base: string; hover: string; disabled: string; border: string; activeHL: string }> = {
    green: {
        base: 'bg-green-600',
        hover: 'hover:bg-green-700',
        disabled: 'disabled:bg-green-600/50',
        border: 'border-green-500',
        activeHL: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    },
    cyan: {
        base: 'bg-cyan-600',
        hover: 'hover:bg-cyan-700',
        disabled: 'disabled:bg-cyan-600/50',
        border: 'border-cyan-500',
        activeHL: 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400',
    },
    blue: {
        base: 'bg-blue-600',
        hover: 'hover:bg-blue-700',
        disabled: 'disabled:bg-blue-600/50',
        border: 'border-blue-500',
        activeHL: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    },
    gray: {
        base: 'bg-gray-300 dark:bg-gray-600',
        hover: 'hover:bg-gray-400 dark:hover:bg-gray-500',
        disabled: '',
        border: 'border-gray-400 dark:border-gray-500',
        activeHL: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    },
    indigo: {
        base: 'bg-indigo-600',
        hover: 'hover:bg-indigo-700',
        disabled: 'disabled:bg-indigo-600/50',
        border: 'border-indigo-500',
        activeHL: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
    },
};

export interface SplitButtonOption<T extends string> {
    value: T;
    label: string;
    description: string;
}

interface SplitButtonProps<T extends string> {
    /** Main button label */
    label: string;
    /** Current mode label (shown below main label) */
    sublabel?: string;
    /** Color scheme */
    color: ColorScheme;
    /** Whether main action is disabled */
    disabled?: boolean;
    /** Click handler for main button */
    onClick: () => void;
    /** Whether dropdown is open */
    isOpen: boolean;
    /** Toggle dropdown */
    onToggle: () => void;
    /** Close dropdown */
    onClose: () => void;
    /** Dropdown options */
    options: SplitButtonOption<T>[];
    /** Current selected value */
    value: T;
    /** Called when option is selected */
    onSelect: (value: T) => void;
    /** Optional custom content instead of label (for file input wrapper) */
    mainContent?: ReactNode;
    /** Use label element instead of button (for file inputs) */
    asLabel?: boolean;
    /** htmlFor attribute when asLabel is true */
    htmlFor?: string;
    /** Font size for main label */
    labelSize?: 'sm' | 'base';
    /** Optional icon component to display on the left */
    icon?: ElementType;
    /** Optional extra button/action (third split) */
    extraAction?: {
        icon: ElementType;
        onClick: () => void;
        title: string;
        disabled?: boolean;
    };
}

/**
 * Standardized split button with dropdown for mode selection.
 * - Main button can be disabled independently from dropdown toggle
 * - No translate on click when disabled
 * - Click-outside-to-close behavior
 */
export function SplitButton<T extends string>({
    label,
    sublabel,
    color,
    disabled = false,
    onClick,
    isOpen,
    onToggle,
    onClose,
    options,
    value,
    onSelect,
    mainContent,
    asLabel = false,
    htmlFor,
    labelSize = 'base',
    icon,
    extraAction,
}: SplitButtonProps<T>) {
    const containerRef = useRef<HTMLDivElement>(null);
    useOnClickOutside(containerRef, useCallback(() => onClose(), [onClose]));

    const colors = colorClasses[color];
    const textColor = color === 'gray' ? 'text-gray-900 dark:text-white' : 'text-white';

    // Shared classes for main button/label
    const mainClasses = `
        relative flex-1 flex flex-col items-center justify-center cursor-pointer rounded-l-md
        ${colors.base} ${colors.hover} ${colors.disabled}
        ${disabled ? 'cursor-not-allowed' : ''}
        px-4 py-2 ${textColor} transition-colors
        ${disabled ? '' : 'active:translate-y-[2px]'}
    `.trim().replace(/\s+/g, ' ');

    const sideButtonBase = `
        flex items-center justify-center cursor-pointer
        ${colors.base} ${colors.hover}
        border-l ${colors.border} px-3 py-2 ${textColor} transition-colors
        active:translate-y-[2px]
    `.trim().replace(/\s+/g, ' ');

    const toggleClasses = `${sideButtonBase} ${extraAction ? '' : 'rounded-r-md'}`;
    const extraClasses = `${sideButtonBase} rounded-r-md`;

    const labelSizeClass = labelSize === 'sm' ? 'text-sm' : 'text-base';

    const Icon = icon;
    // When icon is present, add padding to shift text right to keep it visually centered
    const iconOffset = Icon ? 'pl-6' : '';

    const content = mainContent ?? (
        <>
            {Icon && <Icon className="absolute left-4 w-5 h-5" />}
            <span className={`${labelSizeClass} font-medium ${iconOffset}`}>{label}</span>
            {sublabel && <span className={`text-xs opacity-80 ${iconOffset}`}>{sublabel}</span>}
        </>
    );

    return (
        <div className="relative" ref={containerRef}>
            <div className="flex">
                {asLabel ? (
                    <label
                        htmlFor={htmlFor}
                        className={mainClasses}
                    >
                        {content}
                    </label>
                ) : (
                    <button
                        type="button"
                        onClick={onClick}
                        disabled={disabled}
                        className={mainClasses}
                    >
                        {content}
                    </button>
                )}

                <button
                    type="button"
                    onClick={onToggle}
                    className={toggleClasses}
                    aria-label="Select mode"
                    aria-expanded={isOpen}
                    aria-haspopup="listbox"
                >
                    <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {extraAction && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!extraAction.disabled) extraAction.onClick();
                        }}
                        className={`${extraClasses} ${extraAction.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                        title={extraAction.title}
                        disabled={extraAction.disabled}
                    >
                        <extraAction.icon className="w-4 h-4" />
                    </button>
                )}
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-gray-700 rounded-md shadow-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                    {options.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                                onSelect(option.value);
                                onClose();
                            }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors ${value === option.value
                                ? colors.activeHL
                                : "text-gray-900 dark:text-white"
                                }`}
                        >
                            {option.label}
                            <span className="block text-xs text-gray-500 dark:text-gray-400">{option.description}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
