import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResizeHandle } from './ResizeHandle';

describe('ResizeHandle', () => {
    const mockOnToggle = vi.fn();
    const mockOnResizeStart = vi.fn();
    const mockOnReset = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('rendering', () => {
        it('should render a button with chevron icon', () => {
            render(
                <ResizeHandle onToggle={mockOnToggle} onResizeStart={mockOnResizeStart} />
            );
            expect(screen.getByRole('button')).toBeDefined();
        });

        it('should apply custom className', () => {
            const { container } = render(
                <ResizeHandle
                    onToggle={mockOnToggle}
                    onResizeStart={mockOnResizeStart}
                    className="custom-class"
                />
            );
            expect(container.firstChild).toBeDefined();
            expect((container.firstChild as HTMLElement).className).toContain('custom-class');
        });
    });

    describe('toggle behavior', () => {
        it('should call onToggle when button is clicked', () => {
            render(
                <ResizeHandle onToggle={mockOnToggle} onResizeStart={mockOnResizeStart} />
            );
            fireEvent.click(screen.getByRole('button'));
            expect(mockOnToggle).toHaveBeenCalledTimes(1);
        });

        it('should stop propagation when button is clicked', () => {
            render(
                <ResizeHandle onToggle={mockOnToggle} onResizeStart={mockOnResizeStart} />
            );
            const button = screen.getByRole('button');
            const clickEvent = new MouseEvent('click', { bubbles: true });
            const stopPropagationSpy = vi.spyOn(clickEvent, 'stopPropagation');
            button.dispatchEvent(clickEvent);
            expect(stopPropagationSpy).toHaveBeenCalled();
        });
    });

    describe('resize behavior', () => {
        it('should call onResizeStart when container is mouse down', () => {
            const { container } = render(
                <ResizeHandle onToggle={mockOnToggle} onResizeStart={mockOnResizeStart} />
            );
            fireEvent.mouseDown(container.firstChild as Element);
            expect(mockOnResizeStart).toHaveBeenCalledTimes(1);
        });
    });

    describe('reset behavior', () => {
        it('should call onReset on double click', () => {
            const { container } = render(
                <ResizeHandle
                    onToggle={mockOnToggle}
                    onResizeStart={mockOnResizeStart}
                    onReset={mockOnReset}
                />
            );
            fireEvent.doubleClick(container.firstChild as Element);
            expect(mockOnReset).toHaveBeenCalledTimes(1);
        });

        it('should not throw if onReset is not provided on double click', () => {
            const { container } = render(
                <ResizeHandle onToggle={mockOnToggle} onResizeStart={mockOnResizeStart} />
            );
            expect(() => {
                fireEvent.doubleClick(container.firstChild as Element);
            }).not.toThrow();
        });
    });

    describe('rotation classes', () => {
        it('should apply rotate-180 when collapsed on right side', () => {
            render(
                <ResizeHandle
                    onToggle={mockOnToggle}
                    onResizeStart={mockOnResizeStart}
                    isCollapsed={true}
                    side="right"
                />
            );
            const button = screen.getByRole('button');
            expect(button.className).toContain('rotate-180');
        });

        it('should not apply rotation when expanded on right side', () => {
            render(
                <ResizeHandle
                    onToggle={mockOnToggle}
                    onResizeStart={mockOnResizeStart}
                    isCollapsed={false}
                    side="right"
                />
            );
            const button = screen.getByRole('button');
            expect(button.className).not.toContain('rotate-180');
        });

        it('should apply rotate-180 when expanded on left side', () => {
            render(
                <ResizeHandle
                    onToggle={mockOnToggle}
                    onResizeStart={mockOnResizeStart}
                    isCollapsed={false}
                    side="left"
                />
            );
            const button = screen.getByRole('button');
            expect(button.className).toContain('rotate-180');
        });

        it('should not apply rotation when collapsed on left side', () => {
            render(
                <ResizeHandle
                    onToggle={mockOnToggle}
                    onResizeStart={mockOnResizeStart}
                    isCollapsed={true}
                    side="left"
                />
            );
            const button = screen.getByRole('button');
            expect(button.className).not.toContain('rotate-180');
        });
    });
});
