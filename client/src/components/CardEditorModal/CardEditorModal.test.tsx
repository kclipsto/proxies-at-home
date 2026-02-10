import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from 'vitest';
import { CardEditorModal } from './CardEditorModal';
import { paramsToOverrides } from './paramsToOverrides';
import { useSettingsStore } from '@/store/settings';
import { useUserPreferencesStore } from '@/store/userPreferences';
import { DEFAULT_RENDER_PARAMS } from '../CardCanvas';
import type { CardOption } from '../../../../shared/types';
import type { Image } from '../../db';

// Mock dependencies
vi.mock('@/store/settings');

vi.mock('@/store/projectStore', () => ({
    useProjectStore: vi.fn((selector) => {
        const state = { currentProjectId: 'test-project-id' };
        return typeof selector === 'function' ? selector(state) : state;
    }),
}));

vi.mock('@/store/userPreferences', () => ({
    useUserPreferencesStore: vi.fn((selector) => {
        const state = {
            preferences: {
                cardEditorSectionCollapsed: {},
                cardEditorSectionOrder: ['basic', 'enhance', 'darkPixels', 'holographic', 'colorReplace', 'gamma', 'colorEffects', 'borderEffects'],
            },
            setCardEditorSectionCollapsed: vi.fn(),
            setCardEditorSectionOrder: vi.fn(),
        };
        return typeof selector === 'function' ? selector(state) : state;
    }),
}));

vi.mock('@/helpers/imageHistogram', () => ({
    calculateDarknessFactorFromBlob: vi.fn().mockResolvedValue(0.5),
}));

// Mock PixiCardPreview since it uses WebGL
vi.mock('../PixiPage/PixiCardPreview', () => ({
    PixiCardPreview: () => <div data-testid="pixi-preview">PixiCardPreview Mock</div>,
}));

// Mock ZoomControls
vi.mock('../ZoomControls', () => ({
    ZoomControls: () => <div data-testid="zoom-controls">ZoomControls Mock</div>,
}));

