import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Store the captured useDrag callback for testing
let capturedDragCallback: ((state: DragState) => number | undefined) | null = null;
let capturedDragConfig: Record<string, unknown> | null = null;

interface DragState {
    down: boolean;
    movement: [number, number];
    currentTarget: HTMLElement | undefined;
    canceled: boolean;
    cancel: () => void;
    event: Partial<PointerEvent | TouchEvent | MouseEvent | KeyboardEvent>;
    first: boolean;
    memo?: number;
}

// Create a mock spring API
const mockSpringApi = {
    start: vi.fn(),
};

const mockY = {
    get: vi.fn(() => 0),
    to: vi.fn((fn: (v: number) => unknown) => fn(0)),
};

vi.mock('@use-gesture/react', () => ({
    useDrag: (callback: (state: DragState) => number | undefined, config: Record<string, unknown>) => {
        capturedDragCallback = callback;
        capturedDragConfig = config;
        return () => ({});
    },
}));

vi.mock('@react-spring/web', () => ({
    useSpring: () => [{ y: mockY }, mockSpringApi],
    animated: {
        div: 'div',
        img: 'img',
    },
}));

import { PullToRefresh } from './PullToRefresh';

// Helper to create a mock DOM element for testing
const createMockElement = (scrollTop = 0, scrollHeight = 500, clientHeight = 400) => {
    return {
        scrollTop,
        scrollHeight,
        clientHeight,
    } as HTMLElement;
};

// Helper to create a mock drag state
const createDragState = (overrides: Partial<DragState> = {}): DragState => ({
    down: true,
    movement: [0, 0] as [number, number],
    currentTarget: createMockElement(),
    canceled: false,
    cancel: vi.fn(),
    event: { pointerType: 'touch', type: 'pointerdown' } as Partial<PointerEvent>,
    first: false,
    memo: 0,
    ...overrides,
});

