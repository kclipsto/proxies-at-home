import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
expect.extend(matchers);
import { ArtworkBleedSettings } from './ArtworkBleedSettings';
import { useArtworkModalStore } from '@/store/artworkModal';
import { useSettingsStore } from '@/store/settings';
import { useSelectionStore } from '@/store/selection';
import { useCardEditorModalStore } from '@/store/cardEditorModal';
import { undoableUpdateCardBleedSettings } from '@/helpers/undoableActions';
import { getHasBuiltInBleed } from '@/helpers/imageSpecs';
import { db } from '@/db';
import type { Mock } from 'vitest';

// Mock dependencies
vi.mock('@/store/artworkModal');
vi.mock('@/store/settings');
vi.mock('@/store/selection');
vi.mock('@/store/cardEditorModal');
vi.mock('@/helpers/undoableActions');
vi.mock('@/helpers/imageSpecs', () => ({
    getHasBuiltInBleed: vi.fn((card) => card?.hasBuiltInBleed ?? false),
}));
vi.mock('@/db', () => ({
    db: {
        cards: {
            get: vi.fn(),
        },
        images: {
            get: vi.fn(),
        },
    },
}));

// Mock BleedModeControl to simplify testing
interface MockBleedModeControlProps {
    mode: string;
    onModeChange: (mode: string) => void;
    amount?: number;
    onAmountChange: (amount: number) => void;
    defaultLabel?: string;
}

vi.mock('./BleedModeControl', () => ({
    BleedModeControl: ({ mode, onModeChange, amount, onAmountChange, defaultLabel }: MockBleedModeControlProps) => (
        <div data-testid="bleed-mode-control">
            <div data-testid="mode-display">{mode}</div>
            <div data-testid="default-label">{defaultLabel}</div>
            <button onClick={() => onModeChange('default')}>Set Default</button>
            <button onClick={() => onModeChange('manual')}>Set Manual</button>
            <button onClick={() => onModeChange('none')}>Set None</button>
            <input
                data-testid="amount-input"
                type="number"
                value={amount}
                onChange={(e) => onAmountChange(parseFloat(e.target.value))}
            />
        </div>
    ),
}));

