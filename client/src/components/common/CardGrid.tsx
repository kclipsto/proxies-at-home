import { forwardRef, type HTMLAttributes, type ReactNode, useMemo } from 'react';

interface CardGridProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
    className?: string;
    /** Card size multiplier for desktop (1.0 = 250px, 0.5 = 125px, 2.0 = 500px). Default: 1.0 */
    cardSize?: number;
}

/**
 * A responsive grid component for displaying artwork cards.
 * 
 * Layout:
 * - Mobile portrait: 2 fixed columns
 * - Mobile landscape: auto-fill 100px columns
 * - Desktop: auto-fill columns (default 180px, adjustable via cardSize prop)
 * 
 * Gap:
 * - Mobile: gap-2
 * - Desktop: gap-4
 */
export const CardGrid = forwardRef<HTMLDivElement, CardGridProps>(({ children, className = '', cardSize = 1.0, ...props }, ref) => {
    const desktopColumnWidth = useMemo(() => Math.round(275 * cardSize), [cardSize]);

    // Use CSS custom property to set grid column width dynamically on desktop
    const gridStyle = useMemo(() => ({
        '--card-grid-col-width': `${desktopColumnWidth}px`,
    } as React.CSSProperties), [desktopColumnWidth]);

    return (
        <div
            ref={ref}
            className={`grid grid-cols-2 max-lg:landscape:grid-cols-[repeat(auto-fill,100px)] lg:grid-cols-[repeat(auto-fill,var(--card-grid-col-width,250px))] gap-2 lg:gap-4 justify-center ${className}`}
            style={{ ...gridStyle, ...props.style }}
            {...props}
        >
            {children}
        </div>
    );
});

CardGrid.displayName = 'CardGrid';
