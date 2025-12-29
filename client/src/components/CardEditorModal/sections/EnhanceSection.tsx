/**
 * EnhanceSection - Sharpness, Noise Reduction, CMYK Preview
 */

import { memo } from 'react';
import { StyledSlider } from '../../common/StyledSlider';
import type { SectionProps } from './index';

export const EnhanceSection = memo(function EnhanceSection({
    params,
    updateParam,
    defaultParams,
}: SectionProps) {
    return (
        <>
            <StyledSlider
                label="Sharpness"
                value={params.sharpness}
                onChange={(v) => updateParam('sharpness', v)}
                min={0}
                max={5}
                step={0.01}
                displayValue={`${(params.sharpness * 100).toFixed(0)}%`}
                displayMultiplier={100}
                defaultValue={defaultParams.sharpness}
            />
            <StyledSlider
                label="Pop"
                value={params.pop}
                onChange={(v) => updateParam('pop', v)}
                min={0}
                max={100}
                step={1}
                displayValue={`${params.pop}%`}
                defaultValue={defaultParams.pop}
            />
            <StyledSlider
                label="Noise Reduction"
                value={params.noiseReduction}
                onChange={(v) => updateParam('noiseReduction', v)}
                min={0}
                max={100}
                step={1}
                displayValue={`${params.noiseReduction}%`}
                defaultValue={defaultParams.noiseReduction}
            />
            {/* CMYK Preview */}
            <div className="mt-2 pt-2 border-t border-gray-400 dark:border-gray-500">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={params.cmykPreview}
                        onChange={(e) => updateParam('cmykPreview', e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                    />
                    <div>
                        <span className="text-xs text-gray-700 dark:text-gray-200 font-medium">CMYK Preview</span>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Simulate print colors</p>
                    </div>
                </label>
            </div>
        </>
    );
});
