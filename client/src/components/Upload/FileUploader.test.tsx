import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock dependencies
vi.mock('@/helpers/mpc', () => ({
    inferCardNameFromFilename: vi.fn((name) => name),
}));

vi.mock('@/helpers/ImportOrchestrator', () => ({
    ImportOrchestrator: {
        process: vi.fn(),
    },
}));

vi.mock('@/helpers/dbUtils', () => ({
    addCustomImage: vi.fn(),
}));

vi.mock('@/store/loading', () => ({
    useLoadingStore: () => ({
        setLoading: vi.fn(),
        setProgress: vi.fn(),
        clearLoading: vi.fn(),
    }),
}));

vi.mock('@/store/toast', () => ({
    useToastStore: () => ({
        addSuccessToast: vi.fn(),
    }),
}));

vi.mock('@/db', () => ({
    db: {
        cards: {
            toArray: vi.fn().mockResolvedValue([]),
        },
    },
}));

import { FileUploader } from './FileUploader';

describe('FileUploader', () => {
    it('should render upload button', () => {
        render(<FileUploader />);

        // Multiple elements with "Upload Images" - verify at least one exists
        const elements = screen.getAllByText('Upload Images');
        expect(elements.length).toBeGreaterThan(0);
    });

    it('should render upload mode sublabel', () => {
        render(<FileUploader />);

        // Should show the current mode label
        expect(screen.getByText('Auto Detect Bleed')).toBeDefined();
    });
});
