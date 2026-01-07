import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock hoisted values
const mockState = vi.hoisted(() => ({
    guideColor: '#000000',
    guideWidth: 1,
    cutLineStyle: 'full' as 'full' | 'edges' | 'none',
    perCardGuideStyle: 'corners' as string,
    guidePlacement: 'outside' as 'outside' | 'center' | 'inside',
    cutGuideLengthMm: 6.25,
    bleedEdge: true,
    bleedEdgeWidth: 3,
    cardSpacingMm: 0,
}));

const mockSetters = vi.hoisted(() => ({
    setGuideColor: vi.fn(),
    setGuideWidth: vi.fn(),
    setCutLineStyle: vi.fn(),
    setPerCardGuideStyle: vi.fn(),
    setGuidePlacement: vi.fn(),
    setCutGuideLengthMm: vi.fn(),
}));

const mockSetState = vi.hoisted(() => vi.fn());

vi.mock('@/store/settings', () => ({
    useSettingsStore: Object.assign(
        (selector: (s: typeof mockState & typeof mockSetters) => unknown) => {
            const state = { ...mockState, ...mockSetters };
            return selector(state);
        },
        { setState: mockSetState }
    ),
}));

vi.mock('flowbite-react', () => ({
    Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => <label htmlFor={htmlFor}>{children}</label>,
    Select: ({ id, value, onChange, children }: { id?: string; value: string; onChange: (e: { target: { value: string } }) => void; children: React.ReactNode }) => (
        <select data-testid={id || 'select'} value={value} onChange={onChange}>{children}</select>
    ),
    Button: ({ children, onClick, color, size }: { children: React.ReactNode; onClick?: () => void; color?: string; size?: string }) => (
        <button onClick={onClick} data-color={color} data-size={size}>{children}</button>
    ),
}));

vi.mock('@/components/common', () => ({
    NumberInput: React.forwardRef(({ id, defaultValue, onChange, onBlur, step }: { id?: string; defaultValue?: number; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; onBlur?: () => void; step?: number }, ref: React.Ref<HTMLInputElement>) => (
        <input ref={ref} data-testid={id || 'number-input'} type="number" defaultValue={defaultValue} onChange={onChange} onBlur={onBlur} step={step} />
    )),
    AutoTooltip: ({ content }: { content: React.ReactNode }) => <span data-testid="tooltip">{typeof content === 'string' ? content : 'tip'}</span>,
}));

vi.mock('@/hooks/useInputHooks', () => ({
    useNormalizedInput: (value: number, onChange: (v: number) => void) => ({
        inputRef: { current: null },
        defaultValue: value,
        handleChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) onChange(val);
        },
        handleBlur: vi.fn(),
    }),
}));

vi.mock('../../common/ColorPicker', () => ({
    ColorPicker: ({ label, value, onChange, onChangeEnd }: { label: string; value: string; onChange: (c: string) => void; onChangeEnd?: (c: string, prev: string) => void }) => (
        <div data-testid="color-picker">
            <label>{label}</label>
            <input type="color" value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => onChangeEnd?.(value, '#000000')} />
        </div>
    ),
}));

vi.mock('../../common/StyledSlider', () => ({
    StyledSlider: ({ label, value, onChange, displayValue }: { label: string; value: number; onChange: (v: number) => void; displayValue: string }) => (
        <div data-testid="guide-length-slider">
            <label>{label}</label>
            <input type="range" value={value} onChange={(e) => onChange(parseFloat(e.target.value))} data-display={displayValue} />
        </div>
    ),
}));

import { GuidesSection } from './GuidesSection';

