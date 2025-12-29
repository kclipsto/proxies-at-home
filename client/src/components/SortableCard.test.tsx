import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock dependencies with vi.hoisted
const { mockUseSortable, mockOpenModal, mockToggleSelection, mockToggleFlip } = vi.hoisted(() => ({
    mockUseSortable: vi.fn(() => ({
        attributes: { role: 'button' },
        listeners: { onPointerDown: vi.fn() },
        setNodeRef: vi.fn(),
        transform: null,
        transition: null,
        isDragging: false,
    })),
    mockOpenModal: vi.fn(),
    mockToggleSelection: vi.fn(),
    mockToggleFlip: vi.fn(),
}));

// Track selection state for tests
let mockSelectedCards = new Set<string>();
let mockFlippedCards = new Set<string>();

vi.mock('@dnd-kit/sortable', () => ({
    useSortable: mockUseSortable,
}));

vi.mock('@dnd-kit/utilities', () => ({
    CSS: {
        Transform: {
            toString: (transform: { x: number; y: number } | null) =>
                transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : '',
        },
    },
}));

vi.mock('../store', () => ({
    useArtworkModalStore: vi.fn((selector) => {
        const state = { openModal: mockOpenModal };
        return selector(state);
    }),
}));

vi.mock('../store/selection', () => ({
    useSelectionStore: vi.fn((selector) => {
        const state = {
            selectedCards: mockSelectedCards,
            flippedCards: mockFlippedCards,
            toggleSelection: mockToggleSelection,
            toggleFlip: mockToggleFlip,
        };
        return selector(state);
    }),
}));

import SortableCard, { CardView } from './SortableCard';

