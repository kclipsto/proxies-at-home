/**
 * HolographicSection - Holographic effect controls
 */

import { memo } from 'react';
import { StyledSlider } from '../../common/StyledSlider';
import type { SectionProps } from './index';

export const HolographicSection = memo(function HolographicSection({
    params,
    updateParam,
    defaultParams,
}: SectionProps) {
    return (
        <>
            {/* Effect Type Dropdown */}
            <div className="mb-3">
                <label className="block text-xs text-gray-700 dark:text-gray-200 font-medium mb-1 select-none">Effect Type</label>
                <select
                    value={params.holoEffect}
                    onChange={(e) => updateParam('holoEffect', e.target.value as 'none' | 'rainbow' | 'glitter' | 'stars')}
                    className="w-full h-8 px-2 text-xs bg-transparent border border-[--gray-6] rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
                >
                    <option value="none">None</option>
                    <option value="rainbow">Rainbow (Smooth)</option>
                    <option value="glitter">Glitter</option>
                    <option value="stars">Stars</option>
                </select>
            </div>
            {/* Size slider (for stars and glitter effects) */}
            {(params.holoEffect === 'stars' || params.holoEffect === 'glitter') && (
                <StyledSlider
                    label={params.holoEffect === 'stars' ? 'Star Size' : 'Glitter Size'}
                    value={params.holoStarSize}
                    onChange={(v) => updateParam('holoStarSize', v)}
                    min={10}
                    max={100}
                    step={5}
                    displayValue={`${params.holoStarSize}%`}
                    defaultValue={defaultParams.holoStarSize}
                />
            )}
            {/* Amount / Probability slider */}
            {(params.holoEffect === 'stars' || params.holoEffect === 'glitter') && (
                <StyledSlider
                    label="Amount"
                    value={params.holoProbability}
                    onChange={(v) => updateParam('holoProbability', v)}
                    min={0}
                    max={100}
                    step={5}
                    displayValue={`${params.holoProbability}%`}
                    defaultValue={defaultParams.holoProbability}
                />
            )}
            {/* Position Variety / Shift Position */}
            {(params.holoEffect === 'stars' || params.holoEffect === 'glitter') && (
                <StyledSlider
                    label="Shift Position"
                    value={params.holoStarVariety}
                    onChange={(v) => updateParam('holoStarVariety', v)}
                    min={0}
                    max={100}
                    step={5}
                    displayValue={`${params.holoStarVariety}%`}
                    defaultValue={defaultParams.holoStarVariety}
                />
            )}
            {/* Blur slider (glitter only) */}
            {params.holoEffect === 'glitter' && (
                <StyledSlider
                    label="Blur"
                    value={params.holoBlur}
                    onChange={(v) => updateParam('holoBlur', v)}
                    min={0}
                    max={100}
                    step={5}
                    displayValue={`${params.holoBlur}%`}
                    defaultValue={defaultParams.holoBlur}
                />
            )}
            {params.holoEffect !== 'none' && (
                <>
                    <StyledSlider
                        label="Strength"
                        value={params.holoStrength}
                        onChange={(v) => updateParam('holoStrength', v)}
                        min={0}
                        max={100}
                        step={1}
                        displayValue={`${params.holoStrength}%`}
                        defaultValue={defaultParams.holoStrength}
                    />
                    {/* Area Mode */}
                    <div className="mb-2">
                        <label className="block text-xs text-gray-700 dark:text-gray-200 font-medium mb-1 select-none">Apply To</label>
                        <select
                            value={params.holoAreaMode}
                            onChange={(e) => updateParam('holoAreaMode', e.target.value as 'full' | 'bright')}
                            className="w-full h-8 px-2 text-xs bg-transparent border border-[--gray-6] rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
                        >
                            <option value="full">Entire Card</option>
                            <option value="bright">Bright Areas Only</option>
                        </select>
                    </div>
                    {/* Brightness Threshold (only for bright areas mode) */}
                    {params.holoAreaMode === 'bright' && (
                        <StyledSlider
                            label="Brightness Threshold"
                            value={params.holoAreaThreshold}
                            onChange={(v) => updateParam('holoAreaThreshold', v)}
                            min={0}
                            max={100}
                            step={5}
                            displayValue={`${params.holoAreaThreshold}%`}
                            defaultValue={defaultParams.holoAreaThreshold}
                        />
                    )}
                    {/* Animation Mode */}
                    <div className="mb-2">
                        <label className="block text-xs text-gray-700 dark:text-gray-200 font-medium mb-1 select-none">Animation</label>
                        <select
                            value={params.holoAnimation}
                            onChange={(e) => updateParam('holoAnimation', e.target.value as 'none' | 'wave' | 'pulse' | 'sweep' | 'twinkle')}
                            className="w-full h-8 px-2 text-xs bg-transparent border border-[--gray-6] rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
                        >
                            <option value="none">None (Static)</option>
                            <option value="wave">Wave (Rotating)</option>
                            <option value="pulse">Pulse (Fading)</option>
                            <option value="sweep">Sweep (Linear)</option>
                            {(params.holoEffect === 'glitter' || params.holoEffect === 'stars') && (
                                <option value="twinkle">Twinkle</option>
                            )}
                        </select>
                    </div>
                    {/* Animation Speed (only for auto animations) */}
                    {params.holoAnimation !== 'none' && (
                        <StyledSlider
                            label="Speed"
                            value={params.holoSpeed}
                            onChange={(v) => updateParam('holoSpeed', v)}
                            min={1}
                            max={10}
                            step={1}
                            displayValue={params.holoSpeed.toString()}
                            defaultValue={defaultParams.holoSpeed}
                        />
                    )}
                    {/* Sweep Band Width (only for sweep animation) */}
                    {params.holoAnimation === 'sweep' && (
                        <StyledSlider
                            label="Band Width"
                            value={params.holoSweepWidth}
                            onChange={(v) => updateParam('holoSweepWidth', v)}
                            min={10}
                            max={100}
                            step={5}
                            displayValue={`${params.holoSweepWidth}%`}
                            defaultValue={defaultParams.holoSweepWidth}
                        />
                    )}
                    {/* Export Mode */}
                    <div className="mb-2">
                        <label className="block text-xs text-gray-700 dark:text-gray-200 font-medium mb-1 select-none">Export Mode</label>
                        <select
                            value={params.holoExportMode}
                            onChange={(e) => updateParam('holoExportMode', e.target.value as 'static' | 'none')}
                            className="w-full h-8 px-2 text-xs bg-transparent border border-[--gray-6] rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
                        >
                            <option value="static">Static (Fixed Angle)</option>
                            <option value="none">Disable for Export</option>
                        </select>
                    </div>
                </>
            )}
        </>
    );
});
