import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BorderEffectsSection } from './BorderEffectsSection';
import { DEFAULT_RENDER_PARAMS, type RenderParams } from '../../CardCanvas/types';

// Mock StyledSlider to avoid DOM complexity and isolate unit test
interface MockStyledSliderProps {
    label: string;
    value: number;
    onChange: (val: number) => void;
    displayValue?: string;
}

vi.mock('../../common/StyledSlider', () => ({
    StyledSlider: ({ label, value, onChange, displayValue }: MockStyledSliderProps) => (
        <div data-testid={`slider-${label}`}>
            <span>{label}</span>
            <span data-testid={`display-${label}`}>{displayValue}</span>
            <input
                data-testid={`input-${label}`}
                type="range"
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
            />
        </div>
    )
}));

describe('BorderEffectsSection', () => {
    // Type the mock correctly
    const mockUpdateParam: Mock = vi.fn();
    const mockParams: RenderParams = { ...DEFAULT_RENDER_PARAMS };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render only Vignette Amount initially (when 0)', () => {
        render(
            <BorderEffectsSection
                params={mockParams}
                updateParam={mockUpdateParam}
                defaultParams={DEFAULT_RENDER_PARAMS}
            />
        );

        expect(screen.getByTestId('slider-Vignette Amount')).toBeInTheDocument();
        expect(screen.queryByTestId('slider-Vignette Size')).not.toBeInTheDocument();
        expect(screen.queryByTestId('slider-Vignette Feather')).not.toBeInTheDocument();
    });

    it('should render detailed controls when Vignette Amount > 0', () => {
        const activeParams: RenderParams = { ...mockParams, vignetteAmount: 0.5 };

        render(
            <BorderEffectsSection
                params={activeParams}
                updateParam={mockUpdateParam}
                defaultParams={DEFAULT_RENDER_PARAMS}
            />
        );

        expect(screen.getByTestId('slider-Vignette Amount')).toBeInTheDocument();
        expect(screen.getByTestId('slider-Vignette Size')).toBeInTheDocument();
        expect(screen.getByTestId('slider-Vignette Feather')).toBeInTheDocument();
    });

    it('should update params on slider change', () => {
        const activeParams: RenderParams = { ...mockParams, vignetteAmount: 0.5 };

        render(
            <BorderEffectsSection
                params={activeParams}
                updateParam={mockUpdateParam}
                defaultParams={DEFAULT_RENDER_PARAMS}
            />
        );

        // 1. Amount
        fireEvent.change(screen.getByTestId('input-Vignette Amount'), { target: { value: '0.8' } });
        expect(mockUpdateParam).toHaveBeenLastCalledWith('vignetteAmount', 0.8);
        mockUpdateParam.mockClear();

        // 2. Size
        fireEvent.change(screen.getByTestId('input-Vignette Size'), { target: { value: '1.2' } });
        expect(mockUpdateParam).toHaveBeenLastCalledWith('vignetteSize', 1.2);
        mockUpdateParam.mockClear();

        // 3. Feather
        fireEvent.change(screen.getByTestId('input-Vignette Feather'), { target: { value: '0.6' } });
        expect(mockUpdateParam).toHaveBeenLastCalledWith('vignetteFeather', 0.6);
    });

    it('should pass correct display values', () => {
        const specialParams: RenderParams = {
            ...mockParams,
            vignetteAmount: 0.25,
            vignetteSize: 0.8,
            vignetteFeather: 0.5
        };

        render(
            <BorderEffectsSection
                params={specialParams}
                updateParam={mockUpdateParam}
                defaultParams={DEFAULT_RENDER_PARAMS}
            />
        );

        expect(screen.getByTestId('display-Vignette Amount')).toHaveTextContent('25%');
        expect(screen.getByTestId('display-Vignette Size')).toHaveTextContent('80%');
        expect(screen.getByTestId('display-Vignette Feather')).toHaveTextContent('50%');
    });
});
