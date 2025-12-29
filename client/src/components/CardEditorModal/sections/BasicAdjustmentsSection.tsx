/**
 * BasicAdjustmentsSection - Brightness, Contrast, Saturation sliders
 */

import { memo } from 'react';
import { StyledSlider } from '../../common/StyledSlider';
import type { SectionProps } from './index';

export const BasicAdjustmentsSection = memo(function BasicAdjustmentsSection({
    params,
    updateParam,
    defaultParams,
}: SectionProps) {
    return (
        <>
            <StyledSlider
                label="Brightness"
                value={params.brightness}
                onChange={(v) => updateParam('brightness', v)}
                min={-100}
                max={100}
                step={1}
                displayValue={`${params.brightness > 0 ? '+' : ''}${params.brightness}`}
                defaultValue={defaultParams.brightness}
            />
            <StyledSlider
                label="Contrast"
                value={params.contrast}
                onChange={(v) => updateParam('contrast', v)}
                min={0.5}
                max={2}
                step={0.01}
                displayValue={`${(params.contrast * 100).toFixed(0)}%`}
                displayMultiplier={100}
                defaultValue={defaultParams.contrast}
            />
            <StyledSlider
                label="Saturation"
                value={params.saturation}
                onChange={(v) => updateParam('saturation', v)}
                min={0}
                max={2}
                step={0.01}
                displayValue={`${(params.saturation * 100).toFixed(0)}%`}
                displayMultiplier={100}
                defaultValue={defaultParams.saturation}
            />
        </>
    );
});
