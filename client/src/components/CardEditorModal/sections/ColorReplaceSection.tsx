/**
 * ColorReplaceSection - Color replacement controls
 */

import { memo } from 'react';
import { StyledSlider } from '../../common/StyledSlider';
import { ColorPicker } from '../../common/ColorPicker';
import type { SectionProps } from './index';

export const ColorReplaceSection = memo(function ColorReplaceSection({
    params,
    updateParam,
    defaultParams,
}: SectionProps) {
    return (
        <>
            {/* Enable Toggle */}
            <div className="mb-3">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={params.colorReplaceEnabled}
                        onChange={(e) => updateParam('colorReplaceEnabled', e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                    />
                    <span className="text-xs text-gray-700 dark:text-gray-200 font-medium">Enable Color Replace</span>
                </label>
            </div>
            {params.colorReplaceEnabled && (
                <>
                    <ColorPicker
                        label="Source Color"
                        value={params.colorReplaceSource}
                        onChange={(v) => updateParam('colorReplaceSource', v)}
                    />
                    <ColorPicker
                        label="Target Color"
                        value={params.colorReplaceTarget}
                        onChange={(v) => updateParam('colorReplaceTarget', v)}
                    />
                    {/* Threshold Slider */}
                    <StyledSlider
                        label="Threshold"
                        value={params.colorReplaceThreshold}
                        onChange={(v) => updateParam('colorReplaceThreshold', v)}
                        min={0}
                        max={100}
                        step={1}
                        displayValue={`${params.colorReplaceThreshold}%`}
                        defaultValue={defaultParams.colorReplaceThreshold}
                    />
                </>
            )}
        </>
    );
});
