/**
 * BorderEffectsSection - Vignette controls
 */

import { memo } from 'react';
import { StyledSlider } from '../../common/StyledSlider';
import type { SectionProps } from './index';

export const BorderEffectsSection = memo(function BorderEffectsSection({
    params,
    updateParam,
    defaultParams,
}: SectionProps) {
    return (
        <>
            <StyledSlider
                label="Vignette Amount"
                value={params.vignetteAmount}
                onChange={(v) => updateParam('vignetteAmount', v)}
                min={0}
                max={1}
                step={0.01}
                displayValue={`${(params.vignetteAmount * 100).toFixed(0)}%`}
                displayMultiplier={100}
                defaultValue={defaultParams.vignetteAmount}
            />
            {params.vignetteAmount > 0 && (
                <>
                    <StyledSlider
                        label="Vignette Size"
                        value={params.vignetteSize}
                        onChange={(v) => updateParam('vignetteSize', v)}
                        min={0}
                        max={1.5}
                        step={0.01}
                        displayValue={`${(params.vignetteSize * 100).toFixed(0)}%`}
                        displayMultiplier={100}
                        defaultValue={defaultParams.vignetteSize}
                    />
                    <StyledSlider
                        label="Vignette Feather"
                        value={params.vignetteFeather}
                        onChange={(v) => updateParam('vignetteFeather', v)}
                        min={0.1}
                        max={1}
                        step={0.01}
                        displayValue={`${(params.vignetteFeather * 100).toFixed(0)}%`}
                        displayMultiplier={100}
                        defaultValue={defaultParams.vignetteFeather}
                    />
                </>
            )}
        </>
    );
});
