/**
 * DarkenSection - Darken pixels settings for print optimization
 */
import { useSettingsStore, type DarkenMode } from "@/store/settings";
import { Label, Select, Checkbox } from "flowbite-react";
import { StyledSlider } from "@/components/CardEditorModal/StyledSlider";
import '@/components/CardEditorModal/CardEditorModal.css';

import { DEFAULT_RENDER_PARAMS } from "@/components/CardCanvas";

export function DarkenSection() {
    const darkenMode = useSettingsStore((state) => state.darkenMode);
    const setDarkenMode = useSettingsStore((state) => state.setDarkenMode);
    const darkenAmount = useSettingsStore((state) => state.darkenAmount);
    const setDarkenAmount = useSettingsStore((state) => state.setDarkenAmount);
    const darkenEdgeWidth = useSettingsStore((state) => state.darkenEdgeWidth);
    const setDarkenEdgeWidth = useSettingsStore((state) => state.setDarkenEdgeWidth);
    const darkenContrast = useSettingsStore((state) => state.darkenContrast);
    const setDarkenContrast = useSettingsStore((state) => state.setDarkenContrast);
    const darkenBrightness = useSettingsStore((state) => state.darkenBrightness);
    const setDarkenBrightness = useSettingsStore((state) => state.setDarkenBrightness);
    const darkenAutoDetect = useSettingsStore((state) => state.darkenAutoDetect);
    const setDarkenAutoDetect = useSettingsStore((state) => state.setDarkenAutoDetect);

    const showContrastMode = darkenMode === 'contrast-edges' || darkenMode === 'contrast-full';

    return (
        <div className="space-y-3">
            <div className="flex flex-col gap-2">
                <Label>Mode</Label>
                <Select
                    sizing="md"
                    value={darkenMode}
                    onChange={(e) => setDarkenMode(e.target.value as DarkenMode)}
                >
                    <option value="none">None</option>
                    <option value="darken-all">Darken All (Legacy)</option>
                    <option value="contrast-edges">Contrast Edges</option>
                    <option value="contrast-full">Contrast Full</option>
                </Select>
            </div>

            {/* Darken settings sliders - shown when mode is not 'none' */}
            {darkenMode !== 'none' && (
                <div className="flex flex-col gap-3">
                    <StyledSlider
                        label="Amount"
                        value={darkenAmount}
                        onChange={setDarkenAmount}
                        min={0}
                        max={1}
                        step={0.01}
                        displayValue={`${(darkenAmount * 100).toFixed(0)}%`}
                        displayMultiplier={100}
                        defaultValue={1.0}
                    />

                    {/* Edge Width - only shown for contrast-edges */}
                    {darkenMode === 'contrast-edges' && (
                        <StyledSlider
                            label="Edge Width"
                            value={darkenEdgeWidth}
                            onChange={setDarkenEdgeWidth}
                            min={0}
                            max={1}
                            step={0.01}
                            displayValue={`${(darkenEdgeWidth * 100).toFixed(0)}%`}
                            displayMultiplier={100}
                            defaultValue={DEFAULT_RENDER_PARAMS.darkenEdgeWidth}
                        />
                    )}

                    {/* Auto Detect checkbox - only for contrast modes */}
                    {showContrastMode && (
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="darken-auto-detect"
                                checked={darkenAutoDetect}
                                onChange={(e) => setDarkenAutoDetect(e.target.checked)}
                            />
                            <Label htmlFor="darken-auto-detect" className="cursor-pointer">
                                Auto Detect
                            </Label>
                        </div>
                    )}

                    {/* Contrast/Brightness sliders - hidden when Auto Detect is checked (for contrast modes) */}
                    {(!showContrastMode || !darkenAutoDetect) && (
                        <>
                            <StyledSlider
                                label={darkenMode === 'contrast-edges' ? 'Edge Contrast' : 'Contrast'}
                                value={darkenContrast}
                                onChange={setDarkenContrast}
                                min={0.5}
                                max={4}
                                step={0.01}
                                displayValue={`${(darkenContrast * 100).toFixed(0)}%`}
                                displayMultiplier={100}
                                defaultValue={2.0}
                            />

                            <StyledSlider
                                label="Brightness"
                                value={darkenBrightness}
                                onChange={setDarkenBrightness}
                                min={-100}
                                max={100}
                                step={1}
                                displayValue={`${darkenBrightness > 0 ? '+' : ''}${darkenBrightness}`}
                                defaultValue={-50}
                            />
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
