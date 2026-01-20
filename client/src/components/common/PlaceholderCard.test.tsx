import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlaceholderCard } from './PlaceholderCard';

describe('PlaceholderCard', () => {
    describe('loading state', () => {
        it('should render loading spinner when no error is provided', () => {
            const { container } = render(<PlaceholderCard />);

            // Should have the spinning loader
            const spinner = container.querySelector('.animate-spin');
            expect(spinner).not.toBeNull();
        });

        it('should not be clickable in loading state', () => {
            const { container } = render(<PlaceholderCard />);

            // Should have pointer-events-none class
            const card = container.firstChild as HTMLElement;
            expect(card.className).toContain('pointer-events-none');
        });
    });

    describe('error state', () => {
        it('should render error message when error is provided', () => {
            render(<PlaceholderCard name="Lightning Bolt" error="Card not found" />);

            // Should show the card name
            expect(screen.getByText(/Lightning Bolt/)).toBeDefined();

            // Should show "not found" message
            expect(screen.getByText('not found')).toBeDefined();

            // Should show "Click to replace" button
            expect(screen.getByText('Click to replace')).toBeDefined();
        });

        it('should be clickable in error state', () => {
            const { container } = render(
                <PlaceholderCard name="Test Card" error="Card not found" />
            );

            // Should have pointer-events-auto class
            const card = container.firstChild as HTMLElement;
            expect(card.className).toContain('pointer-events-auto');
        });

        it('should call onErrorClick when clicked in error state', () => {
            const mockOnClick = vi.fn();
            const { container } = render(
                <PlaceholderCard
                    name="Test Card"
                    error="Card not found"
                    onErrorClick={mockOnClick}
                />
            );

            const card = container.firstChild as HTMLElement;
            fireEvent.click(card);

            expect(mockOnClick).toHaveBeenCalledTimes(1);
        });

        it('should not crash if onErrorClick is not provided', () => {
            const { container } = render(
                <PlaceholderCard name="Test Card" error="Card not found" />
            );

            const card = container.firstChild as HTMLElement;
            // Should not throw when clicked
            expect(() => fireEvent.click(card)).not.toThrow();
        });
    });

    describe('styling', () => {
        it('should apply custom className', () => {
            const { container } = render(
                <PlaceholderCard className="custom-class" />
            );

            const card = container.firstChild as HTMLElement;
            expect(card.className).toContain('custom-class');
        });

        it('should always have black background', () => {
            const { container } = render(<PlaceholderCard />);

            const card = container.firstChild as HTMLElement;
            expect(card.className).toContain('bg-black');
        });
    });
});
