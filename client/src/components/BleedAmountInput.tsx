import { Label, Select } from "flowbite-react";
import { NumberInput } from "./NumberInput";

// Debug logging
const DEBUG = true;
const log = (action: string, value: unknown) => {
    if (DEBUG) console.log(`[BleedAmountInput] ${action} =`, value);
};

export interface BleedAmountInputProps {
    value: number;
    unit: 'mm' | 'in';
    onValueChange: (value: number) => void;
    onUnitChange: (unit: 'mm' | 'in') => void;
    label?: string;
    step?: number;
    min?: number;
    max?: number;
    className?: string;
    disabledUnit?: boolean;
}

/**
 * Reusable component for bleed amount + unit selector.
 * Used in both BleedSection (side panel) and ArtworkBleedSettings (per-card modal).
 */
export function BleedAmountInput({
    value,
    unit,
    onValueChange,
    onUnitChange,
    label,
    step = 0.1,
    min = 0,
    max = 10,
    className = "",
    disabledUnit = false,
}: BleedAmountInputProps) {
    const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = parseFloat(e.target.value) || 0;
        log('value', newValue);
        onValueChange(newValue);
    };

    const handleUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newUnit = e.target.value as 'mm' | 'in';
        if (newUnit !== unit) {
            // Convert value when switching units
            const converted = newUnit === 'in'
                ? value / 25.4
                : value * 25.4;
            // Use 3 decimal places for both inches and mm
            const decimals = 3;
            const rounded = parseFloat(converted.toFixed(decimals));
            log('unit', newUnit);
            log('convertedValue', rounded);
            onValueChange(rounded);
        }
        onUnitChange(newUnit);
    };

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            {label && <Label className="text-sm">{label}</Label>}
            <NumberInput
                className="w-20"
                step={step}
                min={min}
                max={max}
                value={value}
                onChange={handleValueChange}
            />
            <Select
                sizing="md"
                value={unit}
                onChange={handleUnitChange}
                disabled={disabledUnit}
                className="w-16"
            >
                <option value="mm">mm</option>
                <option value="in">in</option>
            </Select>
        </div>
    );
}
