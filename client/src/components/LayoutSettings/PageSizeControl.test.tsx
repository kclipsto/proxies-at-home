import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock hoisted values
const mockState = vi.hoisted(() => ({
    pageSizeUnit: 'in' as 'in' | 'mm',
    pageOrientation: 'portrait' as 'portrait' | 'landscape',
    pageSizePreset: 'Letter' as string,
    pageWidth: 8.5,
    pageHeight: 11,
}));

const mockSetters = vi.hoisted(() => ({
    setPageSizePreset: vi.fn(),
    setPageWidth: vi.fn(),
    setPageHeight: vi.fn(),
    setPageSizeUnit: vi.fn(),
    swapPageOrientation: vi.fn(),
}));

vi.mock('@/store', () => ({
    useSettingsStore: vi.fn((selector) => {
        const state = { ...mockState, ...mockSetters };
        return selector(state);
    }),
}));

vi.mock('flowbite-react', () => ({
    Label: ({ children, htmlFor, className }: { children: React.ReactNode; htmlFor?: string; className?: string }) => (
        <label htmlFor={htmlFor} className={className}>{children}</label>
    ),
    Select: ({ id, value, onChange, children }: { id?: string; value: string; onChange: (e: { target: { value: string } }) => void; children: React.ReactNode }) => (
        <select data-testid={id || 'select'} value={value} onChange={onChange}>{children}</select>
    ),
    Button: ({ children, onClick, className, color }: { children: React.ReactNode; onClick?: () => void; className?: string; color?: string }) => (
        <button onClick={onClick} className={className} data-color={color}>{children}</button>
    ),
    ToggleSwitch: ({ id, checked, onChange }: { id?: string; checked: boolean; onChange: () => void }) => (
        <input type="checkbox" data-testid={id || 'toggle'} checked={checked} onChange={onChange} />
    ),
}));

vi.mock('lucide-react', () => ({
    RefreshCw: ({ className }: { className?: string }) => <span data-testid="refresh-icon" className={className}>↻</span>,
}));

vi.mock('../common', () => ({
    NumberInput: ({ id, disabled, value, onChange, onBlur, onKeyDown, step, min }: { id?: string; disabled?: boolean; value: string; onChange?: (e: { target: { value: string } }) => void; onBlur?: () => void; onKeyDown?: (e: { key: string }) => void; step?: number; min?: number }) => (
        <input
            data-testid={id || 'number-input'}
            type="number"
            disabled={disabled}
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            step={step}
            min={min}
        />
    ),
}));

import { PageSizeControl } from './PageSizeControl';

describe('PageSizeControl', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.pageSizePreset = 'Letter';
        mockState.pageSizeUnit = 'in';
        mockState.pageWidth = 8.5;
        mockState.pageHeight = 11;
        mockState.pageOrientation = 'portrait';
    });

    describe('rendering', () => {
        it('should render Page size label and select', () => {
            render(<PageSizeControl />);
            expect(screen.getByText('Page size')).toBeDefined();
            expect(screen.getByTestId('page-size-select')).toBeDefined();
        });

        it('should render page width and height inputs', () => {
            render(<PageSizeControl />);
            expect(screen.getByTestId('page-width-input')).toBeDefined();
            expect(screen.getByTestId('page-height-input')).toBeDefined();
        });

        it('should render Swap Orientation button', () => {
            render(<PageSizeControl />);
            expect(screen.getByText('Swap Orientation')).toBeDefined();
        });

        it('should render all preset options', () => {
            render(<PageSizeControl />);
            expect(screen.getByText(/Letter/)).toBeDefined();
            expect(screen.getByText(/A4/)).toBeDefined();
            expect(screen.getByText('Custom')).toBeDefined();
        });
    });

    describe('preset selection', () => {
        it('should call setPageSizePreset when preset changes', () => {
            render(<PageSizeControl />);
            const select = screen.getByTestId('page-size-select');
            fireEvent.change(select, { target: { value: 'A4' } });
            expect(mockSetters.setPageSizePreset).toHaveBeenCalledWith('A4');
        });
    });

    describe('custom size inputs', () => {
        beforeEach(() => {
            mockState.pageSizePreset = 'Custom';
        });

        it('should enable inputs when Custom preset is selected', () => {
            render(<PageSizeControl />);
            const widthInput = screen.getByTestId('page-width-input') as HTMLInputElement;
            expect(widthInput.disabled).toBe(false);
        });

        it('should disable inputs when preset is not Custom', () => {
            mockState.pageSizePreset = 'Letter';
            render(<PageSizeControl />);
            const widthInput = screen.getByTestId('page-width-input') as HTMLInputElement;
            expect(widthInput.disabled).toBe(true);
        });

        it('should show unit toggle when Custom preset is selected', () => {
            render(<PageSizeControl />);
            expect(screen.getByText('inches')).toBeDefined();
            expect(screen.getByText('mm')).toBeDefined();
        });

        it('should call setPageSizeUnit when unit toggle changes', () => {
            render(<PageSizeControl />);
            const toggle = screen.getByTestId('unit-toggle');
            fireEvent.click(toggle);
            expect(mockSetters.setPageSizeUnit).toHaveBeenCalledWith('mm');
        });

        it('should call setPageWidth on blur with valid value', () => {
            render(<PageSizeControl />);
            const widthInput = screen.getByTestId('page-width-input');
            fireEvent.change(widthInput, { target: { value: '10' } });
            fireEvent.blur(widthInput);
            expect(mockSetters.setPageWidth).toHaveBeenCalledWith(10);
        });

        it('should call setPageHeight on blur with valid value', () => {
            render(<PageSizeControl />);
            const heightInput = screen.getByTestId('page-height-input');
            fireEvent.change(heightInput, { target: { value: '12' } });
            fireEvent.blur(heightInput);
            expect(mockSetters.setPageHeight).toHaveBeenCalledWith(12);
        });

        it('should commit width on Enter key', () => {
            render(<PageSizeControl />);
            const widthInput = screen.getByTestId('page-width-input');
            fireEvent.change(widthInput, { target: { value: '9' } });
            fireEvent.keyDown(widthInput, { key: 'Enter' });
            expect(mockSetters.setPageWidth).toHaveBeenCalledWith(9);
        });
    });

    describe('swap orientation', () => {
        it('should call swapPageOrientation when button clicked', () => {
            render(<PageSizeControl />);
            fireEvent.click(screen.getByText('Swap Orientation'));
            expect(mockSetters.swapPageOrientation).toHaveBeenCalled();
        });
    });

    describe('orientation label format', () => {
        it('should display preset label in portrait format', () => {
            mockState.pageOrientation = 'portrait';
            render(<PageSizeControl />);
            // Letter portrait: 8.5in × 11in
            expect(screen.getByText(/8.5in × 11in/)).toBeDefined();
        });

        it('should display preset label in landscape format', () => {
            mockState.pageOrientation = 'landscape';
            render(<PageSizeControl />);
            // Letter landscape: 11in × 8.5in
            expect(screen.getByText(/11in × 8.5in/)).toBeDefined();
        });
    });
});
