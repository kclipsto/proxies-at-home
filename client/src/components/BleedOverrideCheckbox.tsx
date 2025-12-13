import { Checkbox } from "flowbite-react";
import { BleedAmountInput } from "./BleedAmountInput";

export interface BleedOverrideCheckboxProps {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    amount: number;
    unit: 'mm' | 'in';
    onAmountChange: (amount: number) => void;
    onUnitChange: (unit: 'mm' | 'in') => void;
    label?: string;
}

/**
 * Reusable override checkbox with conditional amount input.
 * When checked, shows the BleedAmountInput for custom value.
 */
export function BleedOverrideCheckbox({
    checked,
    onCheckedChange,
    amount,
    unit,
    onAmountChange,
    onUnitChange,
    label = "Override bleed amount",
}: BleedOverrideCheckboxProps) {
    const handleCheckedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onCheckedChange(e.target.checked);
    };

    return (
        <div>
            <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                    checked={checked}
                    onChange={handleCheckedChange}
                />
                <span className="text-sm dark:text-gray-300">{label}</span>
            </label>
            {checked && (
                <div className="mt-2">
                    <BleedAmountInput
                        value={amount}
                        unit={unit}
                        onValueChange={onAmountChange}
                        onUnitChange={onUnitChange}
                    />
                </div>
            )}
        </div>
    );
}
