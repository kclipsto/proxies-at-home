import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { StyledSlider } from './StyledSlider';

describe('StyledSlider', () => {
    const defaultProps = {
        label: 'Test Label',
        value: 50,
        onChange: vi.fn(),
        min: 0,
        max: 100,
        defaultValue: 50,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('rendering', () => {
        it('should render label', () => {
            render(<StyledSlider {...defaultProps} />);
            expect(screen.getByText('Test Label')).toBeDefined();
        });

        it('should render slider input', () => {
            render(<StyledSlider {...defaultProps} />);
            const slider = screen.getByRole('slider');
            expect(slider).toBeDefined();
            expect(slider.getAttribute('min')).toBe('0');
            expect(slider.getAttribute('max')).toBe('100');
        });

        it('should render text input with value', () => {
            render(<StyledSlider {...defaultProps} />);
            const input = screen.getByRole('textbox') as HTMLInputElement;
            expect(input.value).toBe('50');
        });

        it('should render displayValue if provided', () => {
            render(<StyledSlider {...defaultProps} displayValue="50 px" />);
            const input = screen.getByRole('textbox') as HTMLInputElement;
            expect(input.value).toBe('50 px');
        });
    });

    describe('interaction', () => {
        it('should call onChange when slider moves', () => {
            render(<StyledSlider {...defaultProps} />);
            const slider = screen.getByRole('slider');
            fireEvent.change(slider, { target: { value: '75' } });
            expect(defaultProps.onChange).toHaveBeenCalledWith(75);
        });

        it('should call onChange with default value on double click', () => {
            render(<StyledSlider {...defaultProps} />);
            const slider = screen.getByRole('slider');
            fireEvent.doubleClick(slider);
            expect(defaultProps.onChange).toHaveBeenCalledWith(50);
        });

        it('should not throw on double click without defaultValue', () => {
            const propsNoDefault = { ...defaultProps, defaultValue: undefined };
            render(<StyledSlider {...propsNoDefault} />);
            const slider = screen.getByRole('slider');
            fireEvent.doubleClick(slider);
            expect(defaultProps.onChange).not.toHaveBeenCalled();
        });
    });

    describe('text input editing', () => {
        it('should update local input value while typing', () => {
            render(<StyledSlider {...defaultProps} />);
            const input = screen.getByRole('textbox') as HTMLInputElement;

            fireEvent.change(input, { target: { value: '60' } });
            expect(input.value).toBe('60');
            // Shouldn't trigger onChange yet
            expect(defaultProps.onChange).not.toHaveBeenCalled();
        });

        it('should commit value on blur', () => {
            render(<StyledSlider {...defaultProps} />);
            const input = screen.getByRole('textbox');

            fireEvent.focus(input);
            fireEvent.change(input, { target: { value: '60' } });
            fireEvent.blur(input);

            expect(defaultProps.onChange).toHaveBeenCalledWith(60);
        });

        it('should commit value on Enter key', () => {
            render(<StyledSlider {...defaultProps} />);
            const input = screen.getByRole('textbox');

            fireEvent.focus(input);
            fireEvent.change(input, { target: { value: '70' } });
            fireEvent.keyDown(input, { key: 'Enter' });

            expect(defaultProps.onChange).toHaveBeenCalledWith(70);
        });

        it('should cancel editing on Escape key', () => {
            render(<StyledSlider {...defaultProps} value={50} />);
            const input = screen.getByRole('textbox') as HTMLInputElement;

            fireEvent.focus(input);
            fireEvent.change(input, { target: { value: '999' } });
            fireEvent.keyDown(input, { key: 'Escape' });

            // Should reset to original value
            expect(input.value).toBe('50');
            expect(defaultProps.onChange).not.toHaveBeenCalled();
        });

        it('should handle display modifiers (px, %)', () => {
            render(<StyledSlider {...defaultProps} displayMultiplier={1} />);
            const input = screen.getByRole('textbox');

            fireEvent.focus(input);
            fireEvent.change(input, { target: { value: '60px' } });
            fireEvent.blur(input);

            expect(defaultProps.onChange).toHaveBeenCalledWith(60);
        });

        it('should apply displayMultiplier', () => {
            render(<StyledSlider {...defaultProps} displayMultiplier={100} />);
            const input = screen.getByRole('textbox');

            fireEvent.focus(input);
            fireEvent.change(input, { target: { value: '50' } }); // Entered "50" meaning 50%
            fireEvent.blur(input);

            // Should commit 0.5 (50 / 100)
            expect(defaultProps.onChange).toHaveBeenCalledWith(0.5);
        });

        it('should clamp values to min/max', () => {
            render(<StyledSlider {...defaultProps} min={0} max={100} />);
            const input = screen.getByRole('textbox');

            fireEvent.focus(input);
            fireEvent.change(input, { target: { value: '200' } });
            fireEvent.blur(input);

            expect(defaultProps.onChange).toHaveBeenCalledWith(100);

            fireEvent.focus(input);
            fireEvent.change(input, { target: { value: '-50' } });
            fireEvent.blur(input);

            expect(defaultProps.onChange).toHaveBeenCalledWith(0);
        });

        it('should ignore invalid inputs', () => {
            render(<StyledSlider {...defaultProps} />);
            const input = screen.getByRole('textbox');

            fireEvent.focus(input);
            fireEvent.change(input, { target: { value: 'abc' } });
            fireEvent.blur(input);

            expect(defaultProps.onChange).not.toHaveBeenCalled();
        });
    });
});
