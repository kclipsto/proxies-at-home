import { Label, Radio } from "flowbite-react";
import type { ReactNode } from "react";
import { SmartBleedInput } from "./SmartBleedInput";

interface BleedModeControlProps<T extends string> {
    idPrefix: string;
    groupName: string;
    mode: T;
    onModeChange: (mode: T) => void;

    // Default Option
    defaultLabel?: ReactNode;

    // Manual Option
    amount: number;
    onAmountChange: (val: number) => void;

    // None Option (Optional)
    showNone?: boolean;
    noneLabel?: string;

    // Specific mode values
    // We use casting in the component to allow these to match T, 
    // or the user must pass values that match T.
    valueDefault?: T;
    valueManual?: T;
    valueNone?: T;
}

export function BleedModeControl<T extends string>({
    idPrefix,
    groupName,
    mode,
    onModeChange,
    defaultLabel = 'Use Global Bleed Width',
    amount,
    onAmountChange,
    showNone = true,
    noneLabel = 'No Bleed',
    // We default to strings that might not match T, so we need to be careful.
    // However, if T is proper, these defaults might be invalid if we strictly type them as T in the destructuring default.
    // But since we can't easily default generic values, we will use 'as T' for the defaults or rely on the user passing them if T is strict.
    // Actually, to keep it simple and robust, let's require the user to align these if they differ from standard 'global'/'manual'/'none'.
    // But commonly they are used. Let's type them as T and cast the defaults.
    valueDefault = 'global' as T,
    valueManual = 'manual' as T,
    valueNone = 'none' as T
}: BleedModeControlProps<T>) {
    return (
        <div className="flex flex-col gap-2">
            {/* Default */}
            <div className="flex items-center gap-2">
                <Radio
                    id={`${idPrefix}-default`}
                    name={groupName}
                    checked={mode === valueDefault}
                    onChange={() => onModeChange(valueDefault)}
                />
                <Label htmlFor={`${idPrefix}-default`}>
                    {defaultLabel}
                </Label>
            </div>

            {/* Manual / Override */}
            <div className="flex items-center gap-2">
                <Radio
                    id={`${idPrefix}-manual`}
                    name={groupName}
                    checked={mode === valueManual}
                    onChange={() => onModeChange(valueManual)}
                />
                <Label htmlFor={`${idPrefix}-manual`}>Override</Label>
            </div>

            {mode === valueManual && (
                <div className="ml-6">
                    <SmartBleedInput
                        valueMm={amount}
                        onChangeMm={onAmountChange}
                    />
                </div>
            )}

            {/* None */}
            {showNone && (
                <div className="flex items-center gap-2">
                    <Radio
                        id={`${idPrefix}-none`}
                        name={groupName}
                        checked={mode === valueNone}
                        onChange={() => onModeChange(valueNone)}
                    />
                    <Label htmlFor={`${idPrefix}-none`}>{noneLabel}</Label>
                </div>
            )}
        </div>
    );
}
