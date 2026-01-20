/**
 * PlaceholderCard - Reusable card placeholder for loading and error states
 * 
 * Shows a loading spinner when no error, or an error message with action button when error is provided.
 */

import { memo } from "react";

export interface PlaceholderCardProps {
    /** Card name to display in error state */
    name?: string;
    /** Error message - if set, shows error state instead of loading */
    error?: string;
    /** Click handler for error state "Click to replace" button */
    onErrorClick?: (e: React.MouseEvent) => void;
    /** Additional class names */
    className?: string;
}

/**
 * A placeholder card component that displays either:
 * - A loading spinner (when `error` is undefined)
 * - An error state with card name, message, and action button (when `error` is set)
 */
export const PlaceholderCard = memo(function PlaceholderCard({
    name,
    error,
    onErrorClick,
    className = "",
}: PlaceholderCardProps) {
    const isError = !!error;

    return (
        <div
            className={`absolute inset-0 rounded-lg flex flex-col items-center justify-center z-5 bg-black ${isError ? 'cursor-pointer pointer-events-auto' : 'pointer-events-none'
                } ${className}`}
            onClick={isError ? onErrorClick : undefined}
        >
            {isError ? (
                <>
                    <div className="text-white text-center px-2 text-xs leading-tight max-w-full">
                        <div className="font-medium mb-1 truncate" title={name}>
                            &ldquo;{name}&rdquo;
                        </div>
                        <div className="text-gray-400">not found</div>
                    </div>
                    <div className="mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded-full transition-colors">
                        Click to replace
                    </div>
                </>
            ) : (
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-transparent" />
            )}
        </div>
    );
});

export default PlaceholderCard;