describe('PullToRefresh', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        capturedDragCallback = null;
        capturedDragConfig = null;
        mockY.get.mockReturnValue(0);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('rendering', () => {
        it('should render children', () => {
            render(
                <PullToRefresh>
                    <div>Child Content</div>
                </PullToRefresh>
            );
            expect(screen.getByText('Child Content')).toBeDefined();
        });

        it('should show "Pull to Refresh" text', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );
            expect(screen.getByText('Pull to Refresh')).toBeDefined();
        });

        it('should apply className prop', () => {
            const { container } = render(
                <PullToRefresh className="custom-class">
                    <div>Content</div>
                </PullToRefresh>
            );
            expect((container.firstChild as HTMLElement).className).toContain('custom-class');
        });

        it('should apply style prop', () => {
            const { container } = render(
                <PullToRefresh style={{ backgroundColor: 'red' }}>
                    <div>Content</div>
                </PullToRefresh>
            );
            expect((container.firstChild as HTMLElement).style.backgroundColor).toBe('red');
        });

        it('should forward ref to container div', () => {
            const ref = { current: null as HTMLDivElement | null };
            render(
                <PullToRefresh ref={ref}>
                    <div>Content</div>
                </PullToRefresh>
            );
            expect(ref.current).toBeInstanceOf(HTMLDivElement);
        });
    });

    describe('useDrag configuration', () => {
        it('should configure useDrag with correct options', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            expect(capturedDragConfig).toMatchObject({
                axis: 'y',
                eventOptions: { passive: false },
                filterTaps: true,
                pointer: { touch: true },
            });
        });

        it('should set "from" function that returns [0, current y value]', () => {
            mockY.get.mockReturnValue(50);
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const fromFn = capturedDragConfig!.from as () => [number, number];
            expect(fromFn()).toEqual([0, 50]);
        });
    });

    describe('disabled behavior', () => {
        it('should cancel and return memo when disabled', () => {
            render(
                <PullToRefresh disabled>
                    <div>Content</div>
                </PullToRefresh>
            );

            const cancelFn = vi.fn();
            const state = createDragState({ cancel: cancelFn, memo: 42 });
            let result: number | undefined;
            act(() => {
                result = capturedDragCallback!(state);
            });

            expect(cancelFn).toHaveBeenCalled();
            expect(result).toBe(42);
        });
    });

    describe('mouse event handling', () => {
        it('should ignore mouse pointer events', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const state = createDragState({
                event: { pointerType: 'mouse', type: 'pointerdown' } as Partial<PointerEvent>,
                movement: [0, 200],
            });
            let result: number | undefined;
            act(() => {
                result = capturedDragCallback!(state);
            });

            // Should return undefined for mouse events
            expect(result).toBeUndefined();
            expect(mockSpringApi.start).not.toHaveBeenCalled();
        });

        it('should ignore mouse-type events', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const state = createDragState({
                event: { type: 'mousedown' } as Partial<MouseEvent>,
                movement: [0, 200],
            });
            let result: number | undefined;
            act(() => {
                result = capturedDragCallback!(state);
            });

            expect(result).toBeUndefined();
        });

        it('should process touch events', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const state = createDragState({
                event: { pointerType: 'touch', type: 'pointerdown' } as Partial<PointerEvent>,
                movement: [0, 100],
                first: true,
                currentTarget: createMockElement(0),
            });
            act(() => {
                capturedDragCallback!(state);
            });

            expect(mockSpringApi.start).toHaveBeenCalled();
        });
    });

    describe('multi-touch handling', () => {
        it('should cancel on multi-touch (pinch gesture)', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const cancelFn = vi.fn();
            const state = createDragState({
                cancel: cancelFn,
                event: {
                    pointerType: 'touch',
                    type: 'touchmove',
                    touches: [{ identifier: 0 }, { identifier: 1 }] as Touch[],
                } as unknown as Partial<TouchEvent>,
                memo: 10,
            });
            let result: number | undefined;
            act(() => {
                result = capturedDragCallback!(state);
            });

            expect(cancelFn).toHaveBeenCalled();
            expect(result).toBe(10);
        });
    });

    describe('shift key handling', () => {
        it('should cancel when shift key is pressed (DevTools pinch emulation)', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const cancelFn = vi.fn();
            const state = createDragState({
                cancel: cancelFn,
                event: {
                    pointerType: 'touch',
                    type: 'pointerdown',
                    shiftKey: true,
                } as Partial<PointerEvent>,
                memo: 25,
            });
            let result: number | undefined;
            act(() => {
                result = capturedDragCallback!(state);
            });

            expect(cancelFn).toHaveBeenCalled();
            expect(result).toBe(25);
        });
    });

    describe('canceled gesture handling', () => {
        it('should reset state when gesture is canceled', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const state = createDragState({
                canceled: true,
                memo: 15,
            });
            let result: number | undefined;
            act(() => {
                result = capturedDragCallback!(state);
            });

            expect(mockSpringApi.start).toHaveBeenCalledWith({ y: 0 });
            expect(result).toBe(15);
        });
    });

    describe('initial scroll position capture', () => {
        it('should capture initial scroll position on first gesture', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const element = createMockElement(50, 800, 400);
            const state = createDragState({
                first: true,
                currentTarget: element,
                movement: [0, 100],
            });
            let result: number | undefined;
            act(() => {
                result = capturedDragCallback!(state);
            });

            // memo should be set to the scroll position (50)
            expect(result).toBe(50);
        });

        it('should detect scrollbar presence on first gesture', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            // Element with scrollbar (scrollHeight > clientHeight + 1)
            const element = createMockElement(0, 500, 400);
            const state = createDragState({
                first: true,
                currentTarget: element,
                movement: [0, 50],
            });
            act(() => {
                capturedDragCallback!(state);
            });

            // The hasScrollbar state is set internally
            expect(mockSpringApi.start).toHaveBeenCalled();
        });

        it('should detect no scrollbar when content fits', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            // Element without scrollbar (scrollHeight <= clientHeight + 1)
            const element = createMockElement(0, 400, 400);
            const state = createDragState({
                first: true,
                currentTarget: element,
                movement: [0, 50],
            });
            act(() => {
                capturedDragCallback!(state);
            });

            expect(mockSpringApi.start).toHaveBeenCalled();
        });
    });

    describe('pull down behavior', () => {
        it('should apply resistance effect when pulling at top', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const element = createMockElement(0); // At top
            const state = createDragState({
                down: true,
                first: true,
                currentTarget: element,
                movement: [0, 100],
                memo: 0,
            });
            act(() => {
                capturedDragCallback!(state);
            });

            // Should apply resistance (100 * 0.5 = 50)
            expect(mockSpringApi.start).toHaveBeenCalledWith({ y: 50, immediate: true });
        });

        it('should cap resistance at 150', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const element = createMockElement(0);
            const state = createDragState({
                down: true,
                first: true,
                currentTarget: element,
                movement: [0, 500], // Large pull
                memo: 0,
            });
            act(() => {
                capturedDragCallback!(state);
            });

            // Should be capped at 150
            expect(mockSpringApi.start).toHaveBeenCalledWith({ y: 150, immediate: true });
        });

        it('should not engage when not at top', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const element = createMockElement(100); // Scrolled down
            const state = createDragState({
                down: true,
                first: true,
                currentTarget: element,
                movement: [0, 200],
                memo: 0,
            });
            act(() => {
                capturedDragCallback!(state);
            });

            // Should reset y to 0
            expect(mockSpringApi.start).toHaveBeenCalledWith({ y: 0 });
        });

        it('should calculate effective pull distance using memo', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const element = createMockElement(0);
            const state = createDragState({
                down: true,
                currentTarget: element,
                movement: [0, 150], // Total movement
                memo: 50, // Initial scroll was at 50
            });
            act(() => {
                capturedDragCallback!(state);
            });

            // Effective Y = 150 - 50 = 100, with resistance = 50
            expect(mockSpringApi.start).toHaveBeenCalledWith({ y: 50, immediate: true });
        });
    });

    describe('ready state hysteresis', () => {
        it('should trigger ready when passing threshold', () => {
            const { rerender } = render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const element = createMockElement(0);

            // Pull past trigger threshold (180)
            const state = createDragState({
                down: true,
                first: true,
                currentTarget: element,
                movement: [0, 200],
                memo: 0,
            });
            act(() => {
                capturedDragCallback!(state);
            });

            // Rerender to check state update
            rerender(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            // Ready state triggers "Release to Refresh" text
            expect(screen.getByText('Release to Refresh')).toBeDefined();
        });

        it('should cancel ready when below cancel threshold', async () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const element = createMockElement(0);

            // First pull past threshold
            act(() => {
                capturedDragCallback!(createDragState({
                    down: true,
                    first: true,
                    currentTarget: element,
                    movement: [0, 200],
                    memo: 0,
                }));
            });

            // Should now be ready
            expect(screen.getByText('Release to Refresh')).toBeDefined();

            // Pull back below cancel threshold (140)
            act(() => {
                capturedDragCallback!(createDragState({
                    down: true,
                    currentTarget: element,
                    movement: [0, 100],
                    memo: 0,
                }));
            });

            // Should no longer be ready
            expect(screen.getByText('Pull to Refresh')).toBeDefined();
        });

        it('should maintain ready state between thresholds (hysteresis)', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const element = createMockElement(0);

            // Pull past trigger threshold
            act(() => {
                capturedDragCallback!(createDragState({
                    down: true,
                    first: true,
                    currentTarget: element,
                    movement: [0, 200],
                    memo: 0,
                }));
            });

            expect(screen.getByText('Release to Refresh')).toBeDefined();

            // Pull back to between thresholds (between 140 and 180)
            act(() => {
                capturedDragCallback!(createDragState({
                    down: true,
                    currentTarget: element,
                    movement: [0, 160],
                    memo: 0,
                }));
            });

            // Should still be ready due to hysteresis
            expect(screen.getByText('Release to Refresh')).toBeDefined();
        });
    });

    describe('release behavior', () => {
        let originalLocation: Location;

        beforeEach(() => {
            originalLocation = window.location;
            // Mock window.location.reload
            Object.defineProperty(window, 'location', {
                value: { reload: vi.fn() },
                writable: true,
            });
        });

        afterEach(() => {
            Object.defineProperty(window, 'location', {
                value: originalLocation,
                writable: true,
            });
        });

        it('should trigger reload when released while ready', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const element = createMockElement(0);

            // Pull to ready state
            act(() => {
                capturedDragCallback!(createDragState({
                    down: true,
                    first: true,
                    currentTarget: element,
                    movement: [0, 200],
                    memo: 0,
                }));
            });

            // Release
            act(() => {
                capturedDragCallback!(createDragState({
                    down: false,
                    currentTarget: element,
                    movement: [0, 200],
                    memo: 0,
                }));
            });

            expect(mockSpringApi.start).toHaveBeenCalledWith({ y: 60 });
            expect(window.location.reload).toHaveBeenCalled();
        });

        it('should reset when released while not ready', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const element = createMockElement(0);

            // Pull but not enough to be ready
            act(() => {
                capturedDragCallback!(createDragState({
                    down: true,
                    first: true,
                    currentTarget: element,
                    movement: [0, 100],
                    memo: 0,
                }));
            });

            // Release
            act(() => {
                capturedDragCallback!(createDragState({
                    down: false,
                    currentTarget: element,
                    movement: [0, 100],
                    memo: 0,
                }));
            });

            expect(mockSpringApi.start).toHaveBeenCalledWith({ y: 0 });
            expect(window.location.reload).not.toHaveBeenCalled();
        });
    });

    describe('scroll handling', () => {
        it('should call onScroll prop when scrolling', () => {
            const onScroll = vi.fn();
            const { container } = render(
                <PullToRefresh onScroll={onScroll}>
                    <div>Content</div>
                </PullToRefresh>
            );

            const scrollContainer = container.firstChild as HTMLElement;
            fireEvent.scroll(scrollContainer, { target: { scrollTop: 50 } });

            expect(onScroll).toHaveBeenCalled();
        });

        it('should reset ready state when scrolled down', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const element = createMockElement(0);

            // Get to ready state
            act(() => {
                capturedDragCallback!(createDragState({
                    down: true,
                    first: true,
                    currentTarget: element,
                    movement: [0, 200],
                    memo: 0,
                }));
            });

            expect(screen.getByText('Release to Refresh')).toBeDefined();

            // Simulate a reset from the not-at-top branch
            act(() => {
                const scrolledElement = createMockElement(50); // Now scrolled
                capturedDragCallback!(createDragState({
                    down: true,
                    currentTarget: scrolledElement,
                    movement: [0, 200],
                    memo: 0,
                }));
            });

            // Should be reset because element is scrolled
            expect(screen.getByText('Pull to Refresh')).toBeDefined();
        });

        it('should reset y position when scrolled down', () => {
            mockY.get.mockReturnValue(50);

            const { container } = render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const scrollContainer = container.firstChild as HTMLElement;
            Object.defineProperty(scrollContainer, 'scrollTop', { value: 100, configurable: true });
            fireEvent.scroll(scrollContainer);

            expect(mockSpringApi.start).toHaveBeenCalledWith({ y: 0 });
        });

        it('should reset ready state via handleScroll when scrolled down from ready state', () => {
            mockY.get.mockReturnValue(30);

            const { container } = render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const element = createMockElement(0);

            // First get to ready state
            act(() => {
                capturedDragCallback!(createDragState({
                    down: true,
                    first: true,
                    currentTarget: element,
                    movement: [0, 200],
                    memo: 0,
                }));
            });

            expect(screen.getByText('Release to Refresh')).toBeDefined();
            mockSpringApi.start.mockClear();

            // Now scroll down (simulating a concurrent scroll event)
            const scrollContainer = container.firstChild as HTMLElement;
            Object.defineProperty(scrollContainer, 'scrollTop', { value: 50, configurable: true });
            fireEvent.scroll(scrollContainer);

            // Should reset y and ready state
            expect(mockSpringApi.start).toHaveBeenCalledWith({ y: 0 });
            expect(screen.getByText('Pull to Refresh')).toBeDefined();
        });
    });

    describe('haptic feedback', () => {
        it('should trigger vibration when ready state becomes true', () => {
            const vibrateMock = vi.fn();
            Object.defineProperty(navigator, 'vibrate', {
                value: vibrateMock,
                configurable: true,
            });

            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const element = createMockElement(0);

            // Pull to ready state
            act(() => {
                capturedDragCallback!(createDragState({
                    down: true,
                    first: true,
                    currentTarget: element,
                    movement: [0, 200],
                    memo: 0,
                }));
            });

            expect(vibrateMock).toHaveBeenCalledWith(50);
        });

        it('should not crash if vibration fails', () => {
            const vibrateMock = vi.fn().mockImplementation(() => {
                throw new Error('Vibration blocked');
            });
            Object.defineProperty(navigator, 'vibrate', {
                value: vibrateMock,
                configurable: true,
            });

            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const element = createMockElement(0);

            // Should not throw
            expect(() => {
                act(() => {
                    capturedDragCallback!(createDragState({
                        down: true,
                        first: true,
                        currentTarget: element,
                        movement: [0, 200],
                        memo: 0,
                    }));
                });
            }).not.toThrow();
        });

        it('should not vibrate if navigator.vibrate is not available', () => {
            const originalVibrate = navigator.vibrate;
            Object.defineProperty(navigator, 'vibrate', {
                value: undefined,
                configurable: true,
            });

            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const element = createMockElement(0);

            // Should not throw
            expect(() => {
                act(() => {
                    capturedDragCallback!(createDragState({
                        down: true,
                        first: true,
                        currentTarget: element,
                        movement: [0, 200],
                        memo: 0,
                    }));
                });
            }).not.toThrow();

            Object.defineProperty(navigator, 'vibrate', {
                value: originalVibrate,
                configurable: true,
            });
        });
    });

    describe('hideScrollbars prop', () => {
        it('should apply mobile-scrollbar-hide class when hideScrollbars is true and pulling', () => {
            const { container } = render(
                <PullToRefresh hideScrollbars>
                    <div>Content</div>
                </PullToRefresh>
            );

            const element = createMockElement(0, 400, 400); // No scrollbar

            // Start pulling
            act(() => {
                capturedDragCallback!(createDragState({
                    down: true,
                    first: true,
                    currentTarget: element,
                    movement: [0, 50],
                    memo: 0,
                }));
            });

            expect((container.firstChild as HTMLElement).className).toContain('mobile-scrollbar-hide');
        });

        it('should not apply mobile-scrollbar-hide class when not pulling', () => {
            const { container } = render(
                <PullToRefresh hideScrollbars>
                    <div>Content</div>
                </PullToRefresh>
            );

            expect((container.firstChild as HTMLElement).className).not.toContain('mobile-scrollbar-hide');
        });
    });

    describe('negative pull handling', () => {
        it('should not engage when effectiveY is negative (pushing)', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const element = createMockElement(0);
            const state = createDragState({
                down: true,
                currentTarget: element,
                movement: [0, -50], // Pushing up
                memo: 0,
            });
            capturedDragCallback!(state);

            // Should reset
            expect(mockSpringApi.start).toHaveBeenCalledWith({ y: 0 });
        });
    });

    describe('loading state', () => {
        it('should ignore drag events while loading', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            const element = createMockElement(0);

            // Get to ready state and release to trigger loading
            act(() => {
                capturedDragCallback!(createDragState({
                    down: true,
                    first: true,
                    currentTarget: element,
                    movement: [0, 200],
                    memo: 0,
                }));
            });

            // Mock window.location.reload
            Object.defineProperty(window, 'location', {
                value: { reload: vi.fn() },
                writable: true,
            });

            act(() => {
                capturedDragCallback!(createDragState({
                    down: false,
                    currentTarget: element,
                    movement: [0, 200],
                    memo: 0,
                }));
            });

            // Now in loading state, clear mocks
            mockSpringApi.start.mockClear();

            // Try to drag again - should return early
            const result = capturedDragCallback!(createDragState({
                down: true,
                currentTarget: element,
                movement: [0, 100],
                memo: 0,
            }));

            // Should return undefined (early return)
            expect(result).toBeUndefined();
        });
    });

    describe('animated styles', () => {
        it('should configure y.to for centering the indicator', () => {
            render(
                <PullToRefresh>
                    <div>Content</div>
                </PullToRefresh>
            );

            // The mock y.to should receive a transform function
            expect(mockY.to).toHaveBeenCalled();
        });
    });
});
