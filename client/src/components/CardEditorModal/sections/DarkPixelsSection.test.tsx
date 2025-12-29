import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { DarkPixelsSection } from './DarkPixelsSection';
import type { RenderParams } from '../../CardCanvas';
import { DEFAULT_RENDER_PARAMS } from '../../CardCanvas';

// Mock flowbite-react components
vi.mock('flowbite-react', () => ({
    Label: ({ children, htmlFor, className }: { children: React.ReactNode; htmlFor?: string; className?: string }) => (
        <label htmlFor={htmlFor} className={className}>{children}</label>
    ),
    Select: ({ value, onChange, children, disabled, sizing }: { value: string; onChange: (e: { target: { value: string } }) => void; children: React.ReactNode; disabled?: boolean; sizing?: string }) => (
        <select data-testid="darken-mode-select" value={value} onChange={onChange} disabled={disabled} data-sizing={sizing}>
            {children}
        </select>
    ),
    Checkbox: ({ id, checked, onChange }: { id: string; checked: boolean; onChange: (e: { target: { checked: boolean } }) => void }) => (
        <input type="checkbox" id={id} data-testid={id} checked={checked} onChange={(e) => onChange({ target: { checked: e.target.checked } })} />
    ),
}));

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

describe('DarkPixelsSection', () => {
    const mockUpdateParam = vi.fn();

    const createParams = (overrides?: Partial<RenderParams>): RenderParams => ({
        ...DEFAULT_RENDER_PARAMS,
        darkenMode: 'none',
        darkenUseGlobalSettings: true,
        darkenAmount: 0.5,
        darkenThreshold: 128,
        darkenContrast: 1.5,
        darkenBrightness: 0,
        darkenEdgeWidth: 0.5,
        darkenAutoDetect: false,
        ...overrides,
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('rendering', () => {
        it('should render Use Global Settings checkbox', () => {
            render(
                <DarkPixelsSection
                    params={createParams()}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            expect(screen.getByTestId('darken-use-global')).toBeInTheDocument();
            expect(screen.getByText('Use Global Settings')).toBeInTheDocument();
        });

        it('should render Mode select', () => {
            render(
                <DarkPixelsSection
                    params={createParams()}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            expect(screen.getByTestId('darken-mode-select')).toBeInTheDocument();
            expect(screen.getByText('Mode')).toBeInTheDocument();
        });
    });

    describe('Use Global Settings checkbox', () => {
        it('should call updateParam when checkbox toggled', () => {
            render(
                <DarkPixelsSection
                    params={createParams({ darkenUseGlobalSettings: true })}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            const checkbox = screen.getByTestId('darken-use-global');
            fireEvent.click(checkbox);

            expect(mockUpdateParam).toHaveBeenCalledWith('darkenUseGlobalSettings', false);
        });
    });

    describe('darken mode select', () => {
        it('should call updateParam when mode changes', () => {
            render(
                <DarkPixelsSection
                    params={createParams({ darkenUseGlobalSettings: false })}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            const select = screen.getByTestId('darken-mode-select');
            fireEvent.change(select, { target: { value: 'darken-all' } });

            expect(mockUpdateParam).toHaveBeenCalledWith('darkenMode', 'darken-all');
        });
    });

    describe('conditional sliders', () => {
        it('should show Amount and Edge Width sliders when mode is not none', () => {
            render(
                <DarkPixelsSection
                    params={createParams({ darkenMode: 'darken-all', darkenUseGlobalSettings: false })}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            expect(screen.getByTestId('slider-amount')).toBeInTheDocument();
            expect(screen.getByTestId('slider-edge-width')).toBeInTheDocument();
        });

        it('should not show sliders when mode is none', () => {
            render(
                <DarkPixelsSection
                    params={createParams({ darkenMode: 'none' })}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            expect(screen.queryByTestId('slider-amount')).not.toBeInTheDocument();
        });

        it('should show Threshold slider when mode is darken-all', () => {
            render(
                <DarkPixelsSection
                    params={createParams({ darkenMode: 'darken-all', darkenUseGlobalSettings: false })}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            expect(screen.getByTestId('slider-threshold')).toBeInTheDocument();
        });

        it('should show Auto Detect checkbox for contrast modes', () => {
            render(
                <DarkPixelsSection
                    params={createParams({ darkenMode: 'contrast-edges', darkenUseGlobalSettings: false })}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            expect(screen.getByTestId('darken-auto-detect')).toBeInTheDocument();
            expect(screen.getByText('Auto Detect')).toBeInTheDocument();
        });

        it('should show contrast sliders when Auto Detect is disabled', () => {
            render(
                <DarkPixelsSection
                    params={createParams({
                        darkenMode: 'contrast-edges',
                        darkenUseGlobalSettings: false,
                        darkenAutoDetect: false
                    })}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            expect(screen.getByTestId('slider-edge-contrast')).toBeInTheDocument();
            expect(screen.getByTestId('slider-edge-brightness')).toBeInTheDocument();
        });

        it('should hide contrast sliders when Auto Detect is enabled', () => {
            render(
                <DarkPixelsSection
                    params={createParams({
                        darkenMode: 'contrast-edges',
                        darkenUseGlobalSettings: false,
                        darkenAutoDetect: true
                    })}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            expect(screen.queryByTestId('slider-edge-contrast')).not.toBeInTheDocument();
            expect(screen.queryByTestId('slider-edge-brightness')).not.toBeInTheDocument();
        });

        it('should show Contrast/Brightness sliders for contrast-full mode', () => {
            render(
                <DarkPixelsSection
                    params={createParams({
                        darkenMode: 'contrast-full',
                        darkenUseGlobalSettings: false,
                        darkenAutoDetect: false
                    })}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            expect(screen.getByTestId('slider-contrast')).toBeInTheDocument();
            expect(screen.getByTestId('slider-brightness')).toBeInTheDocument();
        });
    });

    describe('Auto Detect toggle', () => {
        it('should call updateParam when toggled', () => {
            render(
                <DarkPixelsSection
                    params={createParams({
                        darkenMode: 'contrast-edges',
                        darkenUseGlobalSettings: false,
                        darkenAutoDetect: false
                    })}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            const checkbox = screen.getByTestId('darken-auto-detect');
            fireEvent.click(checkbox);

            expect(mockUpdateParam).toHaveBeenCalledWith('darkenAutoDetect', true);
        });
    });

    describe('slider interactions', () => {
        it('should call updateParam when Amount slider changes', () => {
            render(
                <DarkPixelsSection
                    params={createParams({ darkenMode: 'darken-all', darkenUseGlobalSettings: false })}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            const slider = screen.getByTestId('slider-amount').querySelector('input');
            fireEvent.change(slider!, { target: { value: '0.8' } });

            expect(mockUpdateParam).toHaveBeenCalledWith('darkenAmount', 0.8);
        });

        it('should call updateParam when Edge Width slider changes', () => {
            render(
                <DarkPixelsSection
                    params={createParams({ darkenMode: 'darken-all', darkenUseGlobalSettings: false })}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            const slider = screen.getByTestId('slider-edge-width').querySelector('input');
            fireEvent.change(slider!, { target: { value: '0.3' } });

            expect(mockUpdateParam).toHaveBeenCalledWith('darkenEdgeWidth', 0.3);
        });

        it('should call updateParam when Contrast slider changes', () => {
            render(
                <DarkPixelsSection
                    params={createParams({
                        darkenMode: 'contrast-edges',
                        darkenUseGlobalSettings: false,
                        darkenAutoDetect: false
                    })}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            const slider = screen.getByTestId('slider-edge-contrast').querySelector('input');
            fireEvent.change(slider!, { target: { value: '2.0' } });

            expect(mockUpdateParam).toHaveBeenCalledWith('darkenContrast', 2.0);
        });

        it('should call updateParam when Brightness slider changes', () => {
            render(
                <DarkPixelsSection
                    params={createParams({
                        darkenMode: 'contrast-edges',
                        darkenUseGlobalSettings: false,
                        darkenAutoDetect: false
                    })}
                    updateParam={mockUpdateParam}
                    defaultParams={DEFAULT_RENDER_PARAMS}
                />
            );

            const slider = screen.getByTestId('slider-edge-brightness').querySelector('input');
            fireEvent.change(slider!, { target: { value: '50' } });

            expect(mockUpdateParam).toHaveBeenCalledWith('darkenBrightness', 50);
        });
    });
});
