import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

interface CardGridProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
    className?: string;
}

/**
 * A responsive grid component for displaying artwork cards.
 * 
 * Layout:
 * - Mobile portrait: 2 fixed columns
 * - Mobile landscape: auto-fill 100px columns
 * - Desktop: auto-fill 180px columns
 * 
 * Gap:
 * - Mobile: gap-2
 * - Desktop: gap-4
 */
export const CardGrid = forwardRef<HTMLDivElement, CardGridProps>(({ children, className = '', ...props }, ref) => {
    return (
        <div
            ref={ref}
            className={`grid grid-cols-2 max-lg:landscape:grid-cols-[repeat(auto-fill,100px)] lg:grid-cols-[repeat(auto-fill,180px)] gap-2 lg:gap-4 justify-center ${className}`}
            {...props}
        >
            {children}
        </div>
    );
});

CardGrid.displayName = 'CardGrid';