describe('SortableCard', () => {
    const mockCard = {
        uuid: 'test-uuid',
        name: 'Test Card',
        imageUrls: ['http://example.com/card.jpg'],
    };

    const defaultProps = {
        card: mockCard as never,
        index: 0,
        globalIndex: 5,
        totalCardWidth: 63,
        totalCardHeight: 88,
        setContextMenu: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockSelectedCards = new Set<string>();
        mockFlippedCards = new Set<string>();
    });

    describe('rendering', () => {
        it('should render without crashing', () => {
            const { container } = render(<SortableCard {...defaultProps} />);
            expect(container.firstChild).not.toBeNull();
        });

        it('should render drag handle on desktop', () => {
            render(<SortableCard {...defaultProps} mobile={false} />);
            expect(screen.getByTitle('Drag')).toBeDefined();
        });

        it('should not render drag handle on mobile', () => {
            render(<SortableCard {...defaultProps} mobile={true} />);
            expect(screen.queryByTitle('Drag')).toBeNull();
        });

        it('should not render drag handle when disabled', () => {
            render(<SortableCard {...defaultProps} disabled={true} />);
            expect(screen.queryByTitle('Drag')).toBeNull();
        });

        it('should render flip button', () => {
            render(<SortableCard {...defaultProps} />);
            expect(screen.getByTestId('flip-button')).toBeDefined();
        });

        it('should render selection checkbox', () => {
            render(<SortableCard {...defaultProps} />);
            expect(screen.getByTitle('Select card')).toBeDefined();
        });

        it('should apply correct dimensions with totalCardWidth/Height', () => {
            const { container } = render(
                <SortableCard {...defaultProps} totalCardWidth={70} totalCardHeight={95} />
            );
            const element = container.firstChild as HTMLElement;
            expect(element.style.width).toBe('70mm');
            expect(element.style.height).toBe('95mm');
        });

        it('should calculate dimensions from imageBleedWidth when provided', () => {
            const { container } = render(
                <SortableCard {...defaultProps} imageBleedWidth={3} />
            );
            const element = container.firstChild as HTMLElement;
            // 63 + 3*2 = 69mm, 88 + 3*2 = 94mm
            expect(element.style.width).toBe('69mm');
            expect(element.style.height).toBe('94mm');
        });

        it('should apply scaled transform when transform exists', () => {
            mockUseSortable.mockReturnValue({
                attributes: {},
                listeners: {},
                setNodeRef: vi.fn(),
                transform: { x: 100, y: 50, scaleX: 1, scaleY: 1 },
                transition: 'transform 200ms',
                isDragging: false,
            });

            const { container } = render(
                <SortableCard {...defaultProps} scale={2} />
            );
            const element = container.firstChild as HTMLElement;
            // x: 100/2 = 50, y: 50/2 = 25
            expect(element.style.transform).toBe('translate3d(50px, 25px, 0)');
        });

        it('should not apply transform when dropped is true', () => {
            mockUseSortable.mockReturnValue({
                attributes: {},
                listeners: {},
                setNodeRef: vi.fn(),
                transform: { x: 100, y: 50, scaleX: 1, scaleY: 1 },
                transition: 'transform 200ms',
                isDragging: false,
            });

            const { container } = render(
                <SortableCard {...defaultProps} dropped={true} />
            );
            const element = container.firstChild as HTMLElement;
            expect(element.style.transform).toBe('');
        });

        it('should hide card and increase z-index when dragging', () => {
            mockUseSortable.mockReturnValue({
                attributes: {},
                listeners: {},
                setNodeRef: vi.fn(),
                transform: null,
                transition: null,
                isDragging: true,
            });

            const { container } = render(<SortableCard {...defaultProps} />);
            const element = container.firstChild as HTMLElement;
            expect(element.style.opacity).toBe('0');
            expect(element.style.zIndex).toBe('999');
        });
    });

    describe('selection', () => {
        it('should show selection overlay when card is selected', () => {
            mockSelectedCards = new Set(['test-uuid']);

            const { container } = render(<SortableCard {...defaultProps} />);
            const overlay = container.querySelector('.bg-blue-500\\/30');
            expect(overlay).not.toBeNull();
        });

        it('should show checkmark in checkbox when selected', () => {
            mockSelectedCards = new Set(['test-uuid']);

            render(<SortableCard {...defaultProps} />);
            // Check icon should be present
            const checkbox = screen.getByTitle('Select card');
            expect(checkbox.querySelector('svg')).not.toBeNull();
        });

        it('should toggle selection when checkbox is clicked', () => {
            render(<SortableCard {...defaultProps} />);

            const checkbox = screen.getByTitle('Select card');
            fireEvent.click(checkbox);

            expect(mockToggleSelection).toHaveBeenCalledWith('test-uuid', 5);
        });

        it('should call onRangeSelect when shift+clicking checkbox', () => {
            const onRangeSelect = vi.fn();
            render(<SortableCard {...defaultProps} onRangeSelect={onRangeSelect} />);

            const checkbox = screen.getByTitle('Select card');
            fireEvent.click(checkbox, { shiftKey: true });

            expect(onRangeSelect).toHaveBeenCalledWith(5);
            expect(mockToggleSelection).not.toHaveBeenCalled();
        });

        it('should stop propagation when clicking checkbox', () => {
            render(<SortableCard {...defaultProps} />);

            const checkbox = screen.getByTitle('Select card');
            const clickEvent = new MouseEvent('click', { bubbles: true });
            const stopPropagationSpy = vi.spyOn(clickEvent, 'stopPropagation');

            checkbox.dispatchEvent(clickEvent);

            expect(stopPropagationSpy).toHaveBeenCalled();
        });
    });

    describe('flip functionality', () => {
        it('should toggle flip when flip button is clicked', () => {
            render(<SortableCard {...defaultProps} />);

            const flipButton = screen.getByTestId('flip-button');
            fireEvent.click(flipButton);

            expect(mockToggleFlip).toHaveBeenCalledWith('test-uuid');
        });

        it('should show "Show front" title when flipped', () => {
            mockFlippedCards = new Set(['test-uuid']);

            render(<SortableCard {...defaultProps} />);

            const flipButton = screen.getByTestId('flip-button');
            expect(flipButton.getAttribute('title')).toBe('Show front');
        });

        it('should show "Show back" title when not flipped', () => {
            render(<SortableCard {...defaultProps} />);

            const flipButton = screen.getByTestId('flip-button');
            expect(flipButton.getAttribute('title')).toBe('Show back');
        });

        it('should apply active styling when flipped', () => {
            mockFlippedCards = new Set(['test-uuid']);

            render(<SortableCard {...defaultProps} />);

            const flipButton = screen.getByTestId('flip-button');
            expect(flipButton.className).toContain('bg-blue-500');
        });

        it('should stop propagation when clicking flip button', () => {
            render(<SortableCard {...defaultProps} />);

            const flipButton = screen.getByTestId('flip-button');
            const clickEvent = new MouseEvent('click', { bubbles: true });
            const stopPropagationSpy = vi.spyOn(clickEvent, 'stopPropagation');

            flipButton.dispatchEvent(clickEvent);

            expect(stopPropagationSpy).toHaveBeenCalled();
        });
    });

    describe('card click handling', () => {
        beforeEach(() => {
            mockUseSortable.mockReturnValue({
                attributes: {},
                listeners: {},
                setNodeRef: vi.fn(),
                transform: null,
                transition: null,
                isDragging: false,
            });
        });

        it('should open artwork modal on click (desktop)', () => {
            const { container } = render(<SortableCard {...defaultProps} mobile={false} />);

            const card = container.querySelector('[data-dnd-sortable-item]') as HTMLElement;
            fireEvent.click(card);

            expect(mockOpenModal).toHaveBeenCalledWith({
                card: mockCard,
                index: 5,
                initialTab: 'artwork',
                initialFace: 'front',
            });
        });

        it('should open modal with settings tab when card is selected', () => {
            mockSelectedCards = new Set(['test-uuid']);

            const { container } = render(<SortableCard {...defaultProps} mobile={false} />);

            const card = container.querySelector('[data-dnd-sortable-item]') as HTMLElement;
            fireEvent.click(card);

            expect(mockOpenModal).toHaveBeenCalledWith({
                card: mockCard,
                index: 5,
                initialTab: 'settings',
                initialFace: 'front',
            });
        });

        it('should open modal with back face when card is flipped', () => {
            mockFlippedCards = new Set(['test-uuid']);

            const { container } = render(<SortableCard {...defaultProps} mobile={false} />);

            const card = container.querySelector('[data-dnd-sortable-item]') as HTMLElement;
            fireEvent.click(card);

            expect(mockOpenModal).toHaveBeenCalledWith({
                card: mockCard,
                index: 5,
                initialTab: 'artwork',
                initialFace: 'back',
            });
        });

        it('should toggle selection on Ctrl+click', () => {
            const { container } = render(<SortableCard {...defaultProps} />);

            const card = container.querySelector('[data-dnd-sortable-item]') as HTMLElement;
            fireEvent.click(card, { ctrlKey: true });

            expect(mockToggleSelection).toHaveBeenCalledWith('test-uuid', 5);
            expect(mockOpenModal).not.toHaveBeenCalled();
        });

        it('should toggle selection on Cmd+click (Mac)', () => {
            const { container } = render(<SortableCard {...defaultProps} />);

            const card = container.querySelector('[data-dnd-sortable-item]') as HTMLElement;
            fireEvent.click(card, { metaKey: true });

            expect(mockToggleSelection).toHaveBeenCalledWith('test-uuid', 5);
            expect(mockOpenModal).not.toHaveBeenCalled();
        });

        it('should call onRangeSelect on Shift+click', () => {
            const onRangeSelect = vi.fn();
            const { container } = render(<SortableCard {...defaultProps} onRangeSelect={onRangeSelect} />);

            const card = container.querySelector('[data-dnd-sortable-item]') as HTMLElement;
            fireEvent.click(card, { shiftKey: true });

            expect(onRangeSelect).toHaveBeenCalledWith(5);
            expect(mockOpenModal).not.toHaveBeenCalled();
        });
    });

    describe('mobile double-tap behavior', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            mockUseSortable.mockReturnValue({
                attributes: {},
                listeners: {},
                setNodeRef: vi.fn(),
                transform: null,
                transition: null,
                isDragging: false,
            });
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should open modal after single tap timeout on mobile', () => {
            const { container } = render(<SortableCard {...defaultProps} mobile={true} />);

            const card = container.querySelector('[data-dnd-sortable-item]') as HTMLElement;
            fireEvent.click(card);

            expect(mockOpenModal).not.toHaveBeenCalled();

            vi.advanceTimersByTime(300);

            expect(mockOpenModal).toHaveBeenCalledWith({
                card: mockCard,
                index: 5,
                initialTab: 'artwork',
                initialFace: 'front',
            });
        });

        it('should show context menu on double-tap on mobile', () => {
            const setContextMenu = vi.fn();
            const { container } = render(<SortableCard {...defaultProps} mobile={true} setContextMenu={setContextMenu} />);

            const card = container.querySelector('[data-dnd-sortable-item]') as HTMLElement;

            // First tap
            fireEvent.click(card, { clientX: 100, clientY: 200 });

            // Second tap (double-tap) before timeout
            vi.advanceTimersByTime(100);
            fireEvent.click(card, { clientX: 100, clientY: 200 });

            expect(setContextMenu).toHaveBeenCalledWith({
                visible: true,
                x: 100,
                y: 200,
                cardUuid: 'test-uuid',
            });
            expect(mockOpenModal).not.toHaveBeenCalled();
        });

        it('should not trigger modal when double-tapping on mobile', () => {
            const { container } = render(<SortableCard {...defaultProps} mobile={true} />);

            const card = container.querySelector('[data-dnd-sortable-item]') as HTMLElement;

            // First tap
            fireEvent.click(card);

            // Second tap before timeout (double-tap)
            vi.advanceTimersByTime(100);
            fireEvent.click(card);

            // Advance past what would be the timeout
            vi.advanceTimersByTime(500);

            expect(mockOpenModal).not.toHaveBeenCalled();
        });
    });

    describe('context menu', () => {
        it('should show context menu on right-click (desktop)', () => {
            const setContextMenu = vi.fn();
            const { container } = render(<SortableCard {...defaultProps} setContextMenu={setContextMenu} mobile={false} />);

            const card = container.querySelector('[data-dnd-sortable-item]') as HTMLElement;
            fireEvent.contextMenu(card, { clientX: 150, clientY: 250 });

            expect(setContextMenu).toHaveBeenCalledWith({
                visible: true,
                x: 150,
                y: 250,
                cardUuid: 'test-uuid',
            });
        });

        it('should not show context menu on right-click when mobile', () => {
            const setContextMenu = vi.fn();
            const { container } = render(<SortableCard {...defaultProps} setContextMenu={setContextMenu} mobile={true} />);

            const card = container.querySelector('[data-dnd-sortable-item]') as HTMLElement;
            fireEvent.contextMenu(card);

            expect(setContextMenu).not.toHaveBeenCalled();
        });

        it('should prevent default on context menu', () => {
            const setContextMenu = vi.fn();
            const { container } = render(<SortableCard {...defaultProps} setContextMenu={setContextMenu} />);

            const card = container.querySelector('[data-dnd-sortable-item]') as HTMLElement;
            const event = new MouseEvent('contextmenu', { bubbles: true });
            const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

            card.dispatchEvent(event);

            expect(preventDefaultSpy).toHaveBeenCalled();
        });
    });

    describe('drag handle', () => {
        it('should stop propagation when clicking drag handle', () => {
            render(<SortableCard {...defaultProps} mobile={false} />);

            const dragHandle = screen.getByTitle('Drag');
            const clickEvent = new MouseEvent('click', { bubbles: true });
            const stopPropagationSpy = vi.spyOn(clickEvent, 'stopPropagation');

            dragHandle.dispatchEvent(clickEvent);

            expect(stopPropagationSpy).toHaveBeenCalled();
        });

        it('should pass useSortable id from card uuid', () => {
            render(<SortableCard {...defaultProps} />);

            expect(mockUseSortable).toHaveBeenCalledWith({
                id: 'test-uuid',
                disabled: undefined,
            });
        });

        it('should pass disabled state to useSortable', () => {
            render(<SortableCard {...defaultProps} disabled={true} />);

            expect(mockUseSortable).toHaveBeenCalledWith({
                id: 'test-uuid',
                disabled: true,
            });
        });
    });

    describe('CardView component', () => {
        it('should not respond to clicks when isOverlay is true', () => {
            const { container } = render(
                <CardView
                    {...defaultProps}
                    isOverlay={true}
                />
            );

            const card = container.querySelector('[data-dnd-sortable-item]') as HTMLElement;
            fireEvent.click(card);

            expect(mockOpenModal).not.toHaveBeenCalled();
            expect(mockToggleSelection).not.toHaveBeenCalled();
        });

        it('should not show selection overlay when isOverlay is true', () => {
            mockSelectedCards = new Set(['test-uuid']);

            const { container } = render(
                <CardView
                    {...defaultProps}
                    isOverlay={true}
                />
            );

            const overlay = container.querySelector('.bg-blue-500\\/30');
            expect(overlay).toBeNull();
        });

        it('should not show controls when isOverlay is true', () => {
            render(
                <CardView
                    {...defaultProps}
                    isOverlay={true}
                />
            );

            expect(screen.queryByTitle('Select card')).toBeNull();
            expect(screen.queryByTitle('Drag')).toBeNull();
            expect(screen.queryByTestId('flip-button')).toBeNull();
        });

        it('should not show context menu when isOverlay is true', () => {
            const setContextMenu = vi.fn();
            const { container } = render(
                <CardView
                    {...defaultProps}
                    setContextMenu={setContextMenu}
                    isOverlay={true}
                />
            );

            const card = container.querySelector('[data-dnd-sortable-item]') as HTMLElement;
            fireEvent.contextMenu(card);

            expect(setContextMenu).not.toHaveBeenCalled();
        });

        it('should apply grabbing cursor when isOverlay is true', () => {
            const { container } = render(
                <CardView
                    {...defaultProps}
                    isOverlay={true}
                />
            );

            const card = container.firstChild as HTMLElement;
            expect(card.className).toContain('cursor-grabbing');
        });

        it('should apply mobile listeners when mobile is true', () => {
            const mockListeners = { onPointerDown: vi.fn() };
            const { container } = render(
                <CardView
                    {...defaultProps}
                    mobile={true}
                    listeners={mockListeners}
                />
            );

            // The listeners should be applied to the container
            expect(container.firstChild).not.toBeNull();
        });
    });
});
