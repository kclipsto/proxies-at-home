import React from 'react';

interface FilterBarShellProps {
    children: React.ReactNode;
    className?: string;
}

/**
 * Shared shell component for filter bars to ensure consistent styling.
 * Handles the sticky positioning, background, border, shadow, and scrollable container.
 */
export const FilterBarShell: React.FC<FilterBarShellProps> = ({ children, className = '' }) => {
    return (
        <div className={`sticky top-0 z-40 shadow-md bg-gray-100 dark:bg-gray-800 rounded-lg text-sm border border-gray-200 dark:border-gray-700 ${className}`}>
            <div className="flex flex-wrap sm:flex-nowrap sm:overflow-x-auto items-center gap-2 p-2 scrollbar-hide">
                {children}
            </div>
        </div>
    );
};
