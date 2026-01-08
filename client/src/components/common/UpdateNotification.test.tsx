import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// Store the callback for testing
let updateStatusCallback: ((status: string, info?: unknown) => void) | null = null;

// Mock window.electronAPI
const mockElectronAPI = {
    onUpdateStatus: vi.fn((callback) => {
        updateStatusCallback = callback;
    }),
    installUpdate: vi.fn(),
};

vi.mock('flowbite-react', () => ({
    Toast: ({ children }: { children: React.ReactNode }) => <div data-testid="toast">{children}</div>,
    Button: ({ children, onClick, size, color, className }: { children: React.ReactNode; onClick?: () => void; size?: string; color?: string; className?: string }) => (
        <button onClick={onClick} data-size={size} data-color={color} className={className}>{children}</button>
    ),
}));

vi.mock('lucide-react', () => ({
    Download: () => <span data-testid="download-icon">⬇</span>,
    AlertCircle: () => <span data-testid="alert-icon">⚠</span>,
    CheckCircle: () => <span data-testid="check-icon">✓</span>,
    X: () => <span data-testid="close-icon">✕</span>,
}));

import { UpdateNotification } from './UpdateNotification';

describe('UpdateNotification', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        updateStatusCallback = null;
        // @ts-expect-error - mocking window.electronAPI
        window.electronAPI = mockElectronAPI;
    });

    afterEach(() => {
        delete window.electronAPI;
    });

    describe('when electronAPI is not available', () => {
        it('should return null', () => {
            delete window.electronAPI;
            const { container } = render(<UpdateNotification />);
            expect(container.innerHTML).toBe('');
        });
    });

    describe('when electronAPI is available', () => {
        it('should register update status listener on mount', () => {
            render(<UpdateNotification />);
            expect(mockElectronAPI.onUpdateStatus).toHaveBeenCalled();
        });

        it('should not show anything initially', () => {
            const { container } = render(<UpdateNotification />);
            expect(container.querySelector('[data-testid="toast"]')).toBeNull();
        });
    });

    describe('update available status', () => {
        it('should show downloading message', () => {
            render(<UpdateNotification />);
            act(() => {
                updateStatusCallback?.('available');
            });
            expect(screen.getByText('Update available! Downloading...')).toBeDefined();
            expect(screen.getByTestId('download-icon')).toBeDefined();
        });
    });

    describe('update downloaded status', () => {
        it('should show update downloaded message with install button', () => {
            render(<UpdateNotification />);
            act(() => {
                updateStatusCallback?.('downloaded');
            });
            expect(screen.getByText('Update downloaded and ready to install.')).toBeDefined();
            expect(screen.getByTestId('check-icon')).toBeDefined();
            expect(screen.getByText('Restart & Install')).toBeDefined();
        });

        it('should call installUpdate when install button clicked', () => {
            render(<UpdateNotification />);
            act(() => {
                updateStatusCallback?.('downloaded');
            });
            fireEvent.click(screen.getByText('Restart & Install'));
            expect(mockElectronAPI.installUpdate).toHaveBeenCalled();
        });
    });

    describe('update error status', () => {
        it('should show error message with string info', () => {
            render(<UpdateNotification />);
            act(() => {
                updateStatusCallback?.('error', 'Network error');
            });
            expect(screen.getByText('Update failed: Network error')).toBeDefined();
            expect(screen.getByTestId('alert-icon')).toBeDefined();
        });

        it('should show unknown error when info is not a string', () => {
            render(<UpdateNotification />);
            act(() => {
                updateStatusCallback?.('error', { code: 500 });
            });
            expect(screen.getByText('Update failed: Unknown error')).toBeDefined();
        });
    });

    describe('close button', () => {
        it('should hide toast when close button clicked', () => {
            render(<UpdateNotification />);
            act(() => {
                updateStatusCallback?.('available');
            });
            // Verify toast is visible
            expect(screen.getByText('Update available! Downloading...')).toBeDefined();

            // Find and click the close button (uses X icon from lucide-react)
            const closeIcon = screen.getByTestId('close-icon');
            const closeButton = closeIcon.parentElement;
            if (closeButton) {
                fireEvent.click(closeButton);
            }

            expect(screen.queryByText('Update available! Downloading...')).toBeNull();
        });
    });

    describe('status transitions', () => {
        it('should not show toast for checking status', () => {
            render(<UpdateNotification />);
            act(() => {
                updateStatusCallback?.('checking');
            });
            expect(screen.queryByTestId('toast')).toBeNull();
        });

        it('should not show toast for not-available status', () => {
            render(<UpdateNotification />);
            act(() => {
                updateStatusCallback?.('not-available');
            });
            expect(screen.queryByTestId('toast')).toBeNull();
        });
    });
});
