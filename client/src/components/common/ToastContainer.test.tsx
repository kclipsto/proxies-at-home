import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// Mock the toast store
const mockToasts: Array<{ id: string; message: string; type: string; dismissible: boolean }> = [];

vi.mock('@/store/toast', () => ({
    useToastStore: vi.fn((selector) => {
        const state = {
            toasts: mockToasts,
            removeToast: vi.fn(),
        };
        return selector(state);
    }),
}));

import { ToastContainer } from './ToastContainer';

describe('ToastContainer', () => {
    it('should render nothing when there are no toasts', () => {
        const { container } = render(<ToastContainer />);
        expect(container.firstChild).toBeNull();
    });
});
