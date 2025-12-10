import { useSettingsStore } from "@/store/settings";
import { Checkbox, Label, Select } from "flowbite-react";
import { NumberInput } from "../../NumberInput";
import { useNormalizedInput } from "@/hooks/useInputHooks";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function BleedSection() {
    const bleedEdgeWidth = useSettingsStore((state) => state.bleedEdgeWidth);
    const bleedEdge = useSettingsStore((state) => state.bleedEdge);
    const bleedEdgeUnit = useSettingsStore((state) => state.bleedEdgeUnit);
    const darkenNearBlack = useSettingsStore((state) => state.darkenNearBlack);
    const setBleedEdgeWidth = useSettingsStore((state) => state.setBleedEdgeWidth);
    const setBleedEdge = useSettingsStore((state) => state.setBleedEdge);
    const setBleedEdgeUnit = useSettingsStore((state) => state.setBleedEdgeUnit);
    const setDarkenNearBlack = useSettingsStore((state) => state.setDarkenNearBlack);

    // MPC settings
    const mpcBleedMode = useSettingsStore((state) => state.mpcBleedMode);
    const mpcExistingBleed = useSettingsStore((state) => state.mpcExistingBleed);
    const mpcExistingBleedUnit = useSettingsStore((state) => state.mpcExistingBleedUnit);
    const setMpcBleedMode = useSettingsStore((state) => state.setMpcBleedMode);
    const setMpcExistingBleed = useSettingsStore((state) => state.setMpcExistingBleed);
    const setMpcExistingBleedUnit = useSettingsStore((state) => state.setMpcExistingBleedUnit);

    // Upload settings
    const uploadBleedMode = useSettingsStore((state) => state.uploadBleedMode);
    const uploadExistingBleed = useSettingsStore((state) => state.uploadExistingBleed);
    const uploadExistingBleedUnit = useSettingsStore((state) => state.uploadExistingBleedUnit);
    const setUploadBleedMode = useSettingsStore((state) => state.setUploadBleedMode);
    const setUploadExistingBleed = useSettingsStore((state) => state.setUploadExistingBleed);
    const setUploadExistingBleedUnit = useSettingsStore((state) => state.setUploadExistingBleedUnit);

    // Collapsible sections state
    const [mpcExpanded, setMpcExpanded] = useState(false);
    const [uploadExpanded, setUploadExpanded] = useState(false);



    // Increase max to 10mm to support larger bleed sizes
    const bleedEdgeInput = useNormalizedInput(
        bleedEdgeWidth,
        (value) => {
            setBleedEdgeWidth(value);
        },
        { min: 0, max: 10 }
    );

    // MPC existing bleed input
    const mpcBleedInput = useNormalizedInput(
        mpcExistingBleed,
        (value) => {
            setMpcExistingBleed(value);
        },
        { min: 0, max: 10 }
    );

    // Upload existing bleed input
    const uploadBleedInput = useNormalizedInput(
        uploadExistingBleed,
        (value) => {
            setUploadExistingBleed(value);
        },
        { min: 0, max: 10 }
    );

    return (
        <div className="space-y-4">
            {/* Main Bleed Edge Setting */}
            <div>
                <div className="flex justify-between items-center mb-2">
                    <Label>Bleed Edge</Label>
                    {bleedEdgeInput.warning && (
                        <span className="text-xs text-red-500 animate-pulse">
                            {bleedEdgeInput.warning}
                        </span>
                    )}
                </div>
                <div className="flex gap-2">
                    <NumberInput
                        ref={bleedEdgeInput.inputRef}
                        className="flex-1"
                        step={bleedEdgeUnit === 'in' ? 0.0625 : 0.1}
                        defaultValue={bleedEdgeInput.defaultValue}
                        onChange={bleedEdgeInput.handleChange}
                        onBlur={bleedEdgeInput.handleBlur}
                        placeholder={bleedEdgeWidth.toString()}
                        disabled={!bleedEdge}
                    />
                    <Select
                        sizing="md"
                        value={bleedEdgeUnit}
                        onChange={(e) => {
                            const newUnit = e.target.value as 'mm' | 'in';
                            if (newUnit !== bleedEdgeUnit) {
                                // Convert value when switching units
                                const converted = newUnit === 'in'
                                    ? bleedEdgeWidth / 25.4
                                    : bleedEdgeWidth * 25.4;
                                // Use 3 decimal places for inches, 2 for mm
                                const decimals = newUnit === 'in' ? 3 : 2;
                                const rounded = parseFloat(converted.toFixed(decimals));
                                setBleedEdgeWidth(rounded);
                                // Update input ref to show new value
                                if (bleedEdgeInput.inputRef.current) {
                                    bleedEdgeInput.inputRef.current.value = rounded.toString();
                                }
                            }
                            setBleedEdgeUnit(newUnit);
                        }}
                        disabled={!bleedEdge}
                        className="w-20"
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
                    onChange={(e) => {
                        setBleedEdge(e.target.checked);
                    }}
                />
                <Label htmlFor="bleed-edge" className="flex-1 cursor-pointer">Enable Bleed Edge</Label>
            </div>

            <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 -ml-2">
                <Checkbox
                    id="darken-near-black"
                    checked={darkenNearBlack}
                    onChange={(e) => {
                        setDarkenNearBlack(e.target.checked);
                    }}
                />
                <Label htmlFor="darken-near-black" className="flex-1 cursor-pointer">Darken Near-Black Pixels</Label>
            </div>

            {/* MPC Images Section */}
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                <button
                    type="button"
                    className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => setMpcExpanded(!mpcExpanded)}
                >
                    <span className="font-medium text-sm dark:text-white">MPC Images</span>
                    {mpcExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {mpcExpanded && (
                    <div className="p-3 space-y-3">
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="mpc-bleed-mode"
                                    checked={mpcBleedMode === 'trim-regenerate'}
                                    onChange={() => {
                                        setMpcBleedMode('trim-regenerate');
                                    }}
                                    className="text-blue-600"
                                />
                                <span className="text-sm dark:text-gray-300">Trim & Generate New Bleed</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="mpc-bleed-mode"
                                    checked={mpcBleedMode === 'use-existing'}
                                    onChange={() => {
                                        setMpcBleedMode('use-existing');
                                    }}
                                    className="text-blue-600"
                                />
                                <span className="text-sm dark:text-gray-300">Use Existing Bleed</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="mpc-bleed-mode"
                                    checked={mpcBleedMode === 'none'}
                                    onChange={() => {
                                        setMpcBleedMode('none');
                                    }}
                                    className="text-blue-600"
                                />
                                <span className="text-sm dark:text-gray-300">No Bleed</span>
                            </label>
                        </div>
                        {mpcBleedMode === 'use-existing' && (
                            <div className="flex items-center gap-2 mt-2">
                                <Label className="text-sm">Amount:</Label>
                                <NumberInput
                                    ref={mpcBleedInput.inputRef}
                                    className="w-20"
                                    step={0.1}
                                    defaultValue={mpcBleedInput.defaultValue}
                                    onChange={mpcBleedInput.handleChange}
                                    onBlur={mpcBleedInput.handleBlur}
                                />
                                <Select
                                    sizing="md"
                                    value={mpcExistingBleedUnit}
                                    onChange={(e) => {
                                        const newUnit = e.target.value as 'mm' | 'in';
                                        if (newUnit !== mpcExistingBleedUnit) {
                                            // Convert value when switching units
                                            const converted = newUnit === 'in'
                                                ? mpcExistingBleed / 25.4
                                                : mpcExistingBleed * 25.4;
                                            // Use 3 decimal places for inches, 2 for mm
                                            const decimals = newUnit === 'in' ? 3 : 2;
                                            const rounded = parseFloat(converted.toFixed(decimals));
                                            setMpcExistingBleed(rounded);
                                            // Update input ref to show new value
                                            if (mpcBleedInput.inputRef.current) {
                                                mpcBleedInput.inputRef.current.value = rounded.toString();
                                            }
                                        }
                                        setMpcExistingBleedUnit(newUnit);
                                    }}
                                    className="w-16"
                                >
                                    <option value="mm">mm</option>
                                    <option value="in">in</option>
                                </Select>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Other Uploads Section */}
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                <button
                    type="button"
                    className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => setUploadExpanded(!uploadExpanded)}
                >
                    <span className="font-medium text-sm dark:text-white">Other Uploads</span>
                    {uploadExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {uploadExpanded && (
                    <div className="p-3 space-y-3">
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="upload-bleed-mode"
                                    checked={uploadBleedMode === 'generate'}
                                    onChange={() => {
                                        setUploadBleedMode('generate');
                                    }}
                                    className="text-blue-600"
                                />
                                <span className="text-sm dark:text-gray-300">Generate Bleed</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="upload-bleed-mode"
                                    checked={uploadBleedMode === 'existing'}
                                    onChange={() => {
                                        setUploadBleedMode('existing');
                                    }}
                                    className="text-blue-600"
                                />
                                <span className="text-sm dark:text-gray-300">Use Existing Bleed</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="upload-bleed-mode"
                                    checked={uploadBleedMode === 'none'}
                                    onChange={() => {
                                        setUploadBleedMode('none');
                                    }}
                                    className="text-blue-600"
                                />
                                <span className="text-sm dark:text-gray-300">No Bleed</span>
                            </label>
                        </div>
                        {uploadBleedMode === 'existing' && (
                            <div className="flex items-center gap-2 mt-2">
                                <Label className="text-sm">Amount:</Label>
                                <NumberInput
                                    ref={uploadBleedInput.inputRef}
                                    className="w-20"
                                    step={0.1}
                                    defaultValue={uploadBleedInput.defaultValue}
                                    onChange={uploadBleedInput.handleChange}
                                    onBlur={uploadBleedInput.handleBlur}
                                />
                                <Select
                                    sizing="md"
                                    value={uploadExistingBleedUnit}
                                    onChange={(e) => {
                                        const newUnit = e.target.value as 'mm' | 'in';
                                        if (newUnit !== uploadExistingBleedUnit) {
                                            // Convert value when switching units
                                            const converted = newUnit === 'in'
                                                ? uploadExistingBleed / 25.4
                                                : uploadExistingBleed * 25.4;
                                            // Use 3 decimal places for inches, 2 for mm
                                            const decimals = newUnit === 'in' ? 3 : 2;
                                            const rounded = parseFloat(converted.toFixed(decimals));
                                            setUploadExistingBleed(rounded);
                                            // Update input ref to show new value
                                            if (uploadBleedInput.inputRef.current) {
                                                uploadBleedInput.inputRef.current.value = rounded.toString();
                                            }
                                        }
                                        setUploadExistingBleedUnit(newUnit);
                                    }}
                                    className="w-16"
                                >
                                    <option value="mm">mm</option>
                                    <option value="in">in</option>
                                </Select>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
