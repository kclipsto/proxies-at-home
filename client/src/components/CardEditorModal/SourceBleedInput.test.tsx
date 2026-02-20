import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock dependencies
vi.mock('flowbite-react', () => ({
    Label: ({ children, className }: { children: React.ReactNode; className?: string }) => (
        <label className={className}>{children}</label>
    ),
    Select: ({
        value,
        onChange,
        children,
        className,
    }: {
        value: string;
        onChange: (e: { target: { value: string } }) => void;
        children: React.ReactNode;
        className?: string;
        sizing?: string;
    }) => (
        <select
            data-testid="unit-select"
            value={value}
            onChange={onChange}
            className={className}
        >
            {children}
        </select>
    ),
}));

vi.mock('../common', () => ({
    NumberInput: ({
        value,
        onChange,
        className,
        step,
    }: {
        value: number;
        onChange: (e: { target: { value: string } }) => void;
        className?: string;
        step?: number;
    }) => (
        <input
            data-testid="number-input"
            type="number"
            value={value}
            onChange={onChange}
            className={className}
            step={step}
        />
    ),
    AutoTooltip: ({ content }: { content: string }) => (
        <span data-testid="tooltip" title={content}>?</span>
    ),
}));

import { SourceBleedInput } from './SourceBleedInput';
import { CONSTANTS } from '@/constants/commonConstants';

describe('SourceBleedInput', () => {
    const mockOnChangeMm = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('rendering', () => {
        it('should render with default label', () => {
            render(<SourceBleedInput valueMm={3} onChangeMm={mockOnChangeMm} />);
            expect(screen.getByText('Source Bleed Amount:')).toBeDefined();
        });

        it('should render with custom label', () => {
            render(
                <SourceBleedInput
                    valueMm={3}
                    onChangeMm={mockOnChangeMm}
                    label="Custom Label"
                />
            );
            expect(screen.getByText('Custom Label')).toBeDefined();
        });

        it('should render tooltip with default text', () => {
            render(<SourceBleedInput valueMm={3} onChangeMm={mockOnChangeMm} />);
            expect(screen.getByTestId('tooltip')).toBeDefined();
        });

        it('should apply custom className', () => {
            const { container } = render(
                <SourceBleedInput
                    valueMm={3}
                    onChangeMm={mockOnChangeMm}
                    className="custom-class"
                />
            );
            expect((container.firstChild as HTMLElement).className).toContain('custom-class');
        });
    });

    describe('value display', () => {
        it('should display value in mm by default', () => {
            render(<SourceBleedInput valueMm={3.175} onChangeMm={mockOnChangeMm} />);
            const input = screen.getByTestId('number-input') as HTMLInputElement;
            expect(parseFloat(input.value)).toBeCloseTo(3.175, 2);
        });

        it('should display value in inches when unit is changed', () => {
            render(<SourceBleedInput valueMm={CONSTANTS.MM_PER_IN} onChangeMm={mockOnChangeMm} />);

            const select = screen.getByTestId('unit-select');
            fireEvent.change(select, { target: { value: 'in' } });

            const input = screen.getByTestId('number-input') as HTMLInputElement;
            expect(parseFloat(input.value)).toBeCloseTo(1, 2);
        });
    });

    describe('value changes', () => {
        it('should call onChangeMm with mm value when input changes (in mm mode)', () => {
            render(<SourceBleedInput valueMm={3} onChangeMm={mockOnChangeMm} />);

            const input = screen.getByTestId('number-input');
            fireEvent.change(input, { target: { value: '5' } });

            expect(mockOnChangeMm).toHaveBeenCalledWith(5);
        });

        it('should convert inches to mm when calling onChangeMm (in inches mode)', () => {
            render(<SourceBleedInput valueMm={CONSTANTS.MM_PER_IN} onChangeMm={mockOnChangeMm} />);

            const select = screen.getByTestId('unit-select');
            fireEvent.change(select, { target: { value: 'in' } });

            const input = screen.getByTestId('number-input');
            fireEvent.change(input, { target: { value: '2' } });

            expect(mockOnChangeMm).toHaveBeenCalledWith(CONSTANTS.MM_PER_IN * 2);
        });

        it('should handle empty input as 0', () => {
            render(<SourceBleedInput valueMm={3} onChangeMm={mockOnChangeMm} />);

            const input = screen.getByTestId('number-input');
            fireEvent.change(input, { target: { value: '' } });

            expect(mockOnChangeMm).toHaveBeenCalledWith(0);
        });
    });

    describe('unit selection', () => {
        it('should have mm and in options', () => {
            render(<SourceBleedInput valueMm={3} onChangeMm={mockOnChangeMm} />);
            const select = screen.getByTestId('unit-select');

            expect(select.querySelector('option[value="mm"]')).toBeDefined();
            expect(select.querySelector('option[value="in"]')).toBeDefined();
        });
    });
});
