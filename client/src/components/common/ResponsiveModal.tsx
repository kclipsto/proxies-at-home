/**
 * ResponsiveModal - A responsive modal component with mobile-friendly layouts
 *
 * Features:
 * - Centered on desktop (lg+), near full-screen on mobile
 * - Optional side-by-side layout on mobile landscape
 * - Backdrop blur and click-outside-to-close
 * - Portal rendering to document body
 */
import { useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface ResponsiveModalProps {
    /** Whether the modal is visible */
    isOpen: boolean;
    /** Called when modal should close (backdrop click, escape key, close button) */
    onClose: () => void;
    /** Modal content */
    children: ReactNode;
    /** Modal title shown in header (optional if using custom header) */
    title?: ReactNode;
    /** Use side-by-side layout on mobile landscape (header becomes sidebar) */
    mobileLandscapeSidebar?: boolean;
    /** Additional className for the modal container */
    className?: string;
    /** Custom header content (replaces default title/close button) */
    header?: ReactNode;
    /** Z-index for the modal (default: z-10000) */
    zIndex?: 'z-10000' | 'z-100000' | 'z-200000';
}

export function ResponsiveModal({
    isOpen,
    onClose,
    children,
    title,
    mobileLandscapeSidebar = false,
    className = '',
    header,
    zIndex = 'z-10000',
}: ResponsiveModalProps) {
    // Handle escape key to close
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Handle backdrop click
    const handleBackdropClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }, [onClose]);

    if (!isOpen) return null;

    // Build container classes
    const containerClasses = [
        // Base styles
        'relative bg-gray-50 dark:bg-gray-700 rounded-2xl shadow-2xl overflow-hidden',
        // Both mobile and Desktop: near full-screen with larger gap (Mobile: 1rem margin, Desktop: 2rem margin)
        'w-[calc(100%-2rem)] h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] max-h-[calc(100%-2rem)] lg:w-[calc(100%-4rem)] lg:h-[calc(100%-4rem)] lg:max-w-[calc(100%-4rem)] lg:max-h-[calc(100%-4rem)]',
        // Flex layout
        'flex flex-col',
        // Mobile landscape sidebar layout (optional)
        mobileLandscapeSidebar && 'max-lg:landscape:flex-row',
        // Custom className
        className,
    ].filter(Boolean).join(' ');

    return createPortal(
        <div
            className={`fixed inset-0 ${zIndex} flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 lg:p-0`}
            onClick={handleBackdropClick}
        >
            <div
                className={containerClasses}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Floating close button for mobile landscape (when sidebar mode) */}
                {mobileLandscapeSidebar && (
                    /* Floating close button - hidden in sidebar mode as sidebar has its own close button */
                    <button
                        onClick={onClose}
                        className="hidden absolute top-3 right-3 z-50 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-full shadow-sm hover:shadow-md transition-all"
                        aria-label="Close modal"
                    >
                        <X className="w-5 h-5" />
                    </button>
                )}

                {/* Custom header or default header */}
                {header ? header : title && (
                    <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-600">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {title}
                        </h3>
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            aria-label="Close modal"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                )}

                {/* Modal content */}
                {children}
            </div>
        </div>,
        document.body
    );
}