describe('ArtworkBleedSettings', () => {
    const mockCloseModal = vi.fn();
    const mockOpenEditorModal = vi.fn();

    const defaultFrontCard = {
        uuid: 'front-uuid',
        name: 'Front Card',
        bleedMode: 'default',
        imageId: 'img-1',
        linkedBackId: 'back-uuid',
    };

    const defaultBackCard = {
        uuid: 'back-uuid',
        name: 'Back Card',
        bleedMode: 'default',
        imageId: 'img-2',
    };

    beforeEach(() => {
        vi.clearAllMocks();

        // Default Store Mocks
        (useArtworkModalStore as unknown as Mock).mockImplementation((selector) => {
            return selector({
                card: defaultFrontCard,
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
            selectedCards: new Set(['front-uuid']),
        });

        (useCardEditorModalStore as unknown as Mock).mockReturnValue({
            openModal: mockOpenEditorModal
        });
        (useCardEditorModalStore.getState as unknown as Mock).mockReturnValue({
            openModal: mockOpenEditorModal
        });

        // Default DB Mocks
        (db.cards.get as Mock).mockImplementation((id) => {
            if (id === 'back-uuid') return Promise.resolve(defaultBackCard);
            return Promise.resolve(undefined);
        });

        (db.images.get as Mock).mockResolvedValue({ id: 'img-1', url: 'blob:test' });

        // Reset helper mocks
        vi.mocked(getHasBuiltInBleed).mockReset();
        vi.mocked(getHasBuiltInBleed).mockImplementation((card) => card?.hasBuiltInBleed ?? false);
    });

    describe('Front Face', () => {
        it('renders bleed settings for front face', () => {
            render(<ArtworkBleedSettings selectedFace="front" />);
            expect(screen.getByText('Bleed Settings')).toBeInTheDocument();
            expect(screen.getByText('Built-in Bleed')).toBeInTheDocument();
        });

        it('initializes with default values when card has no specific settings', () => {
            render(<ArtworkBleedSettings selectedFace="front" />);
            expect(screen.getByTestId('mode-display')).toHaveTextContent('default');
            // Default target mode label should show global setting
            expect(screen.getByTestId('default-label')).toHaveTextContent('Global Bleed Width');
        });

        it('initializes with manual values when card has specific settings', async () => {
            const manualCard = {
                ...defaultFrontCard,
                bleedMode: 'generate' as const,
                generateBleedMm: 5.5,
                existingBleedMm: 2.0,
                hasBuiltInBleed: true // trigger source mode logic
            };

            (useArtworkModalStore as unknown as Mock).mockImplementation((selector) => {
                return selector({
                    card: manualCard,
                    closeModal: mockCloseModal,
                });
            });

            vi.mocked(getHasBuiltInBleed).mockReturnValue(true);

            render(<ArtworkBleedSettings selectedFace="front" />);

            await waitFor(() => {
                // Check source amount initialization
                expect(screen.getByLabelText('Built-in Bleed')).toBeChecked();
            });
        });

        it('initializes with checked Built-in Bleed when matched (Standard persistence case)', async () => {
            // In the new model, we persist the detected value to the card, so the card itself will have hasBuiltInBleed = true
            const persistedCard = {
                ...defaultFrontCard,
                hasBuiltInBleed: true, // Persisted
            };

            (useArtworkModalStore as unknown as Mock).mockImplementation((selector) => {
                return selector({
                    card: persistedCard,
                    closeModal: mockCloseModal,
                });
            });

            render(<ArtworkBleedSettings selectedFace="front" />);

            await waitFor(() => {
                expect(screen.getByLabelText('Built-in Bleed')).toBeChecked();
            });

            expect(getHasBuiltInBleed).toHaveBeenCalledWith(persistedCard);
        });

        it('toggling Built-in Bleed shows/hides source controls', () => {
            render(<ArtworkBleedSettings selectedFace="front" />);
            const checkbox = screen.getByLabelText('Built-in Bleed');

            // Should start unchecked (mock reset in beforeEach)
            expect(checkbox).not.toBeChecked();

            const defaultLabels = screen.queryAllByText('Use Type Default');
            // With no built-in bleed, source control is hidden, target might show "Use Global..."
            // The specific text "Use Type Default" appears in Source control default label
            expect(defaultLabels.length).toBe(0);

            fireEvent.click(checkbox);
            expect(checkbox).toBeChecked();

            // Now it should show (Source and potential Target default label update)
            expect(screen.getAllByText('Use Type Default').length).toBeGreaterThan(0);
        });

        it('saves changes correctly', async () => {
            render(<ArtworkBleedSettings selectedFace="front" />);

            // Enable built-in bleed
            fireEvent.click(screen.getByLabelText('Built-in Bleed'));

            // Set Target to None
            const noneBtns = screen.getAllByText('Set None');
            fireEvent.click(noneBtns[noneBtns.length - 1]); // Last one is target

            fireEvent.click(screen.getByText('Save Settings'));

            await waitFor(() => {
                expect(undoableUpdateCardBleedSettings).toHaveBeenCalledWith(
                    ['front-uuid'],
                    expect.objectContaining({
                        hasBuiltInBleed: true,
                        bleedMode: 'none',
                        existingBleedMm: undefined, // Default source
                        generateBleedMm: undefined  // None target
                    })
                );
            });
        });

        it('opens adjust art modal', async () => {
            render(<ArtworkBleedSettings selectedFace="front" />);

            const adjustBtn = screen.getByText('Adjust Art');
            fireEvent.click(adjustBtn);

            expect(mockCloseModal).toHaveBeenCalled();
            expect(mockOpenEditorModal).toHaveBeenCalledWith(expect.objectContaining({
                card: defaultFrontCard
            }));
        });
    });

    describe('Back Face', () => {
        it('shows warning if no linked back card', async () => {
            // Mock no linked back
            (useArtworkModalStore as unknown as Mock).mockImplementation((selector) => {
                return selector({
                    card: { ...defaultFrontCard, linkedBackId: undefined },
                    closeModal: mockCloseModal,
                });
            });

            render(<ArtworkBleedSettings selectedFace="back" />);

            await waitFor(() => {
                expect(screen.getByText(/No back card selected/)).toBeInTheDocument();
            });
        });

        it('shows "Same as front" option when linked back exists', async () => {
            render(<ArtworkBleedSettings selectedFace="back" />);

            await waitFor(() => {
                expect(screen.getByLabelText('Same as front')).toBeInTheDocument();
            });
        });

        it('initializes "Same as front" based on settings comparison', async () => {
            // Mock different settings
            (db.cards.get as Mock).mockResolvedValue({
                ...defaultBackCard,
                bleedMode: 'none' // Front is default
            });

            render(<ArtworkBleedSettings selectedFace="back" />);

            await waitFor(() => {
                expect(screen.getByLabelText('Same as front')).not.toBeChecked();
            });
        });

        it('hides bleed settings when "Same as front" is checked', async () => {
            render(<ArtworkBleedSettings selectedFace="back" />);

            await waitFor(() => {
                expect(screen.getByLabelText('Same as front')).toBeChecked();
                expect(screen.queryByText('Bleed Settings')).not.toBeInTheDocument();
            });
        });

        it('saves front settings to back card when "Same as front" is saved', async () => {
            // Mock specific front settings to verify they are copied
            const frontCard = { ...defaultFrontCard, bleedMode: 'none' as const };
            (useArtworkModalStore as unknown as Mock).mockImplementation((selector) => {
                return selector({
                    card: frontCard,
                    closeModal: mockCloseModal,
                });
            });

            render(<ArtworkBleedSettings selectedFace="back" />);

            await waitFor(() => expect(screen.getByLabelText('Same as front')).toBeInTheDocument());

            // Ensure it's checked (it might default to false if we didn't match the mock back card, 
            // checking logic: front is none, back is default -> diff -> checked=false)
            // Force check it just in case
            const checkbox = screen.getByLabelText('Same as front') as HTMLInputElement;
            if (!checkbox.checked) fireEvent.click(checkbox);

            fireEvent.click(screen.getByText('Save Settings'));

            await waitFor(() => {
                expect(undoableUpdateCardBleedSettings).toHaveBeenCalledWith(
                    ['back-uuid'], // Should operate on back card
                    expect.objectContaining({
                        bleedMode: 'none'
                    })
                );
            });
        });

        it('saves independent settings for back card when unchecked', async () => {
            render(<ArtworkBleedSettings selectedFace="back" />);

            await waitFor(() => expect(screen.getByLabelText('Same as front')).toBeInTheDocument());

            fireEvent.click(screen.getByLabelText('Same as front')); // Uncheck

            // Should now see settings
            expect(screen.getByText('Bleed Settings')).toBeInTheDocument();

            // Change something
            const setNoneBtns = screen.getAllByText('Set None');
            fireEvent.click(setNoneBtns[setNoneBtns.length - 1]); // Target is last

            fireEvent.click(screen.getByText('Save Settings'));

            await waitFor(() => {
                expect(undoableUpdateCardBleedSettings).toHaveBeenCalledWith(
                    ['back-uuid'],
                    expect.objectContaining({
                        bleedMode: 'none'
                    })
                );
            });
        });
    });

    describe('Multi-select Behavior', () => {
        it('applies to multiple front cards', async () => {
            (useSelectionStore.getState as unknown as Mock).mockReturnValue({
                selectedCards: new Set(['front-uuid', 'front-uuid-2']),
            });

            render(<ArtworkBleedSettings selectedFace="front" />);

            // Set target manual
            const manualBtns = screen.getAllByText('Set Manual');
            fireEvent.click(manualBtns[manualBtns.length - 1]); // Target

            fireEvent.click(screen.getByText('Save Settings'));

            await waitFor(() => {
                expect(undoableUpdateCardBleedSettings).toHaveBeenCalledWith(
                    ['front-uuid', 'front-uuid-2'],
                    expect.anything()
                );
            });
        });

        it('ignores multi-select for back face', async () => {
            (useSelectionStore.getState as unknown as Mock).mockReturnValue({
                selectedCards: new Set(['front-uuid', 'front-uuid-2']),
            });

            render(<ArtworkBleedSettings selectedFace="back" />);

            await waitFor(() => expect(screen.getByLabelText('Same as front')).toBeInTheDocument());

            // Uncheck same as front to set explicit settings
            fireEvent.click(screen.getByLabelText('Same as front'));

            fireEvent.click(screen.getByText('Save Settings'));

            await waitFor(() => {
                // Should only include the active back card UUID, not multiple
                expect(undoableUpdateCardBleedSettings).toHaveBeenCalledWith(
                    ['back-uuid'],
                    expect.anything()
                );
            });
        });
    });
});
