import { useState, useRef, useEffect } from "react";
import { ZoomIn } from "lucide-react";
import { ZoomControls } from "../PageView/ZoomControls";
import { useOnClickOutside } from "@/hooks/useOnClickOutside";

interface FloatingZoomPanelProps {
    /** Current zoom level */
    zoom: number;
    /** Callback when zoom changes */
    onZoomChange: (zoom: number) => void;
    /** Minimum zoom level */
    minZoom?: number;
    /** Maximum zoom level */
    maxZoom?: number;
    /** Position of the panel */
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    /** Additional CSS classes for the container */
    className?: string;
    /** Inline styles for the container */
    style?: React.CSSProperties;
}

/**
 * Floating zoom control panel with hover reveal and click toggle.
 * Shows a compact button with zoom level, expands to full slider on hover/click.
 * Reusable across modals, page views, and editors.
 */
export function FloatingZoomPanel({
    zoom,
    onZoomChange,
    minZoom = 0.5,
    maxZoom = 2,
    position = 'bottom-right',
    className = '',
    style,
}: FloatingZoomPanelProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    useOnClickOutside(panelRef, () => setIsExpanded(false));

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isExpanded) {
                setIsExpanded(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isExpanded]);

    const positionClasses = {
        'bottom-right': 'bottom-4 right-4',
        'bottom-left': 'bottom-4 left-4',
        'top-right': 'top-4 right-4',
        'top-left': 'top-4 left-4',
    }[position];

    return (
        <div
            ref={panelRef}
            className={`group absolute ${positionClasses} z-30 ${className}`}
            style={style}
        >
            {/* Icon-only collapsed state - fades out on hover */}
            <div
                className={`absolute bottom-0 right-0 flex items-center gap-2 p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg cursor-pointer transition-opacity duration-300 ${isExpanded ? 'opacity-0 pointer-events-none' : 'opacity-70 group-hover:opacity-0'}`}
                onClick={() => setIsExpanded(true)}
            >
                <ZoomIn className="size-5 text-gray-600 dark:text-gray-300" />
                <span className="text-sm text-gray-600 dark:text-gray-300">{zoom.toFixed(1)}x</span>
            </div>

            {/* Full controls - shows on hover or when expanded */}
            <div className={`bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-3 min-w-[200px] transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto'}`}>
                <ZoomControls
                    zoom={zoom}
                    onZoomChange={onZoomChange}
                    minZoom={minZoom}
                    maxZoom={maxZoom}
                />
            </div>
        </div>
    );
}
