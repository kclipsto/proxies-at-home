import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ManaIcon } from './ManaIcon';

describe('ManaIcon', () => {
    describe('rendering', () => {
        it('should render W (white) mana icon', () => {
            const { container } = render(<ManaIcon symbol="W" />);
            const svg = container.querySelector('svg');
            expect(svg).toBeDefined();
            expect(svg?.getAttribute('width')).toBe('24');
        });

        it('should render U (blue) mana icon', () => {
            const { container } = render(<ManaIcon symbol="U" />);
            expect(container.querySelector('svg')).toBeDefined();
        });

        it('should render B (black) mana icon', () => {
            const { container } = render(<ManaIcon symbol="B" />);
            expect(container.querySelector('svg')).toBeDefined();
        });

        it('should render R (red) mana icon', () => {
            const { container } = render(<ManaIcon symbol="R" />);
            expect(container.querySelector('svg')).toBeDefined();
        });

        it('should render G (green) mana icon', () => {
            const { container } = render(<ManaIcon symbol="G" />);
            expect(container.querySelector('svg')).toBeDefined();
        });

        it('should render C (colorless) mana icon', () => {
            const { container } = render(<ManaIcon symbol="C" />);
            expect(container.querySelector('svg')).toBeDefined();
        });

        it('should render M (multicolor) mana icon with gradient', () => {
            const { container } = render(<ManaIcon symbol="M" />);
            const svg = container.querySelector('svg');
            expect(svg).toBeDefined();
            // M should have a linearGradient definition
            expect(svg?.querySelector('linearGradient')).toBeDefined();
        });
    });

    describe('size prop', () => {
        it('should use default size of 24', () => {
            const { container } = render(<ManaIcon symbol="W" />);
            const svg = container.querySelector('svg');
            expect(svg?.getAttribute('width')).toBe('24');
            expect(svg?.getAttribute('height')).toBe('24');
        });

        it('should accept custom size', () => {
            const { container } = render(<ManaIcon symbol="W" size={32} />);
            const svg = container.querySelector('svg');
            expect(svg?.getAttribute('width')).toBe('32');
            expect(svg?.getAttribute('height')).toBe('32');
        });
    });

    describe('className prop', () => {
        it('should apply custom className', () => {
            const { container } = render(<ManaIcon symbol="W" className="custom-class" />);
            const svg = container.querySelector('svg');
            expect(svg?.className.baseVal).toContain('custom-class');
        });
    });

    describe('SVG structure', () => {
        it('should have correct viewBox', () => {
            const { container } = render(<ManaIcon symbol="W" />);
            const svg = container.querySelector('svg');
            expect(svg?.getAttribute('viewBox')).toBe('0 0 100 100');
        });

        it('should have circle background', () => {
            const { container } = render(<ManaIcon symbol="W" />);
            const circle = container.querySelector('circle');
            expect(circle).toBeDefined();
            expect(circle?.getAttribute('cx')).toBe('50');
            expect(circle?.getAttribute('cy')).toBe('50');
            expect(circle?.getAttribute('r')).toBe('50');
        });

        it('should have path elements for icon', () => {
            const { container } = render(<ManaIcon symbol="W" />);
            const paths = container.querySelectorAll('path');
            expect(paths.length).toBeGreaterThan(0);
        });
    });

    describe('invalid symbol', () => {
        it('should return null for unknown symbol', () => {
            // @ts-expect-error Testing invalid symbol
            const { container } = render(<ManaIcon symbol="X" />);
            expect(container.innerHTML).toBe('');
        });
    });
});
