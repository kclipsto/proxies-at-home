import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock values
const mockState = vi.hoisted(() => ({
    darkenMode: 'none' as 'none' | 'darken-all' | 'contrast-edges' | 'contrast-full',
    darkenAmount: 1.0,
    darkenEdgeWidth: 0.15,
    darkenContrast: 2.0,
    darkenBrightness: -50,
    darkenAutoDetect: true,
}));

const mockSetters = vi.hoisted(() => ({
    setDarkenMode: vi.fn(),
    setDarkenAmount: vi.fn(),
    setDarkenEdgeWidth: vi.fn(),
    setDarkenContrast: vi.fn(),
    setDarkenBrightness: vi.fn(),
    setDarkenAutoDetect: vi.fn(),
}));

vi.mock('@/store/settings', () => ({
    useSettingsStore: vi.fn((selector) => {
        const state = {
            darkenMode: mockState.darkenMode,
            setDarkenMode: mockSetters.setDarkenMode,
            darkenAmount: mockState.darkenAmount,
            setDarkenAmount: mockSetters.setDarkenAmount,
            darkenEdgeWidth: mockState.darkenEdgeWidth,
            setDarkenEdgeWidth: mockSetters.setDarkenEdgeWidth,
            darkenContrast: mockState.darkenContrast,
            setDarkenContrast: mockSetters.setDarkenContrast,
            darkenBrightness: mockState.darkenBrightness,
            setDarkenBrightness: mockSetters.setDarkenBrightness,
            darkenAutoDetect: mockState.darkenAutoDetect,
            setDarkenAutoDetect: mockSetters.setDarkenAutoDetect,
        };
        return selector(state);
    }),
}));

vi.mock('flowbite-react', () => ({
    Label: ({ children, htmlFor, className }: { children: React.ReactNode; htmlFor?: string; className?: string }) => (
        <label htmlFor={htmlFor} className={className}>{children}</label>
    ),
    Select: ({ value, onChange, children, sizing }: { value: string; onChange: (e: { target: { value: string } }) => void; children: React.ReactNode; sizing?: string }) => (
        <select data-testid="mode-select" value={value} onChange={onChange} data-sizing={sizing}>
            {children}
        </select>
    ),
    Checkbox: ({ id, checked, onChange }: { id: string; checked: boolean; onChange: (e: { target: { checked: boolean } }) => void }) => (
        <input
            type="checkbox"
            id={id}
            data-testid={id}
            checked={checked}
            onChange={(e) => onChange({ target: { checked: e.target.checked } })}
        />
    ),
}));

vi.mock('@/components/common/StyledSlider', () => ({
    StyledSlider: ({ label, value, onChange, displayValue }: { label: string; value: number; onChange: (v: number) => void; displayValue: string }) => (
        <div data-testid={`slider-${label.toLowerCase().replace(/ /g, '-')}`}>
            <label>{label}</label>
            <input
                type="range"
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                data-display={displayValue}
            />
        </div>
    ),
}));

vi.mock('@/components/CardCanvas', () => ({
    DEFAULT_RENDER_PARAMS: {
        darkenEdgeWidth: 0.15,
    },
}));

import { DarkenSection } from './DarkenSection';

describe('DarkenSection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.darkenMode = 'none';
        mockState.darkenAmount = 1.0;
        mockState.darkenAutoDetect = true;
    });

    describe('rendering', () => {
        it('should render mode label and select', () => {
            render(<DarkenSection />);
            expect(screen.getByText('Mode')).toBeDefined();
            expect(screen.getByTestId('mode-select')).toBeDefined();
        });

        it('should have all mode options', () => {
            render(<DarkenSection />);
            expect(screen.getByText('None')).toBeDefined();
            expect(screen.getByText('Darken All (Legacy)')).toBeDefined();
            expect(screen.getByText('Contrast Edges')).toBeDefined();
            expect(screen.getByText('Contrast Full')).toBeDefined();
        });
    });

    describe('mode switching', () => {
        it('should call setDarkenMode when mode changes', () => {
            render(<DarkenSection />);
            const select = screen.getByTestId('mode-select');
            fireEvent.change(select, { target: { value: 'darken-all' } });
            expect(mockSetters.setDarkenMode).toHaveBeenCalledWith('darken-all');
        });
    });

    describe('darken-all mode', () => {
        beforeEach(() => {
            mockState.darkenMode = 'darken-all';
            mockState.darkenAutoDetect = false;
        });

        it('should show Amount slider', () => {
            render(<DarkenSection />);
            expect(screen.getByTestId('slider-amount')).toBeDefined();
        });

        it('should show Contrast and Brightness sliders', () => {
            render(<DarkenSection />);
            expect(screen.getByTestId('slider-contrast')).toBeDefined();
            expect(screen.getByTestId('slider-brightness')).toBeDefined();
        });

        it('should NOT show Edge Width slider', () => {
            render(<DarkenSection />);
            expect(screen.queryByTestId('slider-edge-width')).toBeNull();
        });

        it('should NOT show Auto Detect checkbox', () => {
            render(<DarkenSection />);
            expect(screen.queryByTestId('darken-auto-detect')).toBeNull();
        });
    });

    describe('contrast-edges mode', () => {
        beforeEach(() => {
            mockState.darkenMode = 'contrast-edges';
            mockState.darkenAutoDetect = false;
        });

        it('should show Edge Width slider', () => {
            render(<DarkenSection />);
            expect(screen.getByTestId('slider-edge-width')).toBeDefined();
        });

        it('should show Auto Detect checkbox', () => {
            render(<DarkenSection />);
            expect(screen.getByTestId('darken-auto-detect')).toBeDefined();
        });

        it('should show Edge Contrast label', () => {
            render(<DarkenSection />);
            expect(screen.getByText('Edge Contrast')).toBeDefined();
        });

        it('should hide contrast/brightness when autoDetect is true', () => {
            mockState.darkenAutoDetect = true;
            render(<DarkenSection />);
            expect(screen.queryByTestId('slider-edge-contrast')).toBeNull();
            expect(screen.queryByTestId('slider-brightness')).toBeNull();
        });

        it('should call setDarkenAutoDetect when checkbox changes', () => {
            render(<DarkenSection />);
            const checkbox = screen.getByTestId('darken-auto-detect');
            fireEvent.click(checkbox);
            expect(mockSetters.setDarkenAutoDetect).toHaveBeenCalled();
        });
    });

    describe('contrast-full mode', () => {
        beforeEach(() => {
            mockState.darkenMode = 'contrast-full';
            mockState.darkenAutoDetect = false;
        });

        it('should show Amount slider', () => {
            render(<DarkenSection />);
            expect(screen.getByTestId('slider-amount')).toBeDefined();
        });

        it('should show Auto Detect checkbox', () => {
            render(<DarkenSection />);
            expect(screen.getByTestId('darken-auto-detect')).toBeDefined();
        });

        it('should NOT show Edge Width slider', () => {
            render(<DarkenSection />);
            expect(screen.queryByTestId('slider-edge-width')).toBeNull();
        });

        it('should show Contrast (not Edge Contrast) label', () => {
            render(<DarkenSection />);
            expect(screen.getByText('Contrast')).toBeDefined();
        });
    });

    describe('none mode', () => {
        it('should NOT show any sliders', () => {
            mockState.darkenMode = 'none';
            render(<DarkenSection />);
            expect(screen.queryByTestId('slider-amount')).toBeNull();
            expect(screen.queryByTestId('slider-edge-width')).toBeNull();
        });
    });
});