describe('GuidesSection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.perCardGuideStyle = 'corners';
        mockState.guidePlacement = 'outside';
        mockState.guideWidth = 1;
    });

    describe('rendering', () => {
        it('should render Guide Color picker', () => {
            render(<GuidesSection />);
            expect(screen.getByTestId('color-picker')).toBeDefined();
            expect(screen.getByText('Guide Color')).toBeDefined();
        });

        it('should render Guide Width input', () => {
            render(<GuidesSection />);
            expect(screen.getByText('Guide Width (px)')).toBeDefined();
            expect(screen.getByTestId('guideWidth')).toBeDefined();
        });

        it('should render Placement section', () => {
            render(<GuidesSection />);
            expect(screen.getByText('Placement')).toBeDefined();
        });

        it('should render Card Cut Guides section', () => {
            render(<GuidesSection />);
            expect(screen.getByText('Card Cut Guides')).toBeDefined();
        });

        it('should render Page Cut Guides selector', () => {
            render(<GuidesSection />);
            expect(screen.getByText('Page Cut Guides')).toBeDefined();
            expect(screen.getByTestId('cutLineStyle')).toBeDefined();
        });
    });

    describe('placement buttons', () => {
        it('should have Outside, Center, and Inside buttons', () => {
            render(<GuidesSection />);
            expect(screen.getByTitle('Outside - stroke in bleed area')).toBeDefined();
            expect(screen.getByTitle('Center - stroke straddles cut line')).toBeDefined();
            expect(screen.getByTitle('Inside - stroke within card content')).toBeDefined();
        });

        it('should call setGuidePlacement when placement button clicked', () => {
            render(<GuidesSection />);
            fireEvent.click(screen.getByTitle('Center - stroke straddles cut line'));
            expect(mockSetters.setGuidePlacement).toHaveBeenCalledWith('center');
        });

        it('should call setGuidePlacement for inside', () => {
            render(<GuidesSection />);
            fireEvent.click(screen.getByTitle('Inside - stroke within card content'));
            expect(mockSetters.setGuidePlacement).toHaveBeenCalledWith('inside');
        });
    });

    describe('card cut guide styles', () => {
        it('should show Enable Card Guides button when style is none', () => {
            mockState.perCardGuideStyle = 'none';
            render(<GuidesSection />);
            expect(screen.getByText('Enable Card Guides')).toBeDefined();
        });

        it('should call setPerCardGuideStyle when enabling guides', () => {
            mockState.perCardGuideStyle = 'none';
            render(<GuidesSection />);
            fireEvent.click(screen.getByText('Enable Card Guides'));
            expect(mockSetters.setPerCardGuideStyle).toHaveBeenCalledWith('corners');
        });

        it('should show style options when guides are enabled', () => {
            mockState.perCardGuideStyle = 'corners';
            render(<GuidesSection />);
            expect(screen.getByText('Corners')).toBeDefined();
            expect(screen.getByText('Full')).toBeDefined();
            expect(screen.getByText('Solid')).toBeDefined();
            expect(screen.getByText('Dashed')).toBeDefined();
            expect(screen.getByText('Square')).toBeDefined();
            expect(screen.getByText('Round')).toBeDefined();
        });

        it('should show Disable Card Guides button when enabled', () => {
            mockState.perCardGuideStyle = 'corners';
            render(<GuidesSection />);
            expect(screen.getByText('Disable Card Guides')).toBeDefined();
        });

        it('should call setPerCardGuideStyle when disabling guides', () => {
            mockState.perCardGuideStyle = 'corners';
            render(<GuidesSection />);
            fireEvent.click(screen.getByText('Disable Card Guides'));
            expect(mockSetters.setPerCardGuideStyle).toHaveBeenCalledWith('none');
        });
    });

    describe('guide length slider', () => {
        it('should show guide length slider for corner styles', () => {
            mockState.perCardGuideStyle = 'corners';
            render(<GuidesSection />);
            expect(screen.getByTestId('guide-length-slider')).toBeDefined();
            expect(screen.getByText('Guide Length')).toBeDefined();
        });

        it('should NOT show guide length slider for rect styles', () => {
            mockState.perCardGuideStyle = 'solid-squared-rect';
            render(<GuidesSection />);
            expect(screen.queryByTestId('guide-length-slider')).toBeNull();
        });
    });

    describe('page cut guides', () => {
        it('should have Full Lines, Edges Only, and None options', () => {
            render(<GuidesSection />);
            expect(screen.getByText('Full Lines')).toBeDefined();
            expect(screen.getByText('Edges Only')).toBeDefined();
            expect(screen.getByText('None')).toBeDefined();
        });

        it('should call setCutLineStyle when changed', () => {
            render(<GuidesSection />);
            const select = screen.getByTestId('cutLineStyle');
            fireEvent.change(select, { target: { value: 'edges' } });
            expect(mockSetters.setCutLineStyle).toHaveBeenCalledWith('edges');
        });
    });

    describe('toggle buttons', () => {
        it('should toggle to Full when clicking Full button', () => {
            mockState.perCardGuideStyle = 'corners';
            render(<GuidesSection />);
            fireEvent.click(screen.getByText('Full'));
            expect(mockSetters.setPerCardGuideStyle).toHaveBeenCalledWith('solid-squared-rect');
        });

        it('should toggle to Corners when clicking Corners button', () => {
            mockState.perCardGuideStyle = 'solid-squared-rect';
            render(<GuidesSection />);
            fireEvent.click(screen.getByText('Corners'));
            expect(mockSetters.setPerCardGuideStyle).toHaveBeenCalledWith('corners');
        });

        it('should toggle to Dashed when clicking Dashed button', () => {
            mockState.perCardGuideStyle = 'corners';
            render(<GuidesSection />);
            fireEvent.click(screen.getByText('Dashed'));
            expect(mockSetters.setPerCardGuideStyle).toHaveBeenCalledWith('dashed-corners');
        });

        it('should toggle to Solid when clicking Solid button', () => {
            mockState.perCardGuideStyle = 'dashed-corners';
            render(<GuidesSection />);
            fireEvent.click(screen.getByText('Solid'));
            expect(mockSetters.setPerCardGuideStyle).toHaveBeenCalledWith('corners');
        });

        it('should toggle to Round when clicking Round button', () => {
            mockState.perCardGuideStyle = 'corners';
            render(<GuidesSection />);
            fireEvent.click(screen.getByText('Round'));
            expect(mockSetters.setPerCardGuideStyle).toHaveBeenCalledWith('rounded-corners');
        });

        it('should toggle to Square when clicking Square button', () => {
            mockState.perCardGuideStyle = 'rounded-corners';
            render(<GuidesSection />);
            fireEvent.click(screen.getByText('Square'));
            expect(mockSetters.setPerCardGuideStyle).toHaveBeenCalledWith('corners');
        });
    });

    describe('style presets', () => {
        it('should render 8 style preset buttons', () => {
            mockState.perCardGuideStyle = 'corners';
            render(<GuidesSection />);
            // Check for known titles
            expect(screen.getByTitle('Square Corners - Solid')).toBeDefined();
            expect(screen.getByTitle('Rounded Full - Dashed')).toBeDefined();
        });

        it('should set style when preset clicked', () => {
            mockState.perCardGuideStyle = 'corners';
            render(<GuidesSection />);
            fireEvent.click(screen.getByTitle('Rounded Full - Dashed'));
            expect(mockSetters.setPerCardGuideStyle).toHaveBeenCalledWith('dashed-rounded-rect');
        });
    });
});
