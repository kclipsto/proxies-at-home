import { useSettingsStore } from "@/store/settings";
import { Checkbox, Label, Select } from "flowbite-react";
import { NumberInput } from "@/components/common";
import { useNormalizedInput } from "@/hooks/useInputHooks";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { SourceBleedInput } from "@/components/CardEditorModal/SourceBleedInput";
import { BleedModeControl } from "@/components/CardEditorModal/BleedModeControl";


export function BleedSection() {
    const bleedEdgeWidth = useSettingsStore((state) => state.bleedEdgeWidth);
    const bleedEdge = useSettingsStore((state) => state.bleedEdge);
    const bleedEdgeUnit = useSettingsStore((state) => state.bleedEdgeUnit);
    const setBleedEdgeWidth = useSettingsStore((state) => state.setBleedEdgeWidth);
    const setBleedEdge = useSettingsStore((state) => state.setBleedEdge);
    const setBleedEdgeUnit = useSettingsStore((state) => state.setBleedEdgeUnit);

    // Images With Bleed Settings
    const withBleedSourceAmount = useSettingsStore((state) => state.withBleedSourceAmount);
    const withBleedTargetMode = useSettingsStore((state) => state.withBleedTargetMode);
    const withBleedTargetAmount = useSettingsStore((state) => state.withBleedTargetAmount);
    const setWithBleedSourceAmount = useSettingsStore((state) => state.setWithBleedSourceAmount);
    const setWithBleedTargetMode = useSettingsStore((state) => state.setWithBleedTargetMode);
    const setWithBleedTargetAmount = useSettingsStore((state) => state.setWithBleedTargetAmount);

    // Images Without Bleed Settings
    const noBleedTargetMode = useSettingsStore((state) => state.noBleedTargetMode);
    const noBleedTargetAmount = useSettingsStore((state) => state.noBleedTargetAmount);
    const setNoBleedTargetMode = useSettingsStore((state) => state.setNoBleedTargetMode);
    const setNoBleedTargetAmount = useSettingsStore((state) => state.setNoBleedTargetAmount);

    // Collapsible sections state
    const [withBleedExpanded, setWithBleedExpanded] = useState(false);
    const [noBleedExpanded, setNoBleedExpanded] = useState(false);

    // Increase max to 10mm to support larger bleed sizes
    const bleedEdgeInput = useNormalizedInput(
        bleedEdgeWidth,
        (value) => {
            setBleedEdgeWidth(value);
        },
        { min: 0, max: 10 }
    );

    return (
        <div className="space-y-3">
            <h3 className="text-lg font-semibold dark:text-white">Bleed Settings</h3>

            {/* Global Bleed Width */}
            <div className="flex flex-col gap-2">
                <Label className="text-nowrap">Bleed Width</Label>
                <div className="grid grid-cols-2 gap-2">
                    <NumberInput
                        ref={bleedEdgeInput.inputRef}
                        className="w-full"
                        step={0.1}
                        defaultValue={bleedEdgeInput.defaultValue}
                        onChange={bleedEdgeInput.handleChange}
                        onBlur={bleedEdgeInput.handleBlur}
                        disabled={!bleedEdge}
                    />
                    <Select
                        sizing="md"
                        value={bleedEdgeUnit}
                        onChange={(e) => {
                            const newUnit = e.target.value as 'mm' | 'in';
                            if (newUnit !== bleedEdgeUnit) {
                                const converted = newUnit === 'in'
                                    ? bleedEdgeWidth / 25.4
                                    : bleedEdgeWidth * 25.4;
                                const decimals = newUnit === 'in' ? 3 : 2;
                                const rounded = parseFloat(converted.toFixed(decimals));
                                setBleedEdgeWidth(rounded);
                                if (bleedEdgeInput.inputRef.current) {
                                    bleedEdgeInput.inputRef.current.value = rounded.toString();
                                }
                            }
                            setBleedEdgeUnit(newUnit);
                        }}
                        disabled={!bleedEdge}
                        className="w-full"
                    >
                        <option value="mm">mm</option>
                        <option value="in">in</option>
                    </Select>
                </div>
            </div>

            <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 -ml-2">
                <Checkbox
                    id="bleed-edge"
                    checked={bleedEdge}
                    onChange={(e) => setBleedEdge(e.target.checked)}
                />
                <Label htmlFor="bleed-edge" className="flex-1 cursor-pointer">Enable Bleed Edge</Label>
            </div>


            {/* Images With Bleed Settings */}
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                <button
                    type="button"
                    className="w-full flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-900"
                    onClick={() => setWithBleedExpanded(!withBleedExpanded)}
                >
                    <span className="font-medium text-sm dark:text-white">Images With Bleed Settings</span>
                    {withBleedExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {withBleedExpanded && (
                    <div className="p-2 space-y-3">
                        {/* 1. Source Bleed Amount */}
                        <div className="space-y-2">
                            <SourceBleedInput
                                valueMm={withBleedSourceAmount}
                                onChangeMm={setWithBleedSourceAmount}
                            />
                        </div>

                        {/* 2. Target Mode */}
                        <div className="space-y-2">
                            <Label>Bleed Width</Label>
                            <BleedModeControl
                                idPrefix="wb"
                                groupName="wb-target-mode"
                                mode={withBleedTargetMode}
                                onModeChange={setWithBleedTargetMode}
                                amount={withBleedTargetAmount}
                                onAmountChange={setWithBleedTargetAmount}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Images Without Bleed Settings */}
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                <button
                    type="button"
                    className="w-full flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-900"
                    onClick={() => setNoBleedExpanded(!noBleedExpanded)}
                >
                    <span className="font-medium text-sm dark:text-white">Images Without Bleed Settings</span>
                    {noBleedExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {noBleedExpanded && (
                    <div className="p-2 space-y-3">
                        {/* Target Mode */}
                        <div className="space-y-2">
                            <Label>Bleed Width</Label>
                            <BleedModeControl
                                idPrefix="nb"
                                groupName="nb-target-mode"
                                mode={noBleedTargetMode}
                                onModeChange={setNoBleedTargetMode}
                                amount={noBleedTargetAmount}
                                onAmountChange={setNoBleedTargetAmount}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
