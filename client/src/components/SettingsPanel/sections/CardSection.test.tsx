import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock hoisted values
const mockState = vi.hoisted(() => ({
    columns: 3,
    rows: 3,
    bleedEdgeWidth: 3,
    bleedEdge: true,
    pageWidth: 8.5,
    pageHeight: 11,
    pageSizeUnit: 'in' as 'in' | 'mm',
    cardSpacingMm: 0,
    cardPositionX: 0,
    cardPositionY: 0,
    dpi: 600,
}));

const mockSetters = vi.hoisted(() => ({
    setCardSpacingMm: vi.fn(),
    setCardPositionX: vi.fn(),
    setCardPositionY: vi.fn(),
    setDpi: vi.fn(),
}));

vi.mock('@/store/settings', () => ({
    useSettingsStore: vi.fn((selector) => {
        const state = {
            ...mockState,
            ...mockSetters,
        };
        return selector(state);
    }),
}));

vi.mock('flowbite-react', () => ({
    Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

vi.mock('@/components/common', () => ({
    NumberInput: React.forwardRef(({ defaultValue, onChange, onBlur, placeholder, min, step, className }: { defaultValue?: number; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; onBlur?: () => void; placeholder?: string; min?: number; step?: number; className?: string }, ref: React.Ref<HTMLInputElement>) => (
        <input ref={ref} data-testid={`number-input-${placeholder || defaultValue}`} type="number" defaultValue={defaultValue} onChange={onChange} onBlur={onBlur} placeholder={placeholder} min={min} step={step} className={className} />
    )),
    AutoTooltip: ({ content }: { content: React.ReactNode }) => <span data-testid="tooltip">{typeof content === 'string' ? content : 'tip'}</span>,
}));

vi.mock('@/hooks/useInputHooks', () => ({
    useNormalizedInput: (value: number, onChange: (v: number) => void, options: { min: number; max: number }) => ({
        inputRef: { current: null },
        defaultValue: value,
        handleChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val >= options.min && val <= options.max) onChange(val);
        },
        handleBlur: vi.fn(),
        warning: value > options.max ? 'Too high' : null,
    }),
    usePositionInput: (value: number, onChange: (v: number) => void) => ({
        inputRef: { current: null },
        defaultValue: value,
        handleChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) onChange(val);
        },
        handleBlur: vi.fn(),
    }),
}));

import { CardSection } from './CardSection';

describe('CardSection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.dpi = 600;
        mockState.cardSpacingMm = 0;
    });

    describe('rendering', () => {
        it('should render Card Spacing label and input', () => {
            render(<CardSection />);
            expect(screen.getByText('Card Spacing (mm)')).toBeDefined();
        });

        it('should render Card Position Adjustment section', () => {
            render(<CardSection />);
            expect(screen.getByText('Card Position Adjustment (mm)')).toBeDefined();
            expect(screen.getByText('Horizontal Offset')).toBeDefined();
            expect(screen.getByText('Vertical Offset')).toBeDefined();
        });

        it('should render tooltips', () => {
            render(<CardSection />);
            const tooltips = screen.getAllByTestId('tooltip');
            expect(tooltips.length).toBeGreaterThan(0);
        });
    });

    describe('card spacing', () => {
        it('should show warning when spacing exceeds max', () => {
            mockState.cardSpacingMm = 100; // Exceeds max
            render(<CardSection />);
            expect(screen.getByText('Too high')).toBeDefined();
        });
    });

    describe('card position', () => {
        it('should render horizontal offset input', () => {
            render(<CardSection />);
            expect(screen.getByText('Horizontal Offset')).toBeDefined();
        });

        it('should render vertical offset input', () => {
            render(<CardSection />);
            expect(screen.getByText('Vertical Offset')).toBeDefined();
        });
    });
});
