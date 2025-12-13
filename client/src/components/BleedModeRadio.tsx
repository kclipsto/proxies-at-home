import type { ReactNode } from "react";

export interface BleedModeRadioProps<T extends string> {
    name: string;
    value: T;
    checked: boolean;
    onChange: (value: T) => void;
    label: string;
    children?: ReactNode;
}

/**
 * Reusable radio option with optional sub-content (children).
 * When selected, shows children as indented sub-settings.
 */
export function BleedModeRadio<T extends string>({
    name,
    value,
    checked,
    onChange,
    label,
    children,
}: BleedModeRadioProps<T>) {
    const handleChange = () => {
        onChange(value);
    };

    return (
        <div>
            <label className="flex items-center gap-2 cursor-pointer">
                <input
                    type="radio"
                    name={name}
                    checked={checked}
                    onChange={handleChange}
                    className="text-blue-600"
                />
                <span className="text-sm dark:text-gray-300">{label}</span>
            </label>
            {/* Sub-settings - only shown when this option is selected */}
            {checked && children && (
                <div className="ml-6 mt-2 pl-3 border-l-2 border-gray-300 dark:border-gray-600">
                    {children}
                </div>
            )}
        </div>
    );
}