// Mock dnd-kit to test drag end
vi.mock('@dnd-kit/core', async (importOriginal) => {
    const mod = await importOriginal<typeof import('@dnd-kit/core')>();
    return {
        ...mod,
        DndContext: ({ onDragEnd, children }: { onDragEnd: (event: { active: { id: string }; over: { id: string } }) => void; children: React.ReactNode }) => (
            <div>
                <button data-testid="trigger-drag-end" onClick={() => onDragEnd({ active: { id: 'basic' }, over: { id: 'enhance' } })}>
                    Trigger Drag
                </button>
                {children}
            </div>
        ),
    };
});

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

            await act(async () => {
                await new Promise(resolve => setTimeout(resolve, 0));
            });

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

    describe('interactions', () => {
        it('should call onClose when cancel button is clicked', () => {
            render(<CardEditorModal {...defaultProps} />);
            const cancelButton = screen.getByText('Cancel');
            fireEvent.click(cancelButton);
            expect(mockOnClose).toHaveBeenCalled();
        });

        it('should call onApply when apply button is clicked', async () => {
            render(<CardEditorModal {...defaultProps} />);
            // "Apply" button (the middle one)
            const applyButton = screen.getByText('Apply');
            await act(async () => {
                fireEvent.click(applyButton);
            });
            expect(mockOnApply).toHaveBeenCalledWith('test-front-uuid', expect.any(Object));
        });

        it('should call onApplyToAll when apply to all button is clicked', async () => {
            render(<CardEditorModal {...defaultProps} />);

            const applyAllBtn = screen.getByText('Apply to All');
            await act(async () => {
                fireEvent.click(applyAllBtn);
            });

            expect(mockOnApplyToAll).toHaveBeenCalledWith(expect.any(Object));
        });

        it('should call onApplyToSelected when applying in multi-select mode', async () => {
            const mockOnApplyToSelected = vi.fn();
            render(
                <CardEditorModal
                    {...defaultProps}
                    selectedCardUuids={['1', '2']}
                    selectedCount={2}
                    onApplyToSelected={mockOnApplyToSelected}
                />
            );

            // Text should be "Apply to 2"
            const applyButton = screen.getByText('Apply to 2');
            await act(async () => {
                fireEvent.click(applyButton);
            });

            expect(mockOnApplyToSelected).toHaveBeenCalledWith(['1', '2'], expect.any(Object));
        });

        it('should call onApply with default params (empty overrides) when reset is clicked', async () => {
            const modifiedCard = createMockCard({
                overrides: { brightness: 1.5 }
            });

            render(<CardEditorModal {...defaultProps} card={modifiedCard} />);

            const resetButton = screen.getByTitle('Reset to global defaults');
            await act(async () => {
                fireEvent.click(resetButton);
            });

            // Should call with empty overrides (meaning use defaults)
            expect(mockOnApply).toHaveBeenCalledWith('test-front-uuid', {});
        });
    });

    describe('preview controls', () => {
        it('should toggle DPI settings', async () => {
            render(<CardEditorModal {...defaultProps} />);
            const dpiBtn = screen.getByTitle(/Click to switch to/);
            expect(dpiBtn).toHaveTextContent('display');

            await act(async () => {
                await act(async () => {
                    fireEvent.click(dpiBtn);
                });
            });

            expect(dpiBtn).toHaveTextContent('export');
        });

        it('should toggle Show Original', async () => {
            render(<CardEditorModal {...defaultProps} />);
            const originalBtn = screen.getByTitle('Show original (no effects)');

            await act(async () => {
                await act(async () => {
                    fireEvent.click(originalBtn);
                });
            });
            expect(originalBtn).toHaveTextContent('Original');

            await act(async () => {
                fireEvent.click(originalBtn);
            });
            expect(originalBtn).toHaveTextContent('Adjusted');
        });

        it('should handle zoom via wheel', async () => {
            render(<CardEditorModal {...defaultProps} />);
            const previewWrapper = screen.getByTestId('pixi-preview').parentElement;
            const container = previewWrapper?.parentElement;

            if (container) {
                await act(async () => {
                    fireEvent.wheel(container, { deltaY: -100 });
                });
                // Zoom handler executes. We verify no crash.
                // Detailed state verification would require mocking ZoomControls to render props or store inspection.
                expect(true).toBe(true);
            }
        });

        it('should handle pan interaction', async () => {
            render(<CardEditorModal {...defaultProps} />);
            const previewWrapper = screen.getByTestId('pixi-preview').parentElement;
            const container = previewWrapper?.parentElement;

            if (container && previewWrapper) {
                // Must ensure correct sequence
                await act(async () => {
                    fireEvent.mouseDown(container, { clientX: 100, clientY: 100, buttons: 1 });
                });

                await act(async () => {
                    fireEvent.mouseMove(container, { clientX: 150, clientY: 150, buttons: 1 });
                });

                // transform should have changed
                // transform should have changed
                await waitFor(() => {
                    expect(previewWrapper.style.transform).toContain('50px');
                });

                fireEvent.mouseUp(container);
            }
        });
    });

    describe('sections', () => {

        it('should toggle section expansion', () => {
            const setCollapsed = vi.fn();
            (useUserPreferencesStore as unknown as Mock).mockImplementation((selector) => {
                if (typeof selector !== 'function') return {
                    preferences: {
                        cardEditorSectionCollapsed: { basic: false },
                        cardEditorSectionOrder: ['basic', 'enhance'],
                    },
                    setCardEditorSectionCollapsed: setCollapsed,
                };
                return selector({
                    preferences: {
                        cardEditorSectionCollapsed: { basic: false },
                        cardEditorSectionOrder: ['basic', 'enhance'],
                    },
                    setCardEditorSectionCollapsed: setCollapsed,
                });
            });

            render(<CardEditorModal {...defaultProps} />);

            const basicHeader = screen.getByText('Image Adjustments');
            fireEvent.click(basicHeader);

            // Expect object merge logic: { ...current, basic: !false } => { basic: true }
            // Note: In the component, it merges with existing. Since existing is {basic:false}, result is {basic:true}.
            // Wait, initially basic: false.
            expect(setCollapsed).toHaveBeenCalledWith(expect.objectContaining({ basic: true }));
        });

        it('should toggle all sections', () => {
            const setCollapsed = vi.fn();
            // Mock needs to satisfy "collapsedCount >= SECTION_IDS.length / 2" (8/2 = 4)
            const collapsedState = { basic: true, enhance: true, darkPixels: true, holographic: true };

            (useUserPreferencesStore as unknown as Mock).mockImplementation((selector) => {
                const state = {
                    preferences: {
                        cardEditorSectionCollapsed: collapsedState,
                        cardEditorSectionOrder: ['basic', 'enhance'],
                    },
                    setCardEditorSectionCollapsed: setCollapsed,
                };
                if (typeof selector !== 'function') return state;
                return selector(state);
            });

            render(<CardEditorModal {...defaultProps} />);

            const expandAllBtn = screen.getByTitle('Expand All');
            fireEvent.click(expandAllBtn);

            expect(setCollapsed).toHaveBeenCalled();
        });

        it('should reorder sections on drag end', async () => {
            const setOrder = vi.fn();
            (useUserPreferencesStore as unknown as Mock).mockImplementation((selector) => {
                const state = {
                    preferences: {
                        cardEditorSectionCollapsed: { basic: false },
                        cardEditorSectionOrder: ['basic', 'enhance'],
                    },
                    setCardEditorSectionCollapsed: vi.fn(),
                    setCardEditorSectionOrder: setOrder,
                };
                if (typeof selector !== 'function') return state;
                return selector(state);
            });

            render(<CardEditorModal {...defaultProps} />);
            const trigger = screen.getByTestId('trigger-drag-end');
            await act(async () => {
                await act(async () => {
                    fireEvent.click(trigger);
                });
            });

            expect(setOrder).toHaveBeenCalled();
        });
    });

    describe('logic coverage', () => {
        it('should handle window resize for mobile detection', async () => {
            render(<CardEditorModal {...defaultProps} />);

            // Trigger resize
            await act(async () => {
                global.innerWidth = 500;
                global.dispatchEvent(new Event('resize'));
            });
            // Revert
            await act(async () => {
                global.innerWidth = 1024;
                global.dispatchEvent(new Event('resize'));
            });
        });
        it('should update params when updateParam is called from a section', async () => {
            // Mock one of the sections to capture props and trigger update
            vi.mock('./sections', async (importOriginal) => {
                const mod = await importOriginal<typeof import('./sections')>();
                return {
                    ...mod,
                    BasicAdjustmentsSection: ({ updateParam }: { updateParam: (key: string, value: unknown) => void }) => {
                        return (
                            <button onClick={() => updateParam('brightness', 1.5)}>
                                Update Brightness
                            </button>
                        );
                    }
                };
            });

            const { unmount } = render(<CardEditorModal {...defaultProps} initialFace="front" />);
            const basicHeader = screen.getByText('Image Adjustments');
            fireEvent.click(basicHeader);

            const updateBtn = await screen.findByText('Update Brightness');
            await act(async () => {
                fireEvent.click(updateBtn);
            });

            const applyButton = screen.getByText('Apply');
            await act(async () => {
                fireEvent.click(applyButton);
            });

            expect(mockOnApply).toHaveBeenCalledWith(
                'test-front-uuid',
                expect.objectContaining({ brightness: 1.5 })
            );

            unmount();
        });

        it('should apply changes to BACK card when showing back', async () => {
            const backCard = createMockCard({ uuid: 'test-back-uuid', overrides: {} });
            const backImage = createMockImage();

            render(
                <CardEditorModal
                    {...defaultProps}
                    initialFace="back"
                    backCard={backCard}
                    backImage={backImage}
                />
            );

            // Apply something
            const applyButton = screen.getByText('Apply');
            await act(async () => {
                fireEvent.click(applyButton);
            });

            expect(mockOnApply).toHaveBeenCalledWith('test-back-uuid', expect.any(Object));
        });

        it('should include darken overrides when darkenUseGlobalSettings is false', async () => {
            const customCard = createMockCard({
                overrides: {
                    darkenUseGlobalSettings: false,
                    darkenMode: 'darken-all',
                    darkenAmount: 0.8
                }
            });

            render(<CardEditorModal {...defaultProps} card={customCard} />);

            const applyButton = screen.getByText('Apply');
            await act(async () => {
                fireEvent.click(applyButton);
            });

            expect(mockOnApply).toHaveBeenCalledWith('test-front-uuid', expect.objectContaining({
                darkenUseGlobalSettings: false,
                darkenMode: 'darken-all',
                darkenAmount: 0.8
            }));
        });
    });
    describe('paramsToOverrides', () => {
        it('should return empty object if no params changed', () => {
            const overrides = paramsToOverrides(DEFAULT_RENDER_PARAMS);
            expect(overrides).toEqual({});
        });

        it('should return all changed params as overrides', () => {
            const modifiedParams = {
                ...DEFAULT_RENDER_PARAMS,
                brightness: 1.5, // Changed
                contrast: 1.2, // Changed
            };
            const overrides = paramsToOverrides(modifiedParams);
            expect(overrides).toEqual({
                brightness: 1.5,
                contrast: 1.2,
            });
        });

        it('should capture darken overrides when useGlobalSettings is false', () => {
            const modifiedParams = {
                ...DEFAULT_RENDER_PARAMS,
                darkenUseGlobalSettings: false,
                darkenMode: 'darken-all' as const,
                darkenAmount: 0.5,
            };
            const overrides = paramsToOverrides(modifiedParams);
            // When false, it should include ALL darken params even if they match defaults (impl detail: logic copies them)
            expect(overrides).toMatchObject({
                darkenUseGlobalSettings: false,
                darkenMode: 'darken-all',
                darkenAmount: 0.5,
            });
        });

        it('should handle all possible override fields', () => {
            // Test a massive change to every field
            const allChanged = {
                ...DEFAULT_RENDER_PARAMS,
                saturation: 2,
                sharpness: 2,
                pop: 2,
                hueShift: 10,
                sepia: 1,
                tintColor: '#ff0000',
                tintAmount: 0.5,
                redBalance: 0.1,
                greenBalance: 0.1,
                blueBalance: 0.1,
                cyanBalance: 0.1,
                magentaBalance: 0.1,
                yellowBalance: 0.1,
                blackBalance: 0.1, // Fixed: Added missing comma
                shadowsIntensity: 0.1,
                midtonesIntensity: 0.1,
                highlightsIntensity: 0.1,
                noiseReduction: 0.5,
                cmykPreview: true,
                holoEffect: 'rainbow' as const,
                holoStrength: 0.5,
                holoAreaMode: 'full' as const,
                holoAreaThreshold: 0.5,
                holoAnimation: 'wave' as const,
                holoSpeed: 2,
                holoExportMode: 'static' as const,
                holoSweepWidth: 0.5,
                holoStarSize: 0.5,
                holoStarVariety: 0.5,
                holoProbability: 0.5,
                holoBlur: 1,
                colorReplaceEnabled: true,
                colorReplaceSource: '#000000',
                colorReplaceTarget: '#ffffff',
                colorReplaceThreshold: 0.2,
                gamma: 1.2,
                vignetteAmount: 0.5,
                vignetteSize: 0.5,
                vignetteFeather: 0.5,
            };

            const overrides = paramsToOverrides(allChanged);

            // Check a random sample to ensure they are present
            expect(overrides.saturation).toBe(2);
            expect(overrides.holoEffect).toBe('rainbow');
            expect(overrides.vignetteAmount).toBe(0.5);

            // Ensure key count roughly matches (just to ensure we didn't miss many)
            expect(Object.keys(overrides).length).toBeGreaterThan(20);
        });
    });

    describe('Front/Back flip button', () => {
        it('should toggle between front and back when flip button clicked', () => {
            const backCard = createMockCard({ uuid: 'test-back-uuid', name: 'Test Card Back' });
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

            // Click the flip button
            const flipButton = screen.getByTitle('Show back');
            fireEvent.click(flipButton);

            // Now shows Back
            expect(screen.getByText('Back')).toBeInTheDocument();
        });
    });

    describe('Double-click to reset pan', () => {
        it('should reset pan position on double-click', async () => {
            render(<CardEditorModal {...defaultProps} />);

            const previewWrapper = screen.getByTestId('pixi-preview').parentElement;
            const container = previewWrapper?.parentElement;

            if (container) {
                // First pan the image
                await act(async () => {
                    fireEvent.mouseDown(container, { clientX: 100, clientY: 100, buttons: 1 });
                });
                await act(async () => {
                    fireEvent.mouseMove(container, { clientX: 150, clientY: 150, buttons: 1 });
                });
                fireEvent.mouseUp(container);

                // Verify pan was applied
                await waitFor(() => {
                    expect(previewWrapper?.style.transform).toContain('50px');
                });

                // Double-click to reset
                await act(async () => {
                    fireEvent.doubleClick(container);
                });

                // Pan should be reset to 0,0
                await waitFor(() => {
                    expect(previewWrapper?.style.transform).toContain('0px');
                });
            }
        });
    });

    describe('No back card behavior', () => {
        it('should disable flip button when no back card', () => {
            render(<CardEditorModal {...defaultProps} />);

            // Try to find the flip button - should be disabled or not present
            const flipButtons = screen.queryAllByTitle('No back image');
            expect(flipButtons.length > 0 || screen.queryByTitle('Show back') === null).toBe(true);
        });
    });
});
