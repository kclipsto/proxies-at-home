import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ColorEffectsSection } from './ColorEffectsSection';
import { DEFAULT_RENDER_PARAMS } from '../../CardCanvas';

// Mock StyledSlider
vi.mock('../../common/StyledSlider', () => ({
    StyledSlider: ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
        <div data-testid={`slider-${label.replace(/\s+/g, '-').toLowerCase()}`}>
            <label>{label}</label>
            <input
                type="range"
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
            />
        </div>
    ),
}));

// Mock ColorPicker
vi.mock('../../common/ColorPicker', () => ({
    ColorPicker: ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
        <div data-testid={`color-picker-${label.replace(/\s+/g, '-').toLowerCase()}`}>
            <label>{label}</label>
            <input
                type="color"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    ),
}));

describe('ColorEffectsSection', () => {
    const mockUpdateParam = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('rendering', () => {
        it('should render all sliders', () => {
            render(
                <ColorEffectsSection
                    params={DEFAULT_RENDER_PARAMS}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            expect(screen.getByTestId('slider-hue-shift')).toBeInTheDocument();
            expect(screen.getByTestId('slider-sepia')).toBeInTheDocument();
            expect(screen.getByTestId('slider-tint-amount')).toBeInTheDocument();
            expect(screen.getByTestId('slider-red')).toBeInTheDocument();
            expect(screen.getByTestId('slider-green')).toBeInTheDocument();
            expect(screen.getByTestId('slider-blue')).toBeInTheDocument();
            expect(screen.getByTestId('slider-cyan')).toBeInTheDocument();
            expect(screen.getByTestId('slider-magenta')).toBeInTheDocument();
            expect(screen.getByTestId('slider-yellow')).toBeInTheDocument();
            expect(screen.getByTestId('slider-black')).toBeInTheDocument();
            expect(screen.getByTestId('slider-shadows')).toBeInTheDocument();
            expect(screen.getByTestId('slider-midtones')).toBeInTheDocument();
            expect(screen.getByTestId('slider-highlights')).toBeInTheDocument();
        });

        it('should render color picker', () => {
            render(
                <ColorEffectsSection
                    params={DEFAULT_RENDER_PARAMS}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            expect(screen.getByTestId('color-picker-tint-color')).toBeInTheDocument();
        });

        it('should render section headers', () => {
            render(
                <ColorEffectsSection
                    params={DEFAULT_RENDER_PARAMS}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            expect(screen.getByText('Color Tint')).toBeInTheDocument();
            expect(screen.getByText('RGB Balance')).toBeInTheDocument();
            expect(screen.getByText('CMYK Balance')).toBeInTheDocument();
            expect(screen.getByText('Tone Balance')).toBeInTheDocument();
        });
    });

    describe('slider interactions', () => {
        it('should call updateParam when Hue Shift slider changes', () => {
            render(
                <ColorEffectsSection
                    params={DEFAULT_RENDER_PARAMS}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            const slider = screen.getByTestId('slider-hue-shift').querySelector('input');
            fireEvent.change(slider!, { target: { value: '45' } });

            expect(mockUpdateParam).toHaveBeenCalledWith('hueShift', 45);
        });

        it('should call updateParam when Sepia slider changes', () => {
            render(
                <ColorEffectsSection
                    params={DEFAULT_RENDER_PARAMS}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            const slider = screen.getByTestId('slider-sepia').querySelector('input');
            fireEvent.change(slider!, { target: { value: '0.5' } });

            expect(mockUpdateParam).toHaveBeenCalledWith('sepia', 0.5);
        });

        it('should call updateParam when Tint Amount slider changes', () => {
            render(
                <ColorEffectsSection
                    params={DEFAULT_RENDER_PARAMS}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            const slider = screen.getByTestId('slider-tint-amount').querySelector('input');
            fireEvent.change(slider!, { target: { value: '0.3' } });

            expect(mockUpdateParam).toHaveBeenCalledWith('tintAmount', 0.3);
        });

        it('should call updateParam when Red balance slider changes', () => {
            render(
                <ColorEffectsSection
                    params={DEFAULT_RENDER_PARAMS}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            const slider = screen.getByTestId('slider-red').querySelector('input');
            fireEvent.change(slider!, { target: { value: '25' } });

            expect(mockUpdateParam).toHaveBeenCalledWith('redBalance', 25);
        });

        it('should call updateParam when Blue balance slider changes', () => {
            render(
                <ColorEffectsSection
                    params={DEFAULT_RENDER_PARAMS}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            const slider = screen.getByTestId('slider-blue').querySelector('input');
            fireEvent.change(slider!, { target: { value: '15' } });

            expect(mockUpdateParam).toHaveBeenCalledWith('blueBalance', 15);
        });
    });

    describe('color picker interaction', () => {
        it('should call updateParam when tint color changes', () => {
            render(
                <ColorEffectsSection
                    params={DEFAULT_RENDER_PARAMS}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            const colorPicker = screen.getByTestId('color-picker-tint-color').querySelector('input');
            fireEvent.change(colorPicker!, { target: { value: '#ff5500' } });

            expect(mockUpdateParam).toHaveBeenCalledWith('tintColor', '#ff5500');
        });
    });

    describe('CMYK balance sliders', () => {
        it('should call updateParam when Cyan slider changes', () => {
            render(
                <ColorEffectsSection
                    params={DEFAULT_RENDER_PARAMS}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            const slider = screen.getByTestId('slider-cyan').querySelector('input');
            fireEvent.change(slider!, { target: { value: '30' } });

            expect(mockUpdateParam).toHaveBeenCalledWith('cyanBalance', 30);
        });

        it('should call updateParam when Black slider changes', () => {
            render(
                <ColorEffectsSection
                    params={DEFAULT_RENDER_PARAMS}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            const slider = screen.getByTestId('slider-black').querySelector('input');
            fireEvent.change(slider!, { target: { value: '10' } });

            expect(mockUpdateParam).toHaveBeenCalledWith('blackBalance', 10);
        });
    });
});
