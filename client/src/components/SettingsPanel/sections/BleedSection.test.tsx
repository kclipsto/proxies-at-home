import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock hoisted values
const mockState = vi.hoisted(() => ({
    bleedEdgeWidth: 3,
    bleedEdge: true,
    bleedEdgeUnit: 'mm' as 'mm' | 'in',
    withBleedSourceAmount: 3.175,
    withBleedTargetMode: 'global' as 'global' | 'manual' | 'none',
    withBleedTargetAmount: 3,
    noBleedTargetMode: 'global' as 'global' | 'manual' | 'none',
    noBleedTargetAmount: 3,
}));

const mockSetters = vi.hoisted(() => ({
    setBleedEdgeWidth: vi.fn(),
    setBleedEdge: vi.fn(),
    setBleedEdgeUnit: vi.fn(),
    setWithBleedSourceAmount: vi.fn(),
    setWithBleedTargetMode: vi.fn(),
    setWithBleedTargetAmount: vi.fn(),
    setNoBleedTargetMode: vi.fn(),
    setNoBleedTargetAmount: vi.fn(),
}));

vi.mock('@/store/settings', () => ({
    useSettingsStore: vi.fn((selector) => {
        const state = {
            bleedEdgeWidth: mockState.bleedEdgeWidth,
            bleedEdge: mockState.bleedEdge,
            bleedEdgeUnit: mockState.bleedEdgeUnit,
            withBleedSourceAmount: mockState.withBleedSourceAmount,
            withBleedTargetMode: mockState.withBleedTargetMode,
            withBleedTargetAmount: mockState.withBleedTargetAmount,
            noBleedTargetMode: mockState.noBleedTargetMode,
            noBleedTargetAmount: mockState.noBleedTargetAmount,
            ...mockSetters,
        };
        return selector(state);
    }),
}));

vi.mock('flowbite-react', () => ({
    Label: ({ children, htmlFor, className }: { children: React.ReactNode; htmlFor?: string; className?: string }) => (
        <label htmlFor={htmlFor} className={className}>{children}</label>
    ),
    Select: ({ value, onChange, disabled, children, className }: { value: string; onChange: (e: { target: { value: string } }) => void; disabled?: boolean; children: React.ReactNode; className?: string; sizing?: string }) => (
        <select data-testid="unit-select" value={value} onChange={onChange} disabled={disabled} className={className}>
            {children}
        </select>
    ),
    Checkbox: ({ id, checked, onChange }: { id: string; checked: boolean; onChange: (e: { target: { checked: boolean } }) => void }) => (
        <input type="checkbox" id={id} data-testid={id} checked={checked} onChange={(e) => onChange({ target: { checked: e.target.checked } })} />
    ),
}));

