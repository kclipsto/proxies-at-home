/**
 * Unified loading screen component used across all Suspense boundaries.
 * Shows the app logo with a spinning border for a consistent loading experience.
 * Uses inline styles to ensure proper dark/light mode even before Tailwind CSS loads.
 */
export function LoadingScreen() {
    // Check color scheme preference for inline styles (works before Tailwind loads)
    const isDark = typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

    return (
        <div
            className="h-full w-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900"
            style={{ backgroundColor: isDark ? '#111827' : '#f9fafb' }}
        >
            <div className="relative flex items-center justify-center">
                <div className="absolute w-40 h-40 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                <img src="/logo.svg" alt="Loading..." className="w-24 h-24 animate-pulse" />
            </div>
        </div>
    );
}
