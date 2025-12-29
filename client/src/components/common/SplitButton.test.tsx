import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SplitButton } from './SplitButton';

describe('SplitButton', () => {
    const mockOptions = [
        { value: 'mode1' as const, label: 'Mode 1', description: 'First mode' },
        { value: 'mode2' as const, label: 'Mode 2', description: 'Second mode' },
    ];

    it('should render with label', () => {
        const onClick = vi.fn();
        const onToggle = vi.fn();
        const onClose = vi.fn();
        const onSelect = vi.fn();

        render(
            <SplitButton
                label="Test Button"
                color="blue"
                onClick={onClick}
                isOpen={false}
                onToggle={onToggle}
                onClose={onClose}
                options={mockOptions}
                value="mode1"
                onSelect={onSelect}
            />
        );

        expect(screen.getByText('Test Button')).toBeDefined();
    });

    it('should render with sublabel', () => {
        render(
            <SplitButton
                label="Test Button"
                sublabel="Current Mode"
                color="blue"
                onClick={vi.fn()}
                isOpen={false}
                onToggle={vi.fn()}
                onClose={vi.fn()}
                options={mockOptions}
                value="mode1"
                onSelect={vi.fn()}
            />
        );

        expect(screen.getByText('Current Mode')).toBeDefined();
    });

    it('should call onClick when main button is clicked', () => {
        const onClick = vi.fn();
        const onToggle = vi.fn();
        const onClose = vi.fn();
        const onSelect = vi.fn();

        render(
            <SplitButton
                label="Test Button"
                color="green"
                onClick={onClick}
                isOpen={false}
                onToggle={onToggle}
                onClose={onClose}
                options={mockOptions}
                value="mode1"
                onSelect={onSelect}
            />
        );

        const mainButton = screen.getByText('Test Button');
        fireEvent.click(mainButton);

        expect(onClick).toHaveBeenCalled();
    });

    it('should call onToggle when dropdown toggle is clicked', () => {
        const onClick = vi.fn();
        const onToggle = vi.fn();
        const onClose = vi.fn();
        const onSelect = vi.fn();

        render(
            <SplitButton
                label="Test Button"
                color="cyan"
                onClick={onClick}
                isOpen={false}
                onToggle={onToggle}
                onClose={onClose}
                options={mockOptions}
                value="mode1"
                onSelect={onSelect}
            />
        );

        const toggleButton = screen.getByLabelText('Select mode');
        fireEvent.click(toggleButton);

        expect(onToggle).toHaveBeenCalled();
    });

    it('should show options when isOpen is true', () => {
        const onClick = vi.fn();
        const onToggle = vi.fn();
        const onClose = vi.fn();
        const onSelect = vi.fn();

        render(
            <SplitButton
                label="Test Button"
                color="gray"
                onClick={onClick}
                isOpen={true}
                onToggle={onToggle}
                onClose={onClose}
                options={mockOptions}
                value="mode1"
                onSelect={onSelect}
            />
        );

        expect(screen.getByText('Mode 1')).toBeDefined();
        expect(screen.getByText('Mode 2')).toBeDefined();
    });

    it('should call onSelect and onClose when option is clicked', () => {
        const onSelect = vi.fn();
        const onClose = vi.fn();

        render(
            <SplitButton
                label="Test Button"
                color="indigo"
                onClick={vi.fn()}
                isOpen={true}
                onToggle={vi.fn()}
                onClose={onClose}
                options={mockOptions}
                value="mode1"
                onSelect={onSelect}
            />
        );

        fireEvent.click(screen.getByText('Mode 2'));

        expect(onSelect).toHaveBeenCalledWith('mode2');
        expect(onClose).toHaveBeenCalled();
    });

    it('should render as label element when asLabel is true', () => {
        render(
            <SplitButton
                label="Upload File"
                color="blue"
                onClick={vi.fn()}
                isOpen={false}
                onToggle={vi.fn()}
                onClose={vi.fn()}
                options={mockOptions}
                value="mode1"
                onSelect={vi.fn()}
                asLabel={true}
                htmlFor="file-input"
            />
        );

        const labelElement = screen.getByText('Upload File').closest('label');
        expect(labelElement).toBeDefined();
        expect(labelElement?.getAttribute('for')).toBe('file-input');
    });

    it('should apply disabled styling when disabled', () => {
        render(
            <SplitButton
                label="Disabled Button"
                color="green"
                disabled={true}
                onClick={vi.fn()}
                isOpen={false}
                onToggle={vi.fn()}
                onClose={vi.fn()}
                options={mockOptions}
                value="mode1"
                onSelect={vi.fn()}
            />
        );

        const button = screen.getByText('Disabled Button').closest('button');
        expect(button?.hasAttribute('disabled')).toBe(true);
    });

    it('should use sm labelSize when specified', () => {
        render(
            <SplitButton
                label="Small Label"
                color="blue"
                onClick={vi.fn()}
                isOpen={false}
                onToggle={vi.fn()}
                onClose={vi.fn()}
                options={mockOptions}
                value="mode1"
                onSelect={vi.fn()}
                labelSize="sm"
            />
        );

        const labelSpan = screen.getByText('Small Label');
        expect(labelSpan.className).toContain('text-sm');
    });
    it('should call onClose when clicking outside', () => {
        const onClose = vi.fn();
        render(
            <SplitButton
                label="Test Button"
                color="blue"
                onClick={vi.fn()}
                isOpen={true}
                onToggle={vi.fn()}
                onClose={onClose}
                options={mockOptions}
                value="mode1"
                onSelect={vi.fn()}
            />
        );

        fireEvent.mouseDown(document.body);
        expect(onClose).toHaveBeenCalled();
    });
});

