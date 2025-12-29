/**
 * StyledSlider - Slider with label, value input, and double-click reset
 */

import { memo, useState, useEffect } from 'react';

interface StyledSliderProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step?: number;
    displayValue?: string;
    defaultValue?: number;
    /** Multiplier used when displayValue shows percentage (e.g., 100 for values like 0.5 shown as "50%") */
    displayMultiplier?: number;
}

export const StyledSlider = memo(function StyledSlider({
    label,
    value,
    onChange,
    min,
    max,
    step = 1,
    displayValue,
    defaultValue,
    displayMultiplier = 1,
}: StyledSliderProps) {
    // Local state for text input to allow free typing
    const [inputValue, setInputValue] = useState(displayValue ?? value.toFixed(step < 1 ? 2 : 0));
    const [isEditing, setIsEditing] = useState(false);

    // Sync input value when external value changes (but not while editing)
    useEffect(() => {
        if (!isEditing) {
            setInputValue(displayValue ?? value.toFixed(step < 1 ? 2 : 0));
        }
    }, [value, displayValue, step, isEditing]);

    const handleDoubleClick = () => {
        if (defaultValue !== undefined) {
            onChange(defaultValue);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Just update local state, don't call onChange yet
        setInputValue(e.target.value);
    };

    const handleInputFocus = () => {
        setIsEditing(true);
    };

    const commitValue = (rawValue: string) => {
        const cleanValue = rawValue.replace('%', '').replace('px', '').trim();
        const parsed = parseFloat(cleanValue);
        if (!isNaN(parsed)) {
            // Convert from display value to actual value
            const actualValue = parsed / displayMultiplier;
            // Clamp to min/max
            const clamped = Math.max(min, Math.min(max, actualValue));
            onChange(clamped);
        }
        setIsEditing(false);
    };

    const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        commitValue(e.target.value);
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            commitValue(inputValue);
            (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setIsEditing(false);
            setInputValue(displayValue ?? value.toFixed(step < 1 ? 2 : 0));
            (e.target as HTMLInputElement).blur();
        }
    };

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs items-center">
                <span className="text-gray-600 dark:text-gray-300 select-none">{label}</span>
                <input
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    onKeyDown={handleInputKeyDown}
                    className="font-mono text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded w-14 text-right text-xs border-0 outline-none focus:ring-1 focus:ring-blue-500"
                />
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                onDoubleClick={handleDoubleClick}
                className="editor-slider"
                title={defaultValue !== undefined ? "Double-click to reset to default" : undefined}
            />
        </div>
    );
});
