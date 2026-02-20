import { Label, Select } from "flowbite-react";
import { useState } from "react";
import { NumberInput, AutoTooltip } from "../common";
import { CONSTANTS } from "@/constants/commonConstants";

export interface SourceBleedInputProps {
    valueMm: number;
    onChangeMm: (value: number) => void;
    label?: string;
    tooltip?: string;
    className?: string;
}

/**
 * A specialized input for configuring Source Bleed Amount.
 * Handles display unit state internally, exposing always-mm values to the parent.
 * Includes a help tooltip explaining the concept.
 */
export function SourceBleedInput({
    valueMm,
    onChangeMm,
    label = "Source Bleed Amount:",
    tooltip = "Amount of bleed already present in the source image.",
    className = "",
}: SourceBleedInputProps) {
    const [unit, setUnit] = useState<'mm' | 'in'>('mm');

    // Calculate display value based on current unit
    // We round to avoid floating point ugliness in the input
    const displayValue = unit === 'in'
        ? parseFloat((valueMm / CONSTANTS.MM_PER_IN).toFixed(3))
        : parseFloat(valueMm.toFixed(3));

    const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = parseFloat(e.target.value) || 0;

        // Convert input value back to mm for the parent
        const valueInMm = unit === 'in'
            ? newValue * CONSTANTS.MM_PER_IN
            : newValue;

        onChangeMm(valueInMm);
    };

    return (
        <div className={className}>
            <div className="flex items-center gap-2 mb-2">
                <Label className="text-sm">{label}</Label>
                <AutoTooltip content={tooltip} />
            </div>
            <div className="flex items-center gap-2">
                <NumberInput
                    className="w-24"
                    step={0.1}
                    value={displayValue}
                    onChange={handleValueChange}
                />
                <Select
                    sizing="md"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as 'mm' | 'in')}
                    className="w-20"
                >
                    <option value="mm">mm</option>
                    <option value="in">in</option>
                </Select>
            </div>
        </div>
    );
}
