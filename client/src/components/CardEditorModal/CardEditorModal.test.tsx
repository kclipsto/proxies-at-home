import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CardEditorModal } from './CardEditorModal';
import { useSettingsStore } from '@/store/settings';
import type { Mock } from 'vitest';
import type { CardOption } from '../../../../shared/types';
import type { Image } from '../../db';

// Mock dependencies
vi.mock('@/store/settings');

// Mock PixiCardPreview since it uses WebGL
vi.mock('../PixiPage/PixiCardPreview', () => ({
    PixiCardPreview: () => <div data-testid="pixi-preview">PixiCardPreview Mock</div>,
}));

// Mock ZoomControls
vi.mock('../ZoomControls', () => ({
    ZoomControls: () => <div data-testid="zoom-controls">ZoomControls Mock</div>,
}));

// Create minimal mock card and image for tests
const createMockCard = (overrides?: Partial<CardOption>): CardOption => ({
    uuid: 'test-front-uuid',
    name: 'Test Card',
    order: 0,
    imageId: 'test-image-id',
    isUserUpload: false,
    ...overrides,
} as CardOption);

const createMockImage = (): Image => ({
    id: 'test-image-id',
    refCount: 1,
    displayBlob: new Blob(['test'], { type: 'image/png' }),
    exportBlob: new Blob(['test'], { type: 'image/png' }),
});

describe('CardEditorModal', () => {
    const mockOnClose = vi.fn();
    const mockOnApply = vi.fn();
    const mockOnApplyToAll = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        const mockStore = {
            darkenMode: 'none',
            cardEditorSectionCollapsed: {},
            setCardEditorSectionCollapsed: vi.fn(),
            cardEditorSectionOrder: ['basic', 'darkPixels', 'enhance', 'holographic', 'colorReplace', 'gamma', 'colorEffects', 'borderEffects'],
            setCardEditorSectionOrder: vi.fn(),
        };
        (useSettingsStore as unknown as Mock).mockImplementation((selector?: (state: typeof mockStore) => unknown) => {
            if (selector) {
                return selector(mockStore);
            }
            return mockStore;
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    const defaultProps = {
        isOpen: true,
        onClose: mockOnClose,
        card: createMockCard(),
        image: createMockImage(),
        onApply: mockOnApply,
        onApplyToAll: mockOnApplyToAll,
    };

    describe('initialFace prop behavior', () => {
        it('should show front face by default when initialFace is not provided', () => {
            render(<CardEditorModal {...defaultProps} />);

            // The flip button should say "Front" when showing front face
            expect(screen.getByText('Front')).toBeInTheDocument();
        });

        it('should show front face when initialFace is "front"', () => {
            render(<CardEditorModal {...defaultProps} initialFace="front" />);

            expect(screen.getByText('Front')).toBeInTheDocument();
        });

        it('should show back face when initialFace is "back" and backCard exists', async () => {
            const backCard = createMockCard({ uuid: 'test-back-uuid', name: 'Test Card Back' });
            const backImage = createMockImage();

            render(
                <CardEditorModal
                    {...defaultProps}
                    initialFace="back"
                    backCard={backCard}
                    backImage={backImage}
                />
            );

            // Wait for any effects to run
            await waitFor(() => {
                expect(screen.getByText('Back')).toBeInTheDocument();
            });
        });

        it('should maintain showBack=true after re-renders when initialFace is "back"', async () => {
            const backCard = createMockCard({ uuid: 'test-back-uuid', name: 'Test Card Back' });
            const backImage = createMockImage();

            const { rerender } = render(
                <CardEditorModal
                    {...defaultProps}
                    initialFace="back"
                    backCard={backCard}
                    backImage={backImage}
                />
            );

            // Initial render should show Back
            await waitFor(() => {
                expect(screen.getByText('Back')).toBeInTheDocument();
            });

            // Simulate re-render (like what happens when backImage loads)
            rerender(
                <CardEditorModal
                    {...defaultProps}
                    initialFace="back"
                    backCard={backCard}
                    backImage={backImage}
                />
            );

            // Should still show Back after re-render
            expect(screen.getByText('Back')).toBeInTheDocument();
        });

        it('should maintain showBack=true when backImage prop changes from null to defined', async () => {
            const backCard = createMockCard({ uuid: 'test-back-uuid', name: 'Test Card Back' });

            // First render without backImage
            const { rerender } = render(
                <CardEditorModal
                    {...defaultProps}
                    initialFace="back"
                    backCard={backCard}
                    backImage={undefined}
                />
            );

            // Should show Back even without backImage
            await waitFor(() => {
                expect(screen.getByText('Back')).toBeInTheDocument();
            });

            // Now add backImage (simulating live query loading)
            const backImage = createMockImage();
            rerender(
                <CardEditorModal
                    {...defaultProps}
                    initialFace="back"
                    backCard={backCard}
                    backImage={backImage}
                />
            );

            // Should still show Back
            expect(screen.getByText('Back')).toBeInTheDocument();
        });

        it('should correctly reset showBack when closing and reopening with different initialFace', async () => {
            const backCard = createMockCard({ uuid: 'test-back-uuid', name: 'Test Card Back' });
            const backImage = createMockImage();

            // Open with front - note: key prop mimics production wrapper behavior
            const { rerender } = render(
                <CardEditorModal
                    key="test-front-uuid-front"
                    {...defaultProps}
                    isOpen={true}
                    initialFace="front"
                    backCard={backCard}
                    backImage={backImage}
                />
            );

            expect(screen.getByText('Front')).toBeInTheDocument();

            // Close
            rerender(
                <CardEditorModal
                    key="test-front-uuid-front"
                    {...defaultProps}
                    isOpen={false}
                    initialFace="front"
                    backCard={backCard}
                    backImage={backImage}
                />
            );

            // Reopen with back - different key forces remount (like production wrapper)
            rerender(
                <CardEditorModal
                    key="test-front-uuid-back"
                    {...defaultProps}
                    isOpen={true}
                    initialFace="back"
                    backCard={backCard}
                    backImage={backImage}
                />
            );

            await waitFor(() => {
                expect(screen.getByText('Back')).toBeInTheDocument();
            });
        });
    });

    describe('flip button functionality', () => {
        it('should toggle between front and back when flip button is clicked', async () => {
            const backCard = createMockCard({ uuid: 'test-back-uuid' });
            const backImage = createMockImage();

            render(
                <CardEditorModal
                    {...defaultProps}
                    backCard={backCard}
                    backImage={backImage}
                />
            );

            // Initially shows Front
            expect(screen.getByText('Front')).toBeInTheDocument();

            // Click flip button
            const flipButton = screen.getByTitle('Show back');
            await act(async () => {
                flipButton.click();
            });

            // Now shows Back
            expect(screen.getByText('Back')).toBeInTheDocument();
        });

        it('should be disabled when there is no back card', () => {
            render(<CardEditorModal {...defaultProps} />);

            const flipButton = screen.getByTitle('No back image');
            expect(flipButton).toBeDisabled();
        });
    });
});