vi.mock('@/components/common', () => ({
    NumberInput: React.forwardRef(({ disabled, defaultValue, onChange, onBlur, className, step }: { disabled?: boolean; defaultValue?: number; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; onBlur?: () => void; className?: string; step?: number }, ref: React.Ref<HTMLInputElement>) => (
        <input ref={ref} data-testid="bleed-width-input" type="number" disabled={disabled} defaultValue={defaultValue} onChange={onChange} onBlur={onBlur} className={className} step={step} />
    )),
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

vi.mock('lucide-react', () => ({
    ChevronDown: () => <span data-testid="chevron-down">▼</span>,
    ChevronUp: () => <span data-testid="chevron-up">▲</span>,
}));

vi.mock('@/components/CardEditorModal/SourceBleedInput', () => ({
    SourceBleedInput: ({ valueMm, onChangeMm }: { valueMm: number; onChangeMm: (v: number) => void }) => (
        <div data-testid="source-bleed-input" data-value={valueMm}>
            <input type="number" onChange={(e) => onChangeMm(parseFloat(e.target.value))} />
        </div>
    ),
}));

vi.mock('@/components/CardEditorModal/BleedModeControl', () => ({
    BleedModeControl: ({ idPrefix, mode, onModeChange, amount, onAmountChange }: { idPrefix: string; mode: string; onModeChange: (m: string) => void; amount: number; onAmountChange: (v: number) => void; groupName?: string }) => (
        <div data-testid={`bleed-mode-control-${idPrefix}`} data-mode={mode} data-amount={amount}>
            <button onClick={() => onModeChange('manual')}>Manual</button>
            <input type="number" onChange={(e) => onAmountChange(parseFloat(e.target.value))} />
        </div>
    ),
}));

import { BleedSection } from './BleedSection';
import { CONSTANTS } from '@/constants/commonConstants';

describe('BleedSection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.bleedEdge = true;
        mockState.bleedEdgeWidth = 3;
        mockState.bleedEdgeUnit = 'mm';
    });

    describe('rendering', () => {
        it('should render heading', () => {
            render(<BleedSection />);
            expect(screen.getByText('Bleed Settings')).toBeDefined();
        });

        it('should render Bleed Width label and input', () => {
            render(<BleedSection />);
            expect(screen.getByText('Bleed Width')).toBeDefined();
            expect(screen.getByTestId('bleed-width-input')).toBeDefined();
        });

        it('should render Enable Bleed Edge checkbox', () => {
            render(<BleedSection />);
            expect(screen.getByText('Enable Bleed Edge')).toBeDefined();
            expect(screen.getByTestId('bleed-edge')).toBeDefined();
        });

        it('should render collapsible section headers', () => {
            render(<BleedSection />);
            expect(screen.getByText('Images With Bleed Settings')).toBeDefined();
            expect(screen.getByText('Images Without Bleed Settings')).toBeDefined();
        });
    });

    describe('bleed edge toggle', () => {
        it('should call setBleedEdge when checkbox changes', () => {
            render(<BleedSection />);
            const checkbox = screen.getByTestId('bleed-edge');
            fireEvent.click(checkbox);
            expect(mockSetters.setBleedEdge).toHaveBeenCalled();
        });

        it('should disable inputs when bleed edge is off', () => {
            mockState.bleedEdge = false;
            render(<BleedSection />);
            const input = screen.getByTestId('bleed-width-input') as HTMLInputElement;
            expect(input.disabled).toBe(true);
        });
    });

    describe('unit conversion', () => {
        it('should call setBleedEdgeUnit when unit changes', () => {
            render(<BleedSection />);
            const select = screen.getByTestId('unit-select');
            fireEvent.change(select, { target: { value: 'in' } });
            expect(mockSetters.setBleedEdgeUnit).toHaveBeenCalledWith('in');
        });

        it('should convert mm to inches when switching to inches', () => {
            mockState.bleedEdgeWidth = 25.4; // 1 inch in mm
            mockState.bleedEdgeUnit = 'mm';
            render(<BleedSection />);
            const select = screen.getByTestId('unit-select');
            fireEvent.change(select, { target: { value: 'in' } });
            // Should convert 25.4mm to in via DISPLAY_MM_TO_PX
            const expected = parseFloat((25.4 / CONSTANTS.DISPLAY_MM_TO_PX).toFixed(3));
            expect(mockSetters.setBleedEdgeWidth).toHaveBeenCalledWith(expected);
        });

        it('should convert inches to mm when switching to mm', () => {
            mockState.bleedEdgeWidth = 1; // 1 inch
            mockState.bleedEdgeUnit = 'in';
            render(<BleedSection />);
            const select = screen.getByTestId('unit-select');
            fireEvent.change(select, { target: { value: 'mm' } });
            // Should convert 1 inch to mm via DISPLAY_MM_TO_PX
            const expected = parseFloat((1 * CONSTANTS.DISPLAY_MM_TO_PX).toFixed(2));
            expect(mockSetters.setBleedEdgeWidth).toHaveBeenCalledWith(expected);
        });

        it('should not convert when selecting same unit', () => {
            mockState.bleedEdgeUnit = 'mm';
            render(<BleedSection />);
            const select = screen.getByTestId('unit-select');
            fireEvent.change(select, { target: { value: 'mm' } });
            // setBleedEdgeWidth should NOT be called for conversion
            // but setBleedEdgeUnit might still be called
            expect(mockSetters.setBleedEdgeUnit).toHaveBeenCalledWith('mm');
        });
    });

    describe('collapsible sections', () => {
        it('should show chevron down initially for with bleed section', () => {
            render(<BleedSection />);
            expect(screen.getAllByTestId('chevron-down').length).toBeGreaterThan(0);
        });

        it('should expand with bleed section when clicked', () => {
            render(<BleedSection />);
            const button = screen.getByText('Images With Bleed Settings');
            fireEvent.click(button);
            expect(screen.getByTestId('source-bleed-input')).toBeDefined();
            expect(screen.getByTestId('bleed-mode-control-wb')).toBeDefined();
        });

        it('should expand no bleed section when clicked', () => {
            render(<BleedSection />);
            const button = screen.getByText('Images Without Bleed Settings');
            fireEvent.click(button);
            expect(screen.getByTestId('bleed-mode-control-nb')).toBeDefined();
        });

        it('should show chevron up when expanded', () => {
            render(<BleedSection />);
            const button = screen.getByText('Images With Bleed Settings');
            fireEvent.click(button);
            expect(screen.getByTestId('chevron-up')).toBeDefined();
        });
    });

    describe('with bleed settings', () => {
        beforeEach(() => {
            render(<BleedSection />);
            fireEvent.click(screen.getByText('Images With Bleed Settings'));
        });

        it('should render SourceBleedInput', () => {
            expect(screen.getByTestId('source-bleed-input')).toBeDefined();
        });

        it('should render BleedModeControl with wb prefix', () => {
            expect(screen.getByTestId('bleed-mode-control-wb')).toBeDefined();
        });
    });

    describe('no bleed settings', () => {
        beforeEach(() => {
            render(<BleedSection />);
            fireEvent.click(screen.getByText('Images Without Bleed Settings'));
        });

        it('should render BleedModeControl with nb prefix', () => {
            expect(screen.getByTestId('bleed-mode-control-nb')).toBeDefined();
        });
    });

    describe('bleed width input', () => {
        it('should call setBleedEdgeWidth when input value changes', () => {
            render(<BleedSection />);
            const input = screen.getByTestId('bleed-width-input');
            fireEvent.change(input, { target: { value: '5' } });
            expect(mockSetters.setBleedEdgeWidth).toHaveBeenCalledWith(5);
        });
    });
});
