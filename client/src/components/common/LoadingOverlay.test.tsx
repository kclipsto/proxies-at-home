import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoadingOverlay from './LoadingOverlay';

describe('LoadingOverlay', () => {
    it('should render task text', () => {
        render(
            <LoadingOverlay
                task="Loading cards..."
                progress={50}
                onCancel={null}
            />
        );

        expect(screen.getByText('Loading cards...')).toBeDefined();
    });

    it('should show progress percentage', () => {
        render(
            <LoadingOverlay
                task="Processing"
                progress={75}
                onCancel={null}
            />
        );

        expect(screen.getByText('75%')).toBeDefined();
    });

    it('should show sheen animation when progress is negative', () => {
        const { container } = render(
            <LoadingOverlay
                task="Processing"
                progress={-1}
                onCancel={null}
            />
        );

        const sheenElement = container.querySelector('.animate-sheen');
        expect(sheenElement).toBeDefined();
    });

    it('should show cancel button when onCancel is provided', () => {
        const onCancel = vi.fn();
        render(
            <LoadingOverlay
                task="Processing"
                progress={50}
                onCancel={onCancel}
            />
        );

        expect(screen.getByText('Cancel')).toBeDefined();
    });

    it('should not show cancel button when onCancel is null', () => {
        render(
            <LoadingOverlay
                task="Processing"
                progress={50}
                onCancel={null}
            />
        );

        expect(screen.queryByText('Cancel')).toBeNull();
    });
});

