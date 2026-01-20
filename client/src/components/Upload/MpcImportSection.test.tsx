import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MpcImportSection } from './MpcImportSection';
import { ImportOrchestrator } from '@/helpers/ImportOrchestrator';
import { handleAutoImportTokens } from '@/helpers/tokenImportHelper';

// Mock dependencies
vi.mock('@/helpers/ImportOrchestrator', () => ({
    ImportOrchestrator: {
        process: vi.fn(),
    },
}));

vi.mock('@/helpers/tokenImportHelper', () => ({
    handleAutoImportTokens: vi.fn(),
}));

vi.mock('@/helpers/importParsers', () => ({
    parseMpcXml: vi.fn(() => [{ name: 'Test Card', quantity: 1, mpcId: '123' }]),
}));

const mockSetSortBy = vi.fn();
const mockGetState = vi.fn(() => ({
    setSortBy: mockSetSortBy,
    // The component doesn't read this anymore, the helper does.
    autoImportTokens: false,
}));

vi.mock('@/store/settings', () => ({
    useSettingsStore: {
        getState: () => mockGetState(),
    },
}));

describe('MpcImportSection', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Mock process to verify onComplete behavior
        vi.mocked(ImportOrchestrator.process).mockImplementation(async (_intents, options) => {
            if (options?.onComplete) {
                await options.onComplete();
            }
        });
    });

    it('should render import button', () => {
        render(<MpcImportSection />);
        const button = screen.getByText('Import MPC XML');
        expect(button).toBeDefined();
    });

    it('should trigger import on file selection', async () => {
        render(<MpcImportSection />);
        const input = document.getElementById('import-mpc-xml') as HTMLInputElement;

        const file = new File(['<xml>test</xml>'], 'test.xml', { type: 'text/xml' });
        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => {
            expect(ImportOrchestrator.process).toHaveBeenCalled();
        });
    });

    it('should call handleAutoImportTokens on complete', async () => {
        render(<MpcImportSection />);
        const input = document.getElementById('import-mpc-xml') as HTMLInputElement;

        const file = new File(['<xml>test</xml>'], 'test.xml', { type: 'text/xml' });
        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => {
            expect(ImportOrchestrator.process).toHaveBeenCalled();
            // The component now blindly calls the helper, which handles the conditional check internally
            expect(handleAutoImportTokens).toHaveBeenCalledWith(expect.objectContaining({
                silent: true
            }));
        });
    });
});
