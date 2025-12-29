/**
 * GammaSection - Gamma correction control
 */

import { memo } from 'react';
import { StyledSlider } from '../../common/StyledSlider';
import type { SectionProps } from './index';

export const GammaSection = memo(function GammaSection({
    params,
    updateParam,
    defaultParams,
}: SectionProps) {
    return (
        <StyledSlider
            label="Gamma"
            value={params.gamma}
            onChange={(v) => updateParam('gamma', v)}
            min={0.1}
            max={3.0}
            step={0.05}
            displayValue={params.gamma.toFixed(2)}
            defaultValue={defaultParams.gamma}
        />
    );
});
