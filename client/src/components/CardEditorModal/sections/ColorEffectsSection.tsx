/**
 * ColorEffectsSection - Hue, Sepia, Tint, RGB/CMYK Balance, Tone Balance
 */

import { memo } from 'react';
import { StyledSlider } from '../StyledSlider';
import { ColorPicker } from '../ColorPicker';
import type { SectionProps } from './index';

export const ColorEffectsSection = memo(function ColorEffectsSection({
    params,
    updateParam,
    defaultParams,
}: SectionProps) {
    return (
        <>
            <StyledSlider
                label="Hue Shift"
                value={params.hueShift}
                onChange={(v) => updateParam('hueShift', v)}
                min={-180}
                max={180}
                step={1}
                displayValue={`${params.hueShift}°`}
                defaultValue={defaultParams.hueShift}
            />
            <StyledSlider
                label="Sepia"
                value={params.sepia}
                onChange={(v) => updateParam('sepia', v)}
                min={0}
                max={1}
                step={0.01}
                displayValue={`${(params.sepia * 100).toFixed(0)}%`}
                displayMultiplier={100}
                defaultValue={defaultParams.sepia}
            />
            {/* Color Tint */}
            <div className="mt-2 pt-2 border-t border-gray-400 dark:border-gray-500">
                <div className="text-xs text-gray-600 dark:text-gray-300 mb-2">Color Tint</div>
                <ColorPicker
                    label="Tint Color"
                    value={params.tintColor}
                    onChange={(v) => updateParam('tintColor', v)}
                />
            </div>
            <StyledSlider
                label="Tint Amount"
                value={params.tintAmount}
                onChange={(v) => updateParam('tintAmount', v)}
                min={0}
                max={1}
                step={0.01}
                displayValue={`${(params.tintAmount * 100).toFixed(0)}%`}
                displayMultiplier={100}
                defaultValue={defaultParams.tintAmount}
            />
            {/* RGB Balance */}
            <div className="mt-2 pt-2 border-t border-gray-400 dark:border-gray-500">
                <div className="text-xs text-gray-600 dark:text-gray-300 mb-2">RGB Balance</div>
                <StyledSlider
                    label="Red"
                    value={params.redBalance}
                    onChange={(v) => updateParam('redBalance', v)}
                    min={-100}
                    max={100}
                    step={1}
                    displayValue={`${params.redBalance > 0 ? '+' : ''}${params.redBalance}`}
                    defaultValue={defaultParams.redBalance}
                />
                <StyledSlider
                    label="Green"
                    value={params.greenBalance}
                    onChange={(v) => updateParam('greenBalance', v)}
                    min={-100}
                    max={100}
                    step={1}
                    displayValue={`${params.greenBalance > 0 ? '+' : ''}${params.greenBalance}`}
                    defaultValue={defaultParams.greenBalance}
                />
                <StyledSlider
                    label="Blue"
                    value={params.blueBalance}
                    onChange={(v) => updateParam('blueBalance', v)}
                    min={-100}
                    max={100}
                    step={1}
                    displayValue={`${params.blueBalance > 0 ? '+' : ''}${params.blueBalance}`}
                    defaultValue={defaultParams.blueBalance}
                />
            </div>
            {/* CMYK Balance */}
            <div className="mt-2 pt-2 border-t border-gray-400 dark:border-gray-500">
                <div className="text-xs text-gray-600 dark:text-gray-300 mb-2">CMYK Balance</div>
                <StyledSlider
                    label="Cyan"
                    value={params.cyanBalance}
                    onChange={(v) => updateParam('cyanBalance', v)}
                    min={-100}
                    max={100}
                    step={1}
                    displayValue={`${params.cyanBalance > 0 ? '+' : ''}${params.cyanBalance}`}
                    defaultValue={defaultParams.cyanBalance}
                />
                <StyledSlider
                    label="Magenta"
                    value={params.magentaBalance}
                    onChange={(v) => updateParam('magentaBalance', v)}
                    min={-100}
                    max={100}
                    step={1}
                    displayValue={`${params.magentaBalance > 0 ? '+' : ''}${params.magentaBalance}`}
                    defaultValue={defaultParams.magentaBalance}
                />
                <StyledSlider
                    label="Yellow"
                    value={params.yellowBalance}
                    onChange={(v) => updateParam('yellowBalance', v)}
                    min={-100}
                    max={100}
                    step={1}
                    displayValue={`${params.yellowBalance > 0 ? '+' : ''}${params.yellowBalance}`}
                    defaultValue={defaultParams.yellowBalance}
                />
                <StyledSlider
                    label="Black"
                    value={params.blackBalance}
                    onChange={(v) => updateParam('blackBalance', v)}
                    min={-100}
                    max={100}
                    step={1}
                    displayValue={`${params.blackBalance > 0 ? '+' : ''}${params.blackBalance}`}
                    defaultValue={defaultParams.blackBalance}
                />
            </div>
            {/* Tone Balance */}
            <div className="mt-2 pt-2 border-t border-gray-400 dark:border-gray-500">
                <div className="text-xs text-gray-600 dark:text-gray-300 mb-2">Tone Balance</div>
                <StyledSlider
                    label="Shadows"
                    value={params.shadowsIntensity}
                    onChange={(v) => updateParam('shadowsIntensity', v)}
                    min={-100}
                    max={100}
                    step={1}
                    displayValue={`${params.shadowsIntensity > 0 ? '+' : ''}${params.shadowsIntensity}`}
                    defaultValue={defaultParams.shadowsIntensity}
                />
                <StyledSlider
                    label="Midtones"
                    value={params.midtonesIntensity}
                    onChange={(v) => updateParam('midtonesIntensity', v)}
                    min={-100}
                    max={100}
                    step={1}
                    displayValue={`${params.midtonesIntensity > 0 ? '+' : ''}${params.midtonesIntensity}`}
                    defaultValue={defaultParams.midtonesIntensity}
                />
                <StyledSlider
                    label="Highlights"
                    value={params.highlightsIntensity}
                    onChange={(v) => updateParam('highlightsIntensity', v)}
                    min={-100}
                    max={100}
                    step={1}
                    displayValue={`${params.highlightsIntensity > 0 ? '+' : ''}${params.highlightsIntensity}`}
                    defaultValue={defaultParams.highlightsIntensity}
                />
            </div>
        </>
    );
});
