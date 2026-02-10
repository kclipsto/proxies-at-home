import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

vi.mock('flowbite-react', () => ({
    TextInput: React.forwardRef(({ type, min, max, step, onChange, className, ...props }: { type?: string; min?: number; max?: number; step?: number; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; className?: string }, ref: React.Ref<HTMLInputElement>) => (
        <input ref={ref} type={type} min={min} max={max} step={step} onChange={onChange} className={className} data-testid="text-input" {...props} />
    )),
}));

vi.mock('lucide-react', () => ({
    ChevronUp: ({ className }: { className?: string }) => <span data-testid="chevron-up" className={className}>▲</span>,
    ChevronDown: ({ className }: { className?: string }) => <span data-testid="chevron-down" className={className}>▼</span>,
}));

import { NumberInput } from './NumberInput';

describe('NumberInput', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    describe('rendering', () => {
        it('should render input element', () => {
            render(<NumberInput />);
            expect(screen.getByTestId('text-input')).toBeDefined();
        });

        it('should render increment button', () => {
            render(<NumberInput />);
            expect(screen.getByTestId('chevron-up')).toBeDefined();
        });

        it('should render decrement button', () => {
            render(<NumberInput />);
            expect(screen.getByTestId('chevron-down')).toBeDefined();
        });

        it('should apply className', () => {
            const { container } = render(<NumberInput className="custom-class" />);
            expect((container.firstChild as HTMLElement)?.className).toContain('custom-class');
        });
    });

    describe('value handling', () => {
        it('should pass value prop to input', () => {
            render(<NumberInput value={5} readOnly />);
            const input = screen.getByTestId('text-input') as HTMLInputElement;
            expect(input.value).toBe('5');
        });

        it('should call onChange when input changes', () => {
            const onChange = vi.fn();
            render(<NumberInput onChange={onChange} />);

            const input = screen.getByTestId('text-input');
            fireEvent.change(input, { target: { value: '10' } });

            expect(onChange).toHaveBeenCalled();
        });
    });

    describe('increment/decrement buttons', () => {
        it('should increment value on up button mousedown', async () => {
            const onChange = vi.fn();
            render(<NumberInput value={5} step={1} onChange={onChange} />);

            const upButton = screen.getByTestId('chevron-up').parentElement!;
            fireEvent.mouseDown(upButton);
            fireEvent.mouseUp(upButton);

            expect(onChange).toHaveBeenCalled();
        });

        it('should decrement value on down button mousedown', async () => {
            const onChange = vi.fn();
            render(<NumberInput value={5} step={1} onChange={onChange} />);

            const downButton = screen.getByTestId('chevron-down').parentElement!;
            fireEvent.mouseDown(downButton);
            fireEvent.mouseUp(downButton);

            expect(onChange).toHaveBeenCalled();
        });

        it('should respect min boundary', () => {
            const onChange = vi.fn();
            render(<NumberInput value={0} min={0} step={1} onChange={onChange} />);

            const downButton = screen.getByTestId('chevron-down').parentElement!;
            fireEvent.mouseDown(downButton);
            fireEvent.mouseUp(downButton);

            // Should not call onChange since we're at min
            expect(onChange).not.toHaveBeenCalled();
        });

        it('should respect max boundary', () => {
            const onChange = vi.fn();
            render(<NumberInput value={10} max={10} step={1} onChange={onChange} />);

            const upButton = screen.getByTestId('chevron-up').parentElement!;
            fireEvent.mouseDown(upButton);
            fireEvent.mouseUp(upButton);

            // Should not call onChange since we're at max
            expect(onChange).not.toHaveBeenCalled();
        });

        it('should handle touch events', () => {
            const onChange = vi.fn();
            render(<NumberInput value={5} step={1} onChange={onChange} />);

            const upButton = screen.getByTestId('chevron-up').parentElement!;
            fireEvent.touchStart(upButton);
            fireEvent.touchEnd(upButton);

            expect(onChange).toHaveBeenCalled();
        });
    });

    describe('spin behavior', () => {
        it('should continue spinning on long press', async () => {
            const onChange = vi.fn();
            render(<NumberInput value={5} step={1} onChange={onChange} />);

            const upButton = screen.getByTestId('chevron-up').parentElement!;

            fireEvent.mouseDown(upButton);

            // Initial call
            expect(onChange).toHaveBeenCalledTimes(1);

            // Advance past delay (800ms)
            act(() => {
                vi.advanceTimersByTime(850);
            });

            // Should have started interval
            act(() => {
                vi.advanceTimersByTime(100);
            });

            expect(onChange.mock.calls.length).toBeGreaterThan(1);

            fireEvent.mouseUp(upButton);
        });

        it('should stop spinning on mouseLeave', () => {
            const onChange = vi.fn();
            render(<NumberInput value={5} step={1} onChange={onChange} />);

            const upButton = screen.getByTestId('chevron-up').parentElement!;

            fireEvent.mouseDown(upButton);
            fireEvent.mouseLeave(upButton);

            act(() => {
                vi.advanceTimersByTime(1000);
            });

            // Should not continue spinning after leave
            const callCount = onChange.mock.calls.length;

            act(() => {
                vi.advanceTimersByTime(500);
            });

            expect(onChange.mock.calls.length).toBe(callCount);
        });
    });
});
