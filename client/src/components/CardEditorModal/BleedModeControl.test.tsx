import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('flowbite-react', () => ({
    Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
        <label htmlFor={htmlFor}>{children}</label>
    ),
    Radio: ({ id, name, checked, onChange }: { id?: string; name?: string; checked: boolean; onChange: () => void }) => (
        <input type="radio" id={id} name={name} checked={checked} onChange={onChange} data-testid={id} />
    ),
}));

vi.mock('./SmartBleedInput', () => ({
    SmartBleedInput: ({ valueMm, onChangeMm }: { valueMm: number; onChangeMm: (v: number) => void }) => (
        <input type="number" data-testid="smart-bleed-input" value={valueMm} onChange={(e) => onChangeMm(parseFloat(e.target.value))} />
    ),
}));

import { BleedModeControl } from './BleedModeControl';

describe('BleedModeControl', () => {
    const defaultProps = {
        idPrefix: 'test',
        groupName: 'testGroup',
        mode: 'global' as const,
        onModeChange: vi.fn(),
        amount: 3,
        onAmountChange: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('rendering', () => {
        it('should render default option with custom label', () => {
            render(<BleedModeControl {...defaultProps} defaultLabel="Custom Default Label" />);
            expect(screen.getByText('Custom Default Label')).toBeDefined();
        });

        it('should render default option with fallback label', () => {
            render(<BleedModeControl {...defaultProps} />);
            expect(screen.getByText('Use Global Bleed Width')).toBeDefined();
        });

        it('should render manual/override option', () => {
            render(<BleedModeControl {...defaultProps} />);
            expect(screen.getByText('Override')).toBeDefined();
        });

        it('should render none option by default', () => {
            render(<BleedModeControl {...defaultProps} />);
            expect(screen.getByText('No Bleed')).toBeDefined();
        });

        it('should not render none option when showNone is false', () => {
            render(<BleedModeControl {...defaultProps} showNone={false} />);
            expect(screen.queryByText('No Bleed')).toBeNull();
        });

        it('should render custom none label', () => {
            render(<BleedModeControl {...defaultProps} noneLabel="Custom None" />);
            expect(screen.getByText('Custom None')).toBeDefined();
        });
    });

    describe('mode selection', () => {
        it('should check default radio when mode is global', () => {
            render(<BleedModeControl {...defaultProps} mode="global" />);
            const radio = screen.getByTestId('test-default') as HTMLInputElement;
            expect(radio.checked).toBe(true);
        });

        it('should check manual radio when mode is manual', () => {
            render(<BleedModeControl {...defaultProps} mode="manual" />);
            const radio = screen.getByTestId('test-manual') as HTMLInputElement;
            expect(radio.checked).toBe(true);
        });

        it('should check none radio when mode is none', () => {
            render(<BleedModeControl {...defaultProps} mode="none" />);
            const radio = screen.getByTestId('test-none') as HTMLInputElement;
            expect(radio.checked).toBe(true);
        });

        it('should call onModeChange with global when default clicked', () => {
            render(<BleedModeControl {...defaultProps} mode="manual" />);
            fireEvent.click(screen.getByTestId('test-default'));
            expect(defaultProps.onModeChange).toHaveBeenCalledWith('global');
        });

        it('should call onModeChange with manual when override clicked', () => {
            render(<BleedModeControl {...defaultProps} mode="global" />);
            fireEvent.click(screen.getByTestId('test-manual'));
            expect(defaultProps.onModeChange).toHaveBeenCalledWith('manual');
        });

        it('should call onModeChange with none when none clicked', () => {
            render(<BleedModeControl {...defaultProps} mode="global" />);
            fireEvent.click(screen.getByTestId('test-none'));
            expect(defaultProps.onModeChange).toHaveBeenCalledWith('none');
        });
    });

    describe('smart bleed input', () => {
        it('should show SmartBleedInput when mode is manual', () => {
            render(<BleedModeControl {...defaultProps} mode="manual" />);
            expect(screen.getByTestId('smart-bleed-input')).toBeDefined();
        });

        it('should not show SmartBleedInput when mode is global', () => {
            render(<BleedModeControl {...defaultProps} mode="global" />);
            expect(screen.queryByTestId('smart-bleed-input')).toBeNull();
        });

        it('should not show SmartBleedInput when mode is none', () => {
            render(<BleedModeControl {...defaultProps} mode="none" />);
            expect(screen.queryByTestId('smart-bleed-input')).toBeNull();
        });

        it('should call onAmountChange when input changes', () => {
            render(<BleedModeControl {...defaultProps} mode="manual" />);
            const input = screen.getByTestId('smart-bleed-input');
            fireEvent.change(input, { target: { value: '5' } });
            expect(defaultProps.onAmountChange).toHaveBeenCalledWith(5);
        });
    });

    describe('custom mode values', () => {
        it('should use custom valueDefault', () => {
            const onModeChange = vi.fn();
            render(<BleedModeControl {...defaultProps} valueDefault="customDefault" mode="customDefault" onModeChange={onModeChange} />);
            const radio = screen.getByTestId('test-default') as HTMLInputElement;
            expect(radio.checked).toBe(true);
        });

        it('should use custom valueManual', () => {
            const onModeChange = vi.fn();
            render(<BleedModeControl {...defaultProps} valueManual="customManual" mode="customManual" onModeChange={onModeChange} />);
            const radio = screen.getByTestId('test-manual') as HTMLInputElement;
            expect(radio.checked).toBe(true);
        });

        it('should use custom valueNone', () => {
            const onModeChange = vi.fn();
            render(<BleedModeControl {...defaultProps} valueNone="customNone" mode="customNone" onModeChange={onModeChange} />);
            const radio = screen.getByTestId('test-none') as HTMLInputElement;
            expect(radio.checked).toBe(true);
        });
    });
});
