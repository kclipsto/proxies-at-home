import { Label, Select } from "flowbite-react";
import { useState, useEffect } from "react";
import { NumberInput, AutoTooltip } from "../common";
import { CONSTANTS } from "@/constants/commonConstants";

export interface SmartBleedInputProps {
    valueMm: number;
    onChangeMm: (value: number) => void;
    label?: string;
    tooltip?: string;
    className?: string;
    disabled?: boolean;
}

/**
 * A specialized input for configuring Bleed amounts.
 * Handles display unit state internally, exposing always-mm values to the parent.
 * Includes a help tooltip explaining the concept.
 */
export function SmartBleedInput({
    valueMm,
    onChangeMm,
    label,
    tooltip,
    className = "",
    disabled = false,
}: SmartBleedInputProps) {
    const [unit, setUnit] = useState<'mm' | 'in'>('mm');
    const [localDisplayValue, setLocalDisplayValue] = useState<number | string>('');

    // Sync local display value when prop value or unit changes
    useEffect(() => {
        const val = unit === 'in'
            ? parseFloat((valueMm / CONSTANTS.MM_PER_IN).toFixed(3))
            : parseFloat(valueMm.toFixed(3));
        setLocalDisplayValue(val);
    }, [valueMm, unit]);

    const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValStr = e.target.value;
        setLocalDisplayValue(newValStr); // Allow typing intermediates (though NumberInput might restrict)

        const newValue = parseFloat(newValStr);
        if (isNaN(newValue)) return;

        // Convert input value back to mm for the parent
        const valueInMm = unit === 'in'
            ? newValue * CONSTANTS.MM_PER_IN
            : newValue;

        onChangeMm(valueInMm);
    };

    return (
        <div className={className}>
            {(label || tooltip) && (
                <div className="flex items-center gap-2 mb-2">
                    {label && <Label className="text-sm">{label}</Label>}
                    {tooltip && <AutoTooltip content={tooltip} />}
                </div>
            )}
            <div className="flex items-center gap-2">
                <NumberInput
                    className="w-24"
                    step={0.1}
                    value={localDisplayValue}
                    onChange={handleValueChange}
                    disabled={disabled}
                />
                <Select
                    sizing="md"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as 'mm' | 'in')}
                    className="w-20"
                    disabled={disabled}
                >
                    <option value="mm">mm</option>
                    <option value="in">in</option>
                </Select>
            </div>
        </div>
    );
}
