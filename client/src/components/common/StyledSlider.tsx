/**
 * StyledSlider - Slider with label, value input, and double-click reset
 */

import { memo, useState, useEffect } from 'react';
import { AutoTooltip } from './AutoTooltip';

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
    /** Step to use for input field (defaults to step if not provided) */
    inputStep?: number;
    /** Whether to allow input values outside min/max range */
    allowOutOfRange?: boolean;
    /** Optional hint text to display in an AutoTooltip */
    hint?: string;
    disabled?: boolean;
}

export const StyledSlider = memo(function StyledSlider({
    label,
    value,
    onChange,
    min,
    max,
    step = 1,
    displayValue,
    defaultValue = 0,
    displayMultiplier = 1,
    inputStep,
    allowOutOfRange = false,
    hint,
    disabled = false,
}: StyledSliderProps) {
    const effectiveInputStep = inputStep ?? step;

    // Local state for text input to allow free typing
    const [inputValue, setInputValue] = useState(displayValue ?? value.toFixed(effectiveInputStep < 1 ? 3 : 0));
    const [isEditing, setIsEditing] = useState(false);

    // Sync input value when external value changes (but not while editing)
    useEffect(() => {
        if (!isEditing) {
            // Determine decimal places based on step size
            const decimalPlaces = (effectiveInputStep.toString().split('.')[1] || '').length;
            const formattedValue = value.toFixed(decimalPlaces);
            // Remove trailing zeros if it has a decimal point to avoid "1.500" for "1.5"
            const cleanFormatted = formattedValue.includes('.') ? parseFloat(formattedValue).toString() : formattedValue;

            setInputValue(displayValue ?? cleanFormatted);
        }
    }, [value, displayValue, effectiveInputStep, isEditing]);

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

            // Clamp to min/max unless allowed out of range
            const clamped = allowOutOfRange
                ? actualValue
                : Math.max(min, Math.min(max, actualValue));

            onChange(clamped);
        } else if (defaultValue !== undefined) {
            // Reset to default on invalid input? Or just revert? 
            // Better to just revert to current prop value via effect, 
            // but we need to toggle editing off first.
        }
        setIsEditing(false);
    };

    const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        if (!disabled) {
            commitValue(e.target.value);
        }
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (disabled) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            commitValue(inputValue);
            (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setIsEditing(false);
            // Revert will happen in useEffect
            (e.target as HTMLInputElement).blur();
        }
    };

    return (
        <div className={`flex flex-col gap-1.5 px-1 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <div className="flex justify-between text-xs items-center">
                <div className="flex items-center gap-1">
                    <span className="text-gray-600 dark:text-gray-300 select-none">{label}</span>
                    {hint && <AutoTooltip content={hint} />}
                </div>
                <input
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    onKeyDown={handleInputKeyDown}
                    disabled={disabled}
                    className="font-mono text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded w-16 text-right text-xs border-0 outline-none focus:ring-1 focus:ring-blue-500"
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
                disabled={disabled}
                className="editor-slider"
                title={defaultValue !== undefined ? "Double-click to reset to default" : undefined}
            />
        </div>
    );
});
