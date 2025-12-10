import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ArtworkBleedSettings } from './ArtworkBleedSettings';
import { useArtworkModalStore } from '@/store/artworkModal';
import { useSettingsStore } from '@/store/settings';
import { useSelectionStore } from '@/store/selection';
import { undoableUpdateCardBleedSettings } from '@/helpers/undoableActions';
import { db } from '../db';
import type { Mock } from 'vitest';

// Mock dependencies
vi.mock('@/store/artworkModal');
vi.mock('@/store/settings');
vi.mock('@/store/selection');
vi.mock('@/helpers/undoableActions');
vi.mock('../db');

describe('ArtworkBleedSettings', () => {
    const mockCloseModal = vi.fn();
    const mockCard = {
        uuid: 'test-uuid',
        bleedMode: 'default',
        existingBleedMm: 0,
        generateBleedMm: 1,
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
            });
        });
        (useSelectionStore as unknown as Mock).mockImplementation((state) => state);
        (useSelectionStore.getState as unknown as Mock).mockReturnValue({
            selectedCards: new Set(['test-uuid']),
        });
        (db.cards.where as unknown as Mock).mockReturnValue({
            anyOf: vi.fn().mockReturnValue({
                toArray: vi.fn().mockResolvedValue([{ imageId: 'test-image-id' }]),
            }),
        });
    });

    it('renders correctly with default settings', () => {
        render(<ArtworkBleedSettings />);
        expect(screen.getByText('Bleed Settings')).toBeInTheDocument();
        expect(screen.getByLabelText('Use Default (from global settings)')).toBeChecked();
    });

    it('updates local state when changing bleed mode', () => {
        render(<ArtworkBleedSettings />);
        const generateRadio = screen.getByLabelText('Generate Bleed');
        fireEvent.click(generateRadio);
        expect(generateRadio).toBeChecked();
    });

    it('calls undoableUpdateCardBleedSettings and updates DB on save', async () => {
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
            expect(db.images.update).toHaveBeenCalledWith(
                'test-image-id',
                expect.objectContaining({ displayBlob: undefined })
            );
            expect(mockCloseModal).toHaveBeenCalled();
        });
    });
});
