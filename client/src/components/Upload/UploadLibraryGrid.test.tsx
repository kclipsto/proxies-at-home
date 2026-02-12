import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { UploadLibraryGrid, type UploadLibraryGridProps } from './UploadLibraryGrid';
import type { UploadLibraryItem } from '@/helpers/uploadLibrary';
import * as uploadLibraryHelpers from '@/helpers/uploadLibrary';
import { useToastStore } from '@/store/toast';

// Mock dependencies
vi.mock('@/helpers/uploadLibrary', () => ({
    filterUploadLibraryItems: vi.fn(),
    sortUploadLibraryItems: vi.fn(),
    getUploadLibraryGroupKey: vi.fn(),
    updateUploadLibraryMetadata: vi.fn(),
    deleteUploadLibraryItem: vi.fn(),
    unlinkUploadFaces: vi.fn(),
}));

vi.mock('@/helpers/scryfallApi', () => ({
    getCardByName: vi.fn(),
}));

// Mock toast store
const mockShowSuccessToast = vi.fn();
vi.spyOn(useToastStore, 'getState').mockReturnValue({
    showSuccessToast: mockShowSuccessToast,
} as unknown as ReturnType<typeof useToastStore.getState>);

// Mock CardGrid to simplify testing
vi.mock('../common', () => ({
    CardGrid: ({ children }: { children: React.ReactNode }) => <div data-testid="card-grid">{children}</div>,
}));

// Mock UploadLibraryFilterBar
vi.mock('../common/CardArtFilterBar/UploadLibraryFilterBar', () => ({
    UploadLibraryFilterBar: () => <div data-testid="filter-bar" />,
}));

// Mock window.confirm
const confirmSpy = vi.spyOn(window, 'confirm');

// Test data
const frontItem: UploadLibraryItem = {
    hash: 'h1',
    displayName: 'Front Card',
    imageUrl: 'front.jpg',
    createdAt: 1000,
    isFavorite: false,
    linkedBackHash: 'h2',
};

const backItem: UploadLibraryItem = {
    hash: 'h2',
    displayName: 'Back Card',
    imageUrl: 'back.jpg',
    createdAt: 1000,
    isFavorite: false,
    linkedFrontHash: 'h1',
};

const singleItem: UploadLibraryItem = {
    hash: 'h3',
    displayName: 'Single Card',
    imageUrl: 'single.jpg',
    createdAt: 2000,
    isFavorite: true,
};

const items = [frontItem, backItem, singleItem];

const defaultProps: UploadLibraryGridProps = {
    mode: 'editor',
    items: items,
    onRefresh: vi.fn(),
    cardSize: 3,
};

