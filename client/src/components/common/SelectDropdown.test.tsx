import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectDropdown } from './SelectDropdown';

describe('SelectDropdown', () => {
    const defaultProps = {
        buttonText: 'Any',
        isOpen: false,
        onToggle: vi.fn(),
        onClose: vi.fn(),
    };

    it('should render with buttonText', () => {
        render(
            <SelectDropdown {...defaultProps}>
                <button>Option 1</button>
            </SelectDropdown>
        );

        expect(screen.getByText('Any')).toBeDefined();
    });

    it('should render label when provided', () => {
        render(
            <SelectDropdown {...defaultProps} label="Test Label">
                <button>Option 1</button>
            </SelectDropdown>
        );

        expect(screen.getByText('Test Label')).toBeDefined();
    });

    it('should call onToggle when button is clicked', () => {
        const onToggle = vi.fn();
        render(
            <SelectDropdown {...defaultProps} onToggle={onToggle}>
                <button>Option 1</button>
            </SelectDropdown>
        );

        const button = screen.getByRole('button', { name: /Any/i });
        fireEvent.click(button);

        expect(onToggle).toHaveBeenCalled();
    });

    it('should render children when open', () => {
        render(
            <SelectDropdown {...defaultProps} isOpen={true}>
                <button>Option 1</button>
                <button>Option 2</button>
            </SelectDropdown>
        );

        expect(screen.getByText('Option 1')).toBeDefined();
        expect(screen.getByText('Option 2')).toBeDefined();
    });

    it('should show selectedLabel in singleSelectMode', () => {
        render(
            <SelectDropdown
                {...defaultProps}
                singleSelectMode
                selectedLabel="Selected Option"
            >
                <button>Option 1</button>
            </SelectDropdown>
        );

        expect(screen.getByText('Selected Option')).toBeDefined();
    });

    it('should show selectedCount with check icon in multi-select mode', () => {
        render(
            <SelectDropdown {...defaultProps} selectedCount={3}>
                <button>Option 1</button>
            </SelectDropdown>
        );

        expect(screen.getByText('3')).toBeDefined();
    });

    it('should close dropdown when clicking outside', () => {
        const onClose = vi.fn();
        render(
            <div>
                <div data-testid="outside">Outside</div>
                <SelectDropdown {...defaultProps} isOpen={true} onClose={onClose}>
                    <button>Option 1</button>
                </SelectDropdown>
            </div>
        );

        fireEvent.mouseDown(screen.getByTestId('outside'));

        expect(onClose).toHaveBeenCalled();
    });

    it('should render favorites star button when favorites provided', () => {
        const favorites = {
            values: ['fav1', 'fav2'],
            isSelected: () => false,
            onToggle: vi.fn(),
        };

        render(
            <SelectDropdown {...defaultProps} favorites={favorites}>
                <button>Option 1</button>
            </SelectDropdown>
        );

        expect(screen.getByTitle('Select favorites')).toBeDefined();
    });

    it('should not render favorites star when disableFavorites is true', () => {
        const favorites = {
            values: ['fav1', 'fav2'],
            isSelected: () => false,
            onToggle: vi.fn(),
        };

        render(
            <SelectDropdown {...defaultProps} favorites={favorites} disableFavorites>
                <button>Option 1</button>
            </SelectDropdown>
        );

        expect(screen.queryByTitle('Select favorites')).toBeNull();
    });
});
