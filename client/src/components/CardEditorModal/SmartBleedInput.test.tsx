import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('flowbite-react', () => ({
    Label: ({ children, className }: { children: React.ReactNode; className?: string }) => (
        <label className={className}>{children}</label>
    ),
    Select: ({ children, value, onChange, disabled, className }: { children: React.ReactNode; value: string; onChange: (e: { target: { value: string } }) => void; disabled?: boolean; className?: string }) => (
        <select value={value} onChange={onChange} disabled={disabled} className={className} data-testid="unit-select">
            {children}
        </select>
    ),
}));

vi.mock('../common', () => ({
    NumberInput: ({ value, onChange, disabled, step, className }: { value: number | string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; disabled?: boolean; step?: number; className?: string }) => (
        <input type="number" value={value} onChange={onChange} disabled={disabled} step={step} className={className} data-testid="number-input" />
    ),
    AutoTooltip: ({ content }: { content: string }) => <span data-testid="tooltip">{content}</span>,
}));

import { SmartBleedInput } from './SmartBleedInput';
import { CONSTANTS } from '@/constants/commonConstants';

describe('SmartBleedInput', () => {
    const defaultProps = {
        valueMm: 3,
        onChangeMm: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('rendering', () => {
        it('should render number input', () => {
            render(<SmartBleedInput {...defaultProps} />);
            expect(screen.getByTestId('number-input')).toBeDefined();
        });

        it('should render unit select', () => {
            render(<SmartBleedInput {...defaultProps} />);
            expect(screen.getByTestId('unit-select')).toBeDefined();
        });

        it('should render label when provided', () => {
            render(<SmartBleedInput {...defaultProps} label="Bleed Width" />);
            expect(screen.getByText('Bleed Width')).toBeDefined();
        });

        it('should render tooltip when provided', () => {
            render(<SmartBleedInput {...defaultProps} tooltip="Help text" />);
            expect(screen.getByTestId('tooltip')).toBeDefined();
        });

        it('should apply disabled state', () => {
            render(<SmartBleedInput {...defaultProps} disabled={true} />);
            const input = screen.getByTestId('number-input') as HTMLInputElement;
            expect(input.disabled).toBe(true);
        });
    });

    describe('value handling', () => {
        it('should display mm value', () => {
            render(<SmartBleedInput {...defaultProps} valueMm={5} />);
            const input = screen.getByTestId('number-input') as HTMLInputElement;
            expect(input.value).toBe('5');
        });

        it('should call onChangeMm when input changes', () => {
            const onChangeMm = vi.fn();
            render(<SmartBleedInput {...defaultProps} onChangeMm={onChangeMm} />);

            const input = screen.getByTestId('number-input');
            fireEvent.change(input, { target: { value: '5' } });

            expect(onChangeMm).toHaveBeenCalledWith(5);
        });

        it('should not call onChangeMm for NaN values', () => {
            const onChangeMm = vi.fn();
            render(<SmartBleedInput {...defaultProps} onChangeMm={onChangeMm} />);

            const input = screen.getByTestId('number-input');
            fireEvent.change(input, { target: { value: 'abc' } });

            expect(onChangeMm).not.toHaveBeenCalled();
        });
    });

    describe('unit conversion', () => {
        it('should convert to inches when unit is changed', () => {
            render(<SmartBleedInput {...defaultProps} valueMm={CONSTANTS.MM_PER_IN} />);

            const select = screen.getByTestId('unit-select');
            fireEvent.change(select, { target: { value: 'in' } });

            const input = screen.getByTestId('number-input') as HTMLInputElement;
            expect(parseFloat(input.value)).toBeCloseTo(1, 1);
        });

        it('should convert inches to mm when submitting', () => {
            const onChangeMm = vi.fn();
            render(<SmartBleedInput {...defaultProps} valueMm={CONSTANTS.MM_PER_IN} onChangeMm={onChangeMm} />);

            const select = screen.getByTestId('unit-select');
            fireEvent.change(select, { target: { value: 'in' } });

            const input = screen.getByTestId('number-input');
            fireEvent.change(input, { target: { value: '2' } });

            expect(onChangeMm).toHaveBeenCalledWith(50.8);
        });
    });
});
