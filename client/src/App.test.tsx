import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';

// Mock the lazy-loaded module before importing App
vi.mock('@/pages/ProxyBuilderPage', () => ({
    default: () => <div data-testid="proxy-builder-page">ProxyBuilderPage</div>,
}));

vi.mock('@/components/common', () => ({
    Loader: () => <div data-testid="loader">Loader</div>,
    UpdateNotification: () => <div data-testid="update-notification">Update</div>,
    AboutModal: () => <div data-testid="about-modal">AboutModal</div>,
}));

import App from './App';

// Helper to wrap App with Suspense for lazy loading
const renderApp = () => {
    return render(
        <Suspense fallback={<div>Loading...</div>}>
            <App />
        </Suspense>
    );
};

describe('App', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render the main heading for accessibility', async () => {
        renderApp();
        await waitFor(() => {
            const heading = screen.getByRole('heading', { level: 1, hidden: true });
            expect(heading).toBeDefined();
            expect(heading.textContent).toContain('Proxxied');
        });
    });

    it('should render the Loader component', async () => {
        renderApp();
        await waitFor(() => {
            expect(screen.getByTestId('loader')).toBeDefined();
        });
    });

    it('should render the UpdateNotification component', async () => {
        renderApp();
        await waitFor(() => {
            expect(screen.getByTestId('update-notification')).toBeDefined();
        });
    });

    it('should render the ProxyBuilderPage component', async () => {
        renderApp();
        await waitFor(() => {
            expect(screen.getByTestId('proxy-builder-page')).toBeDefined();
        });
    });

    it('should have sr-only class on heading for screen readers', async () => {
        renderApp();
        await waitFor(() => {
            const heading = screen.getByRole('heading', { level: 1, hidden: true });
            expect(heading.className).toContain('sr-only');
        });
    });
});
