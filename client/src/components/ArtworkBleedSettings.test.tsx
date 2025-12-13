import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ArtworkBleedSettings } from './ArtworkBleedSettings';
import { useArtworkModalStore } from '@/store/artworkModal';
import { useSettingsStore } from '@/store/settings';
import { useSelectionStore } from '@/store/selection';
import { undoableUpdateCardBleedSettings } from '@/helpers/undoableActions';
import type { Mock } from 'vitest';

// Mock dependencies
vi.mock('@/store/artworkModal');
vi.mock('@/store/settings');
vi.mock('@/store/selection');
vi.mock('@/helpers/undoableActions');

describe('ArtworkBleedSettings', () => {
    const mockCloseModal = vi.fn();
    const mockCard = {
        uuid: 'test-uuid',
        bleedMode: 'default',
        imageId: 'test-image-id',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (useArtworkModalStore as unknown as Mock).mockImplementation((selector) => {
            return selector({
                card: mockCard,
                closeModal: mockCloseModal,
            });
        });
        (useSettingsStore as unknown as Mock).mockImplementation((selector) => {
            return selector({
                bleedEdgeWidth: 3,
                bleedEdgeUnit: 'mm',
                withBleedSourceAmount: 3.175,
            });
        });
        (useSelectionStore as unknown as Mock).mockImplementation((state) => state);
        (useSelectionStore.getState as unknown as Mock).mockReturnValue({
            selectedCards: new Set(['test-uuid']),
        });
    });

    it('renders correctly with default settings', () => {
        render(<ArtworkBleedSettings />);
        expect(screen.getByText('Bleed Settings')).toBeInTheDocument();
        // The target BleedModeControl uses 'Use Global Bleed Width' as default label
        expect(screen.getByLabelText('Use Global Bleed Width')).toBeChecked();
    });

    it('updates local state when changing bleed mode', () => {
        render(<ArtworkBleedSettings />);
        // BleedModeControl uses 'Override' for manual mode
        const overrideRadio = screen.getByLabelText('Override');
        fireEvent.click(overrideRadio);
        expect(overrideRadio).toBeChecked();
    });

    it('calls undoableUpdateCardBleedSettings on save', async () => {
        render(<ArtworkBleedSettings />);

        // Change to "No Bleed"
        const noBleedRadio = screen.getByLabelText('No Bleed');
        fireEvent.click(noBleedRadio);

        // Click Save
        const saveButton = screen.getByText('Save Settings');
        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(undoableUpdateCardBleedSettings).toHaveBeenCalledWith(
                ['test-uuid'],
                expect.objectContaining({ bleedMode: 'none' })
            );
            expect(mockCloseModal).toHaveBeenCalled();
        });
    });
});
