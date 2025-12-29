import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock dependencies
vi.mock('@/helpers/mpc', () => ({
    processMpcImport: vi.fn().mockResolvedValue({ success: true, count: 0 }),
}));

vi.mock('@/store/settings', () => ({
    useSettingsStore: {
        getState: vi.fn(() => ({
            setSortBy: vi.fn(),
        })),
    },
}));

import { MpcImportSection } from './MpcImportSection';

describe('MpcImportSection', () => {
    it('should render import button', () => {
        render(<MpcImportSection />);
        const button = screen.getByText('Import MPC XML');
        expect(button).toBeDefined();
    });

    it('should render hidden file input', () => {
        render(<MpcImportSection />);
        const input = document.getElementById('import-mpc-xml');
        expect(input).not.toBeNull();
        expect(input?.className).toContain('hidden');
    });
});
