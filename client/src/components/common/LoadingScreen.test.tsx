import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingScreen } from './LoadingScreen';

describe('LoadingScreen', () => {
    const originalMatchMedia = window.matchMedia;

    beforeEach(() => {
        // Default to light mode
        window.matchMedia = vi.fn().mockImplementation((query) => ({
            matches: false,
            media: query,
        }));
    });

    afterEach(() => {
        window.matchMedia = originalMatchMedia;
    });

    it('should render logo image', () => {
        render(<LoadingScreen />);
        const img = screen.getByAltText('Loading...');
        expect(img).toBeDefined();
    });

    it('should render spinning border element', () => {
        const { container } = render(<LoadingScreen />);
        const spinner = container.querySelector('.animate-spin');
        expect(spinner).not.toBeNull();
    });

    it('should use light background when not in dark mode', () => {
        window.matchMedia = vi.fn().mockImplementation((query) => ({
            matches: false,
            media: query,
        }));
        const { container } = render(<LoadingScreen />);
        const bgDiv = container.firstChild as HTMLElement;
        expect(bgDiv.style.backgroundColor).toBe('rgb(249, 250, 251)');
    });

    it('should use dark background when in dark mode', () => {
        window.matchMedia = vi.fn().mockImplementation((query) => ({
            matches: query === '(prefers-color-scheme: dark)',
            media: query,
        }));
        const { container } = render(<LoadingScreen />);
        const bgDiv = container.firstChild as HTMLElement;
        expect(bgDiv.style.backgroundColor).toBe('rgb(17, 24, 39)');
    });
});

