import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Store mock state
const mockState = vi.hoisted(() => ({
    loadingTask: null as string | null,
    progress: 0,
    onCancel: null as (() => void) | null,
}));

// Mock the loading store
vi.mock('@/store', () => ({
    useLoadingStore: vi.fn((selector) => {
        return selector(mockState);
    }),
}));

vi.mock('./LoadingOverlay', () => ({
    default: ({ task, progress }: { task: string; progress: number }) => (
        <div data-testid="loading-overlay">{task} - {progress}%</div>
    ),
}));

import { Loader } from './Loader';

describe('Loader', () => {
    beforeEach(() => {
        mockState.loadingTask = null;
        mockState.progress = 0;
        mockState.onCancel = null;
    });

    it('should render nothing when loadingTask is null', () => {
        mockState.loadingTask = null;
        const { container } = render(<Loader />);
        expect(container.firstChild).toBeNull();
    });

    it('should render LoadingOverlay when loadingTask is defined', () => {
        mockState.loadingTask = 'Loading cards...';
        mockState.progress = 50;
        render(<Loader />);
        expect(screen.getByTestId('loading-overlay')).toBeDefined();
        expect(screen.getByText('Loading cards... - 50%')).toBeDefined();
    });
});
