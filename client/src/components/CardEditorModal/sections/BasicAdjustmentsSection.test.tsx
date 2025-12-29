import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BasicAdjustmentsSection } from './BasicAdjustmentsSection';
import { DEFAULT_RENDER_PARAMS } from '../../CardCanvas/types';

describe('BasicAdjustmentsSection', () => {
    const mockUpdateParam = vi.fn();
    const mockParams = { ...DEFAULT_RENDER_PARAMS };

    it('should render all 3 sliders', () => {
        render(
            <BasicAdjustmentsSection
                params={mockParams}
                updateParam={mockUpdateParam}
                defaultParams={DEFAULT_RENDER_PARAMS}
            />
        );

        expect(screen.getByText('Brightness')).toBeInTheDocument();
        expect(screen.getByText('Contrast')).toBeInTheDocument();
        expect(screen.getByText('Saturation')).toBeInTheDocument();
    });

    it('should call updateParam when sliders change', () => {
        render(
            <BasicAdjustmentsSection
                params={mockParams}
                updateParam={mockUpdateParam}
                defaultParams={DEFAULT_RENDER_PARAMS}
            />
        );

        // We can target sliders by label text if they are associated, or just traversing inputs
        // Since StyledSlider uses standard inputs (range), we can find inputs.
        // But StyledSlider might be complex. Let's just find by display value or label.

        // Simulating change might be easiest if we query by role check
        // Assuming StyledSlider renders an input type="range"

        const inputs = screen.getAllByRole('slider');
        expect(inputs).toHaveLength(3); // Brightness, Contrast, Saturation

        // Brightness
        fireEvent.change(inputs[0], { target: { value: '50' } });
        expect(mockUpdateParam).toHaveBeenCalledWith('brightness', 50);

        // Contrast
        fireEvent.change(inputs[1], { target: { value: '1.5' } });
        expect(mockUpdateParam).toHaveBeenCalledWith('contrast', 1.5);

        // Saturation
        fireEvent.change(inputs[2], { target: { value: '0.8' } });
        expect(mockUpdateParam).toHaveBeenCalledWith('saturation', 0.8);
    });

    it('should display correct formatted values', () => {
        const specialParams = {
            ...mockParams,
            brightness: 20,
            contrast: 1.2,
            saturation: 0.5
        };

        render(
            <BasicAdjustmentsSection
                params={specialParams}
                updateParam={mockUpdateParam}
                defaultParams={DEFAULT_RENDER_PARAMS}
            />
        );

        // Brightness +20
        expect(screen.getByDisplayValue('+20')).toBeInTheDocument();
        // Contrast 120%
        expect(screen.getByDisplayValue('120%')).toBeInTheDocument();
        // Saturation 50%
        expect(screen.getByDisplayValue('50%')).toBeInTheDocument();
    });
});