describe('UploadLibraryGrid', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Setup default helper behavior
        vi.mocked(uploadLibraryHelpers.filterUploadLibraryItems).mockReturnValue(items);
        vi.mocked(uploadLibraryHelpers.sortUploadLibraryItems).mockReturnValue(items);
        vi.mocked(uploadLibraryHelpers.getUploadLibraryGroupKey).mockReturnValue('Recent');
        confirmSpy.mockReturnValue(true);
    });

    it('renders list of items', () => {
        render(<UploadLibraryGrid {...defaultProps} />);

        // Should show filter bar
        expect(screen.getByTestId('filter-bar')).toBeInTheDocument();

        // Should show items
        // Since we mock CardGrid, we look for item elements.
        // But CardGrid mock renders children.
        // Wait, renderTile renders items.
        // We need to confirm that filtered/sorted items are passed to renderTile.
        // In our setup, filter returns ALL items.
        // BUT logic inside UploadLibraryGrid filters out LINKED BACK faces.
        // So we expect Front Card and Single Card. Back Card should be hidden.

        // Let's verify text content of items
        expect(screen.getByText('Front Card')).toBeInTheDocument();
        expect(screen.getByText('Single Card')).toBeInTheDocument();
        expect(screen.queryByText('Back Card')).not.toBeInTheDocument();
    });

    it('handles search filtering and auto-flipping', () => {
        // Mock filter to return all items initially (logic handles hiding back faces)
        vi.mocked(uploadLibraryHelpers.filterUploadLibraryItems).mockReturnValue(items);

        render(<UploadLibraryGrid {...defaultProps} query="Back" />);

        // If query is "Back", the back face matches.
        // The logic should Include the Front Card because its Back Face matches.
        // AND it should Auto-Flip it.

        // We need to simulate the implementation detail of filterUploadLibraryItems being called with query.
        // But here we pass query prop.
        // The component calls filterUploadLibraryItems.
        // We mocked filterUploadLibraryItems.
        // Let's say filter returns ALL items for simplicity, assuming the component does post-filtering?
        // Actually, the component relies on filterUploadLibraryItems returning filtered list.
        // If we want to test auto-flip, we need to ensure the item is in the 'filtered' list.
        // If we return [frontItem, backItem], the component logic should:
        // 1. Keep frontItem.
        // 2. Hide backItem (as it's linked back).
        // 3. Detect backItem matches query "Back".
        // 4. Auto-flip frontItem because back matches.

        // So we just return all items from mock for now to test component logic.
        expect(screen.getByText('Back Card')).toBeInTheDocument(); // It should show Back Card Name because it is flipped
        expect(screen.getByTitle('Show front')).toBeInTheDocument(); // Flip button indicates it is flipped
    });

    it('handles manual flip', async () => {
        render(<UploadLibraryGrid {...defaultProps} />);

        // Initially shows Front Card
        expect(screen.getByText('Front Card')).toBeInTheDocument();

        // Find flip button
        const flipBtn = screen.getByTitle('Show back');
        fireEvent.click(flipBtn);

        // Should now show Back Card
        await waitFor(() => {
            expect(screen.getByText('Back Card')).toBeInTheDocument();
        });

        // Flip back
        const unflipBtn = screen.getByTitle('Show front');
        fireEvent.click(unflipBtn);

        await waitFor(() => {
            expect(screen.getByText('Front Card')).toBeInTheDocument();
        });
    });

    it('deletes item with confirmation and unlinking', async () => {
        render(<UploadLibraryGrid {...defaultProps} />);

        // Find delete button for Single Card
        const deleteButtons = screen.getAllByTitle('Delete');
        // Single Card is last in our list? Sort order depends on mock.
        // Let's just click the first one (Front Card).
        fireEvent.click(deleteButtons[0]);

        // Confirm dialog
        expect(confirmSpy).toHaveBeenCalled();

        // Verify delete called
        expect(uploadLibraryHelpers.deleteUploadLibraryItem).toHaveBeenCalledWith('h1');

        // Since we delete Front Card (h1), the logic inside deleteUploadLibraryItem (which we mocked)
        // is responsible for unlinking. But wait, we mocked the helper.
        // The component just calls the helper.
        // So we just verify the helper is called.
    });

    it('syncs favorite state for linked faces', async () => {
        render(<UploadLibraryGrid {...defaultProps} />);

        // Find favorite button for Front Card (not favorite)
        const favButtons = screen.getAllByTitle('Add to favorites');
        fireEvent.click(favButtons[0]); // Front Card

        // Wait for async changes to propagate
        await waitFor(() => {
            // Should update Front Card metadata
            expect(uploadLibraryHelpers.updateUploadLibraryMetadata).toHaveBeenCalledWith('h1', { isFavorite: true });

            // AND should update Back Card metadata (h2)
            expect(uploadLibraryHelpers.updateUploadLibraryMetadata).toHaveBeenCalledWith('h2', { isFavorite: true });
        });
    });

    it('actions target correct face when flipped', async () => {
        render(<UploadLibraryGrid {...defaultProps} />);

        // Flip the card
        const flipBtn = screen.getByTitle('Show back');
        fireEvent.click(flipBtn);

        await waitFor(() => {
            expect(screen.getByText('Back Card')).toBeInTheDocument();
        });

        // Click Rename on the FLIPPED card
        const renameBtns = screen.getAllByTitle('Rename');
        fireEvent.click(renameBtns[0]);

        // The input should appear.
        // We can check if setEditingHash was called with h2?
        // We can't check internal state easily.
        // But we can check if the input has the back card name.
        const input = screen.getByDisplayValue('Back Card');
        expect(input).toBeInTheDocument();

        // Rename it
        fireEvent.change(input, { target: { value: 'New Back Name' } });
        fireEvent.blur(input);

        // Should call update with h2
        expect(uploadLibraryHelpers.updateUploadLibraryMetadata).toHaveBeenCalledWith('h2', { displayName: 'New Back Name', canonicalCardName: 'New Back Name' });
    });

    it('highlights the tile if selectedHash matches the back card hash', () => {
        // The mock defined above has Front Card (h1) and Back Card (h2)
        // Set selectedHash to the back card's hash ('h2')
        const { container } = render(<UploadLibraryGrid {...defaultProps} selectedHash="h2" mode="artwork-modal" />);

        // Find the ring element that indicates selection
        const selectionRing = container.querySelector('.ring-green-500');
        expect(selectionRing).toBeInTheDocument();
    });
});
