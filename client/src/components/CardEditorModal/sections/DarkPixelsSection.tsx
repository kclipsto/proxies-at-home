/**
 * DarkPixelsSection - Dark pixel handling with mode selection
 * Includes "Use Global Default" checkbox to inherit from global settings
 */

import { memo } from 'react';
import { Label, Select, Checkbox } from 'flowbite-react';
import { StyledSlider } from '../StyledSlider';
import type { SectionProps } from './index';

import { DEFAULT_RENDER_PARAMS } from '../../CardCanvas';

export const DarkPixelsSection = memo(function DarkPixelsSection({
    params,
    updateParam,
    defaultParams,
}: SectionProps) {
    // Use the explicit flag - true means use global defaults
    const isUsingGlobalSettings = params.darkenUseGlobalSettings;
    const showContrastMode = params.darkenMode === 'contrast-edges' || params.darkenMode === 'contrast-full';

    const handleUseGlobalSettings = (checked: boolean) => {
        // Just toggle the flag - don't change any slider values
        updateParam('darkenUseGlobalSettings', checked);
    };

    return (
        <>
            <div className="flex items-center gap-2 mb-2">
                <Checkbox
                    id="darken-use-global"
                    checked={isUsingGlobalSettings}
                    onChange={(e) => handleUseGlobalSettings(e.target.checked)}
                />
                <Label htmlFor="darken-use-global" className="text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                    Use Global Settings
                </Label>
            </div>

            <div className={`flex flex-col gap-1 ${isUsingGlobalSettings ? 'opacity-50 pointer-events-none' : ''}`}>
                <Label className="text-xs text-gray-600 dark:text-gray-300">Mode</Label>
                <Select
                    sizing="sm"
                    value={params.darkenMode}
                    onChange={(e) => updateParam('darkenMode', e.target.value as 'none' | 'darken-all' | 'contrast-edges' | 'contrast-full')}
                    disabled={isUsingGlobalSettings}
                >
                    <option value="none">None</option>
                    <option value="darken-all">Darken All (threshold)</option>
                    <option value="contrast-edges">Contrast Edges</option>
                    <option value="contrast-full">Contrast Full</option>
                </Select>
            </div>

            {params.darkenMode !== 'none' && (
                <div className={`flex flex-col gap-3 ${isUsingGlobalSettings ? 'opacity-50 pointer-events-none' : ''}`}>
                    <StyledSlider
                        label="Amount"
                        value={params.darkenAmount}
                        onChange={(v) => updateParam('darkenAmount', v)}
                        min={0}
                        max={1}
                        step={0.01}
                        displayValue={`${(params.darkenAmount * 100).toFixed(0)}%`}
                        displayMultiplier={100}
                        defaultValue={defaultParams.darkenAmount}
                    />
                    <StyledSlider
                        label="Edge Width"
                        value={params.darkenEdgeWidth}
                        onChange={(v) => updateParam('darkenEdgeWidth', v)}
                        min={0}
                        max={1}
                        step={0.01}
                        displayValue={`${(params.darkenEdgeWidth * 100).toFixed(0)}%`}
                        displayMultiplier={100}
                        defaultValue={DEFAULT_RENDER_PARAMS.darkenEdgeWidth}
                    />

                    {params.darkenMode === 'darken-all' && (
                        <StyledSlider
                            label="Threshold"
                            value={params.darkenThreshold}
                            onChange={(v) => updateParam('darkenThreshold', v)}
                            min={0}
                            max={255}
                            step={1}
                            defaultValue={defaultParams.darkenThreshold}
                        />
                    )}

                    {/* Auto Detect checkbox - only for contrast modes */}
                    {showContrastMode && (
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="darken-auto-detect"
                                checked={params.darkenAutoDetect}
                                onChange={(e) => updateParam('darkenAutoDetect', e.target.checked)}
                            />
                            <Label htmlFor="darken-auto-detect" className="text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                                Auto Detect
                            </Label>
                        </div>
                    )}

                    {/* Contrast/Brightness sliders - hidden when Auto Detect is checked (for contrast modes) */}
                    {(!showContrastMode || !params.darkenAutoDetect) && (
                        <>
                            <StyledSlider
                                label={params.darkenMode === 'contrast-edges' ? 'Edge Contrast' : 'Contrast'}
                                value={params.darkenContrast}
                                onChange={(v) => updateParam('darkenContrast', v)}
                                min={0.5}
                                max={4}
                                step={0.01}
                                displayValue={`${(params.darkenContrast * 100).toFixed(0)}%`}
                                displayMultiplier={100}
                                defaultValue={defaultParams.darkenContrast}
                            />
                            <StyledSlider
                                label={params.darkenMode === 'contrast-edges' ? 'Edge Brightness' : 'Brightness'}
                                value={params.darkenBrightness}
                                onChange={(v) => updateParam('darkenBrightness', v)}
                                min={-100}
                                max={100}
                                step={1}
                                displayValue={`${params.darkenBrightness > 0 ? '+' : ''}${params.darkenBrightness}`}
                                defaultValue={defaultParams.darkenBrightness}
                            />
                        </>
                    )}
                </div>
            )}
        </>
    );
});
