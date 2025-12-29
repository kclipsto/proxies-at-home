import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock values
const mockState = vi.hoisted(() => ({
    columns: 3,
    rows: 3,
}));

const mockSetters = vi.hoisted(() => ({
    setColumns: vi.fn(),
    setRows: vi.fn(),
}));

vi.mock('@/store/settings', () => ({
    useSettingsStore: vi.fn((selector) => {
        const state = {
            columns: mockState.columns,
            rows: mockState.rows,
            setColumns: mockSetters.setColumns,
            setRows: mockSetters.setRows,
        };
        return selector(state);
    }),
}));

vi.mock('flowbite-react', () => ({
    Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
        <label htmlFor={htmlFor}>{children}</label>
    ),
}));

vi.mock('../../LayoutSettings/PageSizeControl', () => ({
    PageSizeControl: () => <div data-testid="page-size-control">PageSizeControl</div>,
}));

vi.mock('@/components/common', () => ({
    NumberInput: React.forwardRef(({
        id,
        className,
        min,
        max,
        defaultValue,
        onChange,
        onBlur,
        placeholder,
    }: {
        id?: string;
        className?: string;
        min?: number;
        max?: number;
        defaultValue?: number;
        onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
        onBlur?: () => void;
        placeholder?: string;
    }, ref: React.Ref<HTMLInputElement>) => (
        <input
            ref={ref}
            id={id}
            data-testid={id}
            type="number"
            className={className}
            min={min}
            max={max}
            defaultValue={defaultValue}
            onChange={onChange}
            onBlur={onBlur}
            placeholder={placeholder}
        />
    )),
}));

vi.mock('@/hooks/useInputHooks', () => ({
    useNormalizedInput: (value: number, onChange: (v: number) => void) => ({
        inputRef: { current: null },
        defaultValue: value,
        handleChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val)) onChange(val);
        },
        handleBlur: vi.fn(),
    }),
}));

import { LayoutSection } from './LayoutSection';

describe('LayoutSection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.columns = 3;
        mockState.rows = 3;
    });

    describe('rendering', () => {
        it('should render PageSizeControl', () => {
            render(<LayoutSection />);
            expect(screen.getByTestId('page-size-control')).toBeDefined();
        });

        it('should render Columns label and input', () => {
            render(<LayoutSection />);
            expect(screen.getByText('Columns')).toBeDefined();
            expect(screen.getByTestId('columns-input')).toBeDefined();
        });

        it('should render Rows label and input', () => {
            render(<LayoutSection />);
            expect(screen.getByText('Rows')).toBeDefined();
            expect(screen.getByTestId('rows-input')).toBeDefined();
        });
    });

    describe('columns input', () => {
        it('should display current columns value', () => {
            render(<LayoutSection />);
            const input = screen.getByTestId('columns-input') as HTMLInputElement;
            expect(input.defaultValue).toBe('3');
        });

        it('should call setColumns when value changes', () => {
            render(<LayoutSection />);
            const input = screen.getByTestId('columns-input');
            fireEvent.change(input, { target: { value: '4' } });
            expect(mockSetters.setColumns).toHaveBeenCalledWith(4);
        });
    });

    describe('rows input', () => {
        it('should display current rows value', () => {
            render(<LayoutSection />);
            const input = screen.getByTestId('rows-input') as HTMLInputElement;
            expect(input.defaultValue).toBe('3');
        });

        it('should call setRows when value changes', () => {
            render(<LayoutSection />);
            const input = screen.getByTestId('rows-input');
            fireEvent.change(input, { target: { value: '5' } });
            expect(mockSetters.setRows).toHaveBeenCalledWith(5);
        });
    });

    describe('input constraints', () => {
        it('should have min 1 and max 10 for columns', () => {
            render(<LayoutSection />);
            const input = screen.getByTestId('columns-input') as HTMLInputElement;
            expect(input.min).toBe('1');
            expect(input.max).toBe('10');
        });

        it('should have min 1 and max 10 for rows', () => {
            render(<LayoutSection />);
            const input = screen.getByTestId('rows-input') as HTMLInputElement;
            expect(input.min).toBe('1');
            expect(input.max).toBe('10');
        });
    });
});
