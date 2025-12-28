/**
 * Section content components for Card Editor
 * Each section receives params, updateParam, and defaultParams
 */

export { BasicAdjustmentsSection } from './BasicAdjustmentsSection';
export { DarkPixelsSection } from './DarkPixelsSection';
export { EnhanceSection } from './EnhanceSection';
export { HolographicSection } from './HolographicSection';
export { ColorReplaceSection } from './ColorReplaceSection';
export { GammaSection } from './GammaSection';
export { ColorEffectsSection } from './ColorEffectsSection';
export { BorderEffectsSection } from './BorderEffectsSection';

// Shared props interface for all section components
import type { RenderParams } from '../../CardCanvas';
import type { DEFAULT_RENDER_PARAMS } from '../../CardCanvas';

export interface SectionProps {
    params: RenderParams;
    updateParam: <K extends keyof RenderParams>(key: K, value: RenderParams[K]) => void;
    defaultParams: typeof DEFAULT_RENDER_PARAMS;
}
